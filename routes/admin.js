// routes/admin.js
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

// Optional: fallback if devices are still in SQLite
let db = null;
try {
  db = require("../db"); // your existing sqlite db helper
} catch (e) {
  db = null;
}

const router = express.Router();

function toUpperSafe(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeConfidence(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;

  // common cases:
  // 0.88 -> 88
  // 88 -> 88
  // 0.7822... -> 78
  if (n <= 1) return Math.round(n * 100);
  if (n <= 100) return Math.round(n);
  return Math.round(n); // fallback
}

function normalizeRecentAlertShape(e, deviceById, deviceByDeviceId, userById, residentById) {
  const createdAt = e.createdAt || e.timestamp || e.time || null;

  // event might store:
  // - deviceId as FK number -> match prisma.device.id
  // - deviceId as string (like "CAM-001") -> match prisma.device.deviceId
  const rawDeviceId = e.deviceId ?? e.deviceID ?? e.device ?? null;

  let deviceRow = null;
  if (typeof rawDeviceId === "number" && deviceById) {
    deviceRow = deviceById.get(rawDeviceId) || null;
  } else if (typeof rawDeviceId === "string" && deviceByDeviceId) {
    deviceRow = deviceByDeviceId.get(rawDeviceId) || null;
  }

  // household could be userId on device, or householdName directly on event
  const householdName =
    e.householdName ||
    e.household ||
    (deviceRow?.userId && userById ? userById.get(deviceRow.userId)?.email : null) ||
    (deviceRow?.user?.email ?? null) ||
    "-";

  // resident could be residentId, or residentName, or elderly
  const residentId = e.residentId ?? e.residentID ?? null;
  const residentName =
    e.residentName ||
    e.elderly ||
    e.resident ||
    (residentId && residentById ? residentById.get(residentId)?.name : null) ||
    "-";

  // prefer showing human deviceId string (like CAM-TEST-3)
  const displayDeviceId =
    e.deviceCode ||
    e.deviceIdentifier ||
    (deviceRow?.deviceId ?? null) ||
    (typeof rawDeviceId === "string" ? rawDeviceId : null) ||
    "-";

  const type = e.type || e.alertType || e.eventType || "-";
  const status = toUpperSafe(e.status || "NEW");

  return {
    id: e.id,
    timestamp: createdAt, // dashboard uses timestamp
    deviceId: displayDeviceId,
    householdName,
    residentName,
    type,
    confidence: normalizeConfidence(e.confidence),
    status,
  };
}

/**
 * GET /api/admin/stats
 * Platform-wide metrics for the admin dashboard
 */
router.get("/stats", requireAuth, async (req, res) => {
  try {
    // 1) TOTAL USERS (Household Admins)
    const totalHouseholdAdmins = await prisma.user.count();

    // 2) ACTIVE PRO SUBSCRIPTIONS
    const activeProSubscriptions = await prisma.subscription.count({
      where: { plan: "PRO", status: "ACTIVE" },
    });

    // 3) TOTAL DEVICES (platform-wide)
    let totalDevices = 0;

    if (prisma.device && typeof prisma.device.count === "function") {
      totalDevices = await prisma.device.count();
    } else if (db) {
      const row = db.prepare(`SELECT COUNT(*) as c FROM devices`).get();
      totalDevices = row?.c ?? 0;
    }

    // 4) ALERTS TODAY + RECENT ALERTS
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    let alertsToday = 0;
    let recentAlertsRaw = [];

    // We’ll normalize recentAlerts to match the dashboard UI shape:
    // { id, timestamp, deviceId, householdName, residentName, type, confidence, status }
    let recentAlerts = [];

    // ---------- Prisma Event path ----------
    if (prisma.event && typeof prisma.event.count === "function") {
      alertsToday = await prisma.event.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });

      recentAlerts = await prisma.alert.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  include: {
    resident: true,
    device: true,
  },
});
    }
    // ---------- Prisma Alert path ----------
    else if (prisma.alert && typeof prisma.alert.count === "function") {
      alertsToday = await prisma.alert.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });

      recentAlertsRaw = await prisma.alert.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }

    // Enrich recentAlerts with device + household + resident (best-effort, no crashing)
    const deviceById = new Map();
    const deviceByDeviceId = new Map();
    const userById = new Map();
    const residentById = new Map();

    try {
      // Collect possible device keys from alerts
      const numericDeviceIds = [];
      const stringDeviceIds = [];

      for (const e of recentAlertsRaw) {
        const d = e.deviceId ?? e.deviceID ?? e.device ?? null;
        if (typeof d === "number") numericDeviceIds.push(d);
        if (typeof d === "string") stringDeviceIds.push(d);
      }

      // Load devices (if prisma.device exists)
      if (prisma.device && typeof prisma.device.findMany === "function") {
        const whereOR = [];
        if (numericDeviceIds.length) whereOR.push({ id: { in: Array.from(new Set(numericDeviceIds)) } });
        if (stringDeviceIds.length) whereOR.push({ deviceId: { in: Array.from(new Set(stringDeviceIds)) } });

        if (whereOR.length) {
          const devices = await prisma.device.findMany({
            where: { OR: whereOR },
          });

          for (const d of devices) {
            if (typeof d.id === "number") deviceById.set(d.id, d);
            if (d.deviceId) deviceByDeviceId.set(d.deviceId, d);
          }

          // Collect userIds from devices
          const userIds = devices.map((d) => d.userId).filter((v) => typeof v === "number");
          if (userIds.length && prisma.user && typeof prisma.user.findMany === "function") {
            const users = await prisma.user.findMany({
              where: { id: { in: Array.from(new Set(userIds)) } },
              select: { id: true, email: true },
            });
            for (const u of users) userById.set(u.id, u);
          }
        }
      }

      // Collect residentIds from alerts (optional)
      const residentIds = recentAlertsRaw
        .map((e) => e.residentId ?? e.residentID ?? null)
        .filter((v) => typeof v === "number");

      if (residentIds.length && prisma.resident && typeof prisma.resident.findMany === "function") {
        const residents = await prisma.resident.findMany({
          where: { id: { in: Array.from(new Set(residentIds)) } },
          select: { id: true, name: true },
        });
        for (const r of residents) residentById.set(r.id, r);
      }
    } catch (e) {
      // best-effort enrichment only; never break stats endpoint
      console.warn("[ADMIN stats] enrichment skipped:", e?.message || e);
    }

    recentAlerts = recentAlertsRaw.map((e) =>
      normalizeRecentAlertShape(e, deviceById, deviceByDeviceId, userById, residentById)
    );

    return res.json({
      ok: true,
      totalHouseholdAdmins,
      activeProSubscriptions,
      totalDevices,
      alertsToday,
      recentAlerts,
    });
  } catch (err) {
    console.error("[ADMIN stats] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * GET /api/admin/devices
 * Platform-wide device list for the admin dashboard (Devices tab)
 */
router.get("/devices", requireAuth, async (req, res) => {
  try {
    // 1) Prisma path (preferred)
    if (prisma.device && typeof prisma.device.findMany === "function") {
      const devices = await prisma.device.findMany({
        orderBy: { createdAt: "desc" },
      });
      return res.json({ ok: true, count: devices.length, devices });
    }

    // 2) SQLite fallback (if devices still stored there)
    if (db) {
      const devices = db.prepare(`SELECT * FROM devices ORDER BY createdAt DESC`).all();
      return res.json({ ok: true, count: devices.length, devices });
    }

    // 3) No device store found
    return res.json({
      ok: true,
      count: 0,
      devices: [],
      note: "No prisma.device model and no sqlite devices table available.",
    });
  } catch (err) {
    console.error("[ADMIN devices] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;