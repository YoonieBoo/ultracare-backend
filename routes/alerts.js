const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

function toIsoTimestamp(createdAt) {
  if (!createdAt) return null;
  if (createdAt instanceof Date) return createdAt.toISOString();

  const s = String(createdAt);

  // already ISO
  if (s.includes("T")) return s;

  // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ssZ"
  if (s.includes(" ") && s.length >= 19) return s.replace(" ", "T") + "Z";

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);
// =========================
// GET /api/alerts
// =========================
router.get("/", async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        resident: true,
      },
    });

    const safeAlerts = alerts.map((a) => ({
      id: a.id,
      type: a.type,
      room: a.room,
      confidence: a.confidence,
      time: a.time,
      status: a.status,
      createdAt: dayjs(a.createdAt)
  .tz("Asia/Bangkok")
  .format("YYYY-MM-DD HH:mm:ss"),
      mediaUrl: a.mediaUrl,
      source: a.source,

      // Always show a name
      displayName: a.resident?.name || a.elderly || "Unknown",

      // Tell frontend if resident still exists
      residentExists: !!a.resident,

      residentId: a.residentId,
    }));

    return res.json(safeAlerts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch alerts" });
  }
});


// =========================
// GET /api/alerts/latest
// =========================
router.get("/latest", async (req, res) => {
  try {
    const latest = await prisma.alert.findFirst({
      orderBy: { createdAt: "desc" },
      include: { resident: true },
    });

    if (!latest) return res.json([]);
    

   return res.json([
  {
    id: latest.id,
    elderly: latest.elderly,
    room: latest.room,
    type: latest.type,
    confidence: latest.confidence,
    status: latest.status,
    time: latest.time,
    mediaUrl: latest.mediaUrl,
    source: latest.source,
    acknowledgedAt: latest.acknowledgedAt,
    resolvedAt: latest.resolvedAt,
    residentId: latest.residentId,
    resident: latest.resident,

    createdAt: dayjs(latest.createdAt)
      .tz("Asia/Bangkok")
      .format("YYYY-MM-DD HH:mm:ss"),

    displayName: latest.resident?.name || latest.elderly || "Unknown",
    residentExists: !!latest.resident,
  }
]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch latest alert" });
  }
});


// =========================
// GET /api/alerts/:id
// =========================
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { resident: true },
    });

    if (!alert) {
      return res.status(404).json({ ok: false, error: "Alert not found" });
    }

    return res.json({
      ...alert,
      residentDisplayName: alert.resident
        ? alert.resident.name
        : "Resident deleted",
      residentExists: !!alert.resident,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch alert" });
  }
});


// =========================
// PATCH /api/alerts/:id
// =========================
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    const allowed = ["New", "Acknowledged", "Resolved"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updateData = { status };

    if (status === "Acknowledged") {
      updateData.acknowledgedAt = new Date();
    }

    if (status === "Resolved") {
      updateData.resolvedAt = new Date();
    }

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


module.exports = router;
