require("dotenv").config();

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const authRoutes = require("./routes/auth");
const subscriptionRoutes = require("./routes/subscription");
const appDevicesRoutes = require("./routes/appDevices");

const TZ = "Asia/Bangkok";
const fmtBKK = (d) => dayjs.utc(d).tz(TZ).format("YYYY-MM-DD HH:mm:ss");

console.log("CLOUDINARY loaded?",
  !!process.env.CLOUDINARY_CLOUD_NAME,
  !!process.env.CLOUDINARY_API_KEY,
  !!process.env.CLOUDINARY_API_SECRET,
  "secretLen=", (process.env.CLOUDINARY_API_SECRET || "").length
);

const express = require("express");
const cors = require("cors");
const pushRoutes = require("./routes/push");

const path = require("path");
const multer = require("multer");

const prisma = require("./lib/prisma");
console.log("prisma.device exists?", !!prisma.device);

const cloudinary = require("./cloudinary");


const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api/auth", authRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/app/devices", appDevicesRoutes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/debug", (req, res) => {
  res.send("NEW DEPLOY WORKING");
});


// =========================
// API KEY MIDDLEWARE
// =========================
const API_KEY = process.env.API_KEY;

function requireApiKey(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// PUBLIC health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Protect real APIs
app.use("/api/devices", requireApiKey);
app.use("/api/residents", requireApiKey);
app.use("/api/events", requireApiKey);
app.use("/api/alerts", requireApiKey);
app.use("/api/upload", requireApiKey);

app.use("/api/push", pushRoutes);

// =========================
// MULTER (UPLOAD) - Cloudinary (memory storage)
// =========================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

// =========================
// ALERT ROUTES
// =========================

// GET all alerts (safe display fields + resident info)
app.get("/api/alerts", async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { resident: true },
    });

    const safeAlerts = alerts.map((a) => ({
      id: a.id,
      type: a.type,
      room: a.room,
      confidence: a.confidence,
      time: a.time,
      status: a.status,
      createdAt: fmtBKK(a.createdAt),
      mediaUrl: a.mediaUrl,
      source: a.source,

      displayName: a.resident?.name || a.elderly || "Unknown",
      residentExists: !!a.resident,
      residentId: a.residentId,

      acknowledgedAt: a.acknowledgedAt || null,
      resolvedAt: a.resolvedAt || null,
    }));

    return res.json(safeAlerts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch alerts" });
  }
});

// GET latest alert
app.get("/api/alerts/latest", async (req, res) => {
  try {
    const latest = await prisma.alert.findFirst({
      orderBy: { createdAt: "desc" },
      include: { resident: true },
    });

    if (!latest) return res.json([]);

    return res.json([
  {
    ...latest,
    createdAt: fmtBKK(latest.createdAt),
    displayName: latest.resident?.name || latest.elderly || "Unknown",
    residentExists: !!latest.resident,
  },
]);


  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch latest alert" });
  }
});

// GET single alert (detail page)
app.get("/api/alerts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { resident: true },
    });

    if (!alert) return res.status(404).json({ ok: false, error: "Alert not found" });

    return res.json({
  ...alert,
  createdAt: fmtBKK(alert.createdAt),
  displayName: alert.resident?.name || alert.elderly || "Unknown",
  residentExists: !!alert.resident,
  residentDisplayName: alert.resident ? alert.resident.name : "Resident deleted",
});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch alert" });
  }
});

// PATCH alert status
app.patch("/api/alerts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const { status } = req.body || {};
    const allowed = ["New", "Acknowledged", "Resolved"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updateData = { status };

    if (status === "Acknowledged") updateData.acknowledgedAt = new Date();
    if (status === "Resolved") updateData.resolvedAt = new Date();

    const updated = await prisma.alert.update({
      where: { id },
      data: updateData,
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update alert" });
  }
});

// PATCH alert media (set Cloudinary URL after upload)
app.patch("/api/alerts/:id/media", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { mediaUrl } = req.body || {};
    if (!mediaUrl || typeof mediaUrl !== "string") {
      return res.status(400).json({ ok: false, error: "mediaUrl is required" });
    }

    const updated = await prisma.alert.update({
      where: { id },
      data: { mediaUrl },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to update mediaUrl" });
  }
});

// =========================
// RESIDENT ROUTES
// =========================

// GET residents
app.get("/api/residents", async (req, res) => {
  try {
    const residents = await prisma.resident.findMany({
      orderBy: { id: "asc" },
      include: { device: true }, // ✅ include linked camera
    });
    res.json(residents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch residents" });
  }
});


// POST resident
app.post("/api/residents", async (req, res) => {
  try {
    const { name, room } = req.body || {};

    if (!name || !room) {
      return res.status(400).json({ ok: false, error: "name and room are required" });
    }

    const created = await prisma.resident.create({ data: { name, room } });
    return res.json({ ok: true, created });
  } catch (err) {
    console.error(err);

    if (err.code === "P2002") {
      return res.status(409).json({ ok: false, error: "Resident name already exists" });
    }

    return res.status(500).json({ ok: false, error: "Failed to create resident" });
  }
});

// PATCH resident
app.patch("/api/residents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { name, room } = req.body || {};
    if (name === undefined && room === undefined) {
      return res.status(400).json({ ok: false, error: "Provide name or room" });
    }

    const existing = await prisma.resident.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Resident not found" });

    const updated = await prisma.resident.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(room !== undefined ? { room } : {}),
      },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);

    if (err.code === "P2002") {
      return res.status(409).json({ ok: false, error: "Resident name already exists" });
    }

    return res.status(500).json({ ok: false, error: "Failed to update resident" });
  }
});

// =========================
// ASSIGN DEVICE TO RESIDENT ✅
// =========================

app.patch("/api/residents/:id/assign-device", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { deviceId } = req.body || {};
    const did = Number(deviceId);
    if (!did) return res.status(400).json({ ok: false, error: "deviceId is required (number)" });

    // Check resident exists
    const resident = await prisma.resident.findUnique({ where: { id } });
    if (!resident) return res.status(404).json({ ok: false, error: "Resident not found" });

    // Check device exists
    const device = await prisma.device.findUnique({ where: { id: did } });
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" });

    if (device.isActive === false) {
      return res.status(409).json({ ok: false, error: "Device is disabled" });
    }

    const updated = await prisma.resident.update({
      where: { id },
      data: { deviceId: did },
      include: { device: true },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to assign device" });
  }
});
// =========================
// ASSIGN DEVICE TO RESIDENT ✅
// =========================
app.patch("/api/residents/:id/assign-device", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid resident id" });

    const { deviceId } = req.body || {};
    const deviceInt = Number(deviceId);
    if (!deviceInt) {
      return res.status(400).json({ ok: false, error: "deviceId (number) is required" });
    }

    const resident = await prisma.resident.findUnique({ where: { id } });
    if (!resident) return res.status(404).json({ ok: false, error: "Resident not found" });

    const device = await prisma.device.findUnique({ where: { id: deviceInt } });
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" });

    if (device.isActive === false) {
      return res.status(409).json({ ok: false, error: "Device is disabled (inactive)" });
    }

    // OPTIONAL safety: ensure device isn't already assigned to someone else
    const alreadyUsed = await prisma.resident.findFirst({
      where: { deviceId: deviceInt },
    });
    if (alreadyUsed && alreadyUsed.id !== id) {
      return res.status(409).json({
        ok: false,
        error: "Device already assigned to another resident",
        assignedResidentId: alreadyUsed.id,
      });
    }

    const updated = await prisma.resident.update({
      where: { id },
      data: { deviceId: deviceInt },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to assign device" });
  }
});

// =========================
// UNASSIGN DEVICE FROM RESIDENT ✅
// =========================
app.patch("/api/residents/:id/unassign-device", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const resident = await prisma.resident.findUnique({ where: { id } });
    if (!resident) return res.status(404).json({ ok: false, error: "Resident not found" });

    const updated = await prisma.resident.update({
      where: { id },
      data: { deviceId: null },
      include: { device: true },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to unassign device" });
  }
});


// DELETE resident (safe delete only if no active alerts)
app.delete("/api/residents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const existing = await prisma.resident.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Resident not found" });

    const activeCount = await prisma.alert.count({
      where: { residentId: id, status: { in: ["New", "Acknowledged"] } },
    });

    if (activeCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "Cannot delete resident with active alerts",
        activeAlerts: activeCount,
      });
    }

    await prisma.resident.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to delete resident" });
  }
});

// =========================
// DEVICE (CAMERA) ADMIN ROUTES ✅ NEW
// =========================

// GET devices (admin)
// /api/devices?includeInactive=true to show disabled devices too
app.get("/api/devices", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "") === "true";

    const devices = await prisma.device.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { id: "asc" },
    });

    return res.json(devices);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch devices" });
  }
});

// POST device (admin add camera)
app.post("/api/devices", async (req, res) => {
  try {
    const { deviceId, name, room } = req.body || {};
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "deviceId is required" });
    }

    const created = await prisma.device.create({
      data: {
        deviceId,
        name: name || null,
        room: room || null,
        isActive: true,
      },
    });

    return res.json({ ok: true, created });
  } catch (err) {
    console.error(err);

    if (err.code === "P2002") {
      return res.status(409).json({ ok: false, error: "deviceId already exists" });
    }

    return res.status(500).json({ ok: false, error: "Failed to create device" });
  }
});

// PATCH device (admin edit camera)
app.patch("/api/devices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const { name, room, isActive } = req.body || {};
    if (name === undefined && room === undefined && isActive === undefined) {
      return res.status(400).json({ ok: false, error: "Provide name, room, or isActive" });
    }

    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Device not found" });

    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name || null } : {}),
        ...(room !== undefined ? { room: room || null } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to update device" });
  }
});

// DELETE device = DISABLE (admin)
app.delete("/api/devices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Device not found" });

    const disabled = await prisma.device.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ ok: true, disabled });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to disable device" });
  }
});

// =========================
// EVENTS
// =========================

app.post("/api/events", async (req, res) => {
  try {
    const {
      elderly,
      room,
      type,
      confidence,
      time,
      mediaUrl,
      source,
      residentId: incomingResidentId,
    } = req.body || {};

    let residentId = null;
    let elderlyFinal = elderly;
    let roomFinal = room;

    if (incomingResidentId != null) {
      const rid = Number(incomingResidentId);
      if (!rid) return res.status(400).json({ ok: false, error: "Invalid residentId" });

      const r = await prisma.resident.findUnique({ where: { id: rid } });
      if (!r) return res.status(400).json({ ok: false, error: "residentId not found" });

      residentId = rid;
      elderlyFinal = r.name;
      roomFinal = r.room;
    } else if (elderly) {
      const r = await prisma.resident.findUnique({ where: { name: elderly } });
      residentId = r ? r.id : null;
    }

    if (!elderlyFinal || !roomFinal || !type || confidence == null) {
      return res.status(400).json({
        ok: false,
        error: "Required: type, confidence, and (residentId OR elderly+room)",
      });
    }

    const created = await prisma.alert.create({
      data: {
        elderly: elderlyFinal,
        room: roomFinal,
        type,
        confidence: Number(confidence),
        time:
  time ||
  dayjs().tz("Asia/Bangkok").format("hh:mm A"),
        status: "New",
        mediaUrl: mediaUrl || null,
        source: source || "pi",
        residentId,
      },
    });

    return res.json({ ok: true, alert: created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to create event" });
  }
});

// =========================
// UPLOAD
// =========================

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "ultracare/falls",
        },
        (err, uploaded) => {
          if (err) reject(err);
          else resolve(uploaded);
        }
      );

      stream.end(req.file.buffer);
    });

    return res.json({
      ok: true,
      mediaUrl: result.secure_url,
      mediaId: result.public_id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});
// =========================
// SEED
// =========================

app.post("/api/seed", async (req, res) => {
  await prisma.resident.upsert({
    where: { name: "Grandpa" },
    update: {},
    create: { name: "Grandpa", room: "Room 201" },
  });

  await prisma.resident.upsert({
    where: { name: "Grandma" },
    update: {},
    create: { name: "Grandma", room: "Room 202" },
  });

  res.json({ ok: true });
});

// =========================
// HEARTBEAT (Pi/camera check-in) ✅ respects isActive
// =========================

app.post("/api/heartbeat", async (req, res) => {
  try {
    const { deviceId, name, room } = req.body || {};
    if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId is required" });

    const existing = await prisma.device.findUnique({ where: { deviceId } });

    // If admin disabled this device, do NOT allow it to come back automatically.
    if (existing && existing.isActive === false) {
      return res.status(403).json({
        ok: false,
        error: "Device is disabled by admin",
      });
    }

    const device = await prisma.device.upsert({
      where: { deviceId },
      update: {
        name: name || undefined,
        room: room || undefined,
        lastSeenAt: new Date(),
      },
      create: {
        deviceId,
        name: name || null,
        room: room || null,
        lastSeenAt: new Date(),
        isActive: true,
      },
    });

    return res.json({ ok: true, device });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed heartbeat" });
  }
});

// =========================
// OFFLINE DETECTION ✅ only for active devices
// =========================

const OFFLINE_AFTER_MS = 2 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;

setInterval(async () => {
  try {
    const now = Date.now();

    const devices = await prisma.device.findMany({
      where: { isActive: true }, // ✅ only active devices
    });

    for (const d of devices) {
      if (!d.lastSeenAt) continue;

      const last = new Date(d.lastSeenAt).getTime();
      const offline = now - last > OFFLINE_AFTER_MS;
      if (!offline) continue;

      const existing = await prisma.alert.findFirst({
        where: {
          type: "Device offline",
          room: d.room || "Unknown",
          status: "New",
          elderly: "System",
        },
      });

      if (!existing) {
        await prisma.alert.create({
          data: {
            elderly: "System",
            room: d.room || "Unknown",
            type: "Device offline",
            confidence: 1.0,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            status: "New",
            source: "system",
            mediaUrl: null,
          },
        });
      }
    }
  } catch (err) {
    console.error("Offline checker error:", err.message);
  }
}, CHECK_EVERY_MS);

// =========================
// SERVER START
// =========================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
