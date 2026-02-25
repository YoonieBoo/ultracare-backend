// routes/admin.js
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

// Optional: fallback if devices are still in SQLite
let db = null;
try {
  db = require("../db");
} catch (e) {
  db = null;
}

const router = express.Router();

function toPercent(confidence) {
  if (confidence == null) return null;
  const n = Number(confidence);
  if (Number.isNaN(n)) return null;
  // if stored as 0.88 -> 88%, if stored as 88 -> 88%
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

/**
 * GET /api/admin/stats
 * Platform-wide metrics + recent alerts for the admin dashboard
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

    const alertsToday = await prisma.alert.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });

    // IMPORTANT:
    // We include resident -> device -> user to get:
    // - residentName
    // - deviceId (Device.deviceId)
    // - householdName (User.email, or you can change to userId)
    const rawAlerts = await prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        resident: {
          include: {
            device: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    const recentAlerts = rawAlerts.map((a) => {
      const residentName = a.resident?.name || a.elderly || "-";
      const deviceId = a.resident?.device?.deviceId || "-";
      const householdName = a.resident?.device?.user?.email || "-";

      return {
        id: a.id,
        timestamp: a.createdAt, // frontend uses alert.timestamp
        deviceId, // frontend shows this in Device ID column
        householdName, // frontend shows this in Household column
        residentName, // frontend shows this in Resident column
        type: a.type,
        confidence: toPercent(a.confidence), // frontend already prints "%"
        status: String(a.status || "").toUpperCase(),
      };
    });

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
    // Prisma path (preferred)
    if (prisma.device && typeof prisma.device.findMany === "function") {
      const devices = await prisma.device.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: true,
        },
      });

      return res.json({ ok: true, count: devices.length, devices });
    }

    // SQLite fallback
    if (db) {
      const devices = db.prepare(`SELECT * FROM devices ORDER BY createdAt DESC`).all();
      return res.json({ ok: true, count: devices.length, devices });
    }

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

router.get("/falls/monthly", requireAuth, async (req, res) => {
  try {
    const year = new Date().getFullYear();

    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year}-12-31T23:59:59.999Z`);

    const alerts = await prisma.alert.findMany({
      where: {
        type: "FALL_DETECTED",
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        createdAt: true,
      },
    });

    const monthlyCounts = Array(12).fill(0);

    alerts.forEach((alert) => {
      const month = new Date(alert.createdAt).getMonth();
      monthlyCounts[month]++;
    });

    return res.json({
      ok: true,
      year,
      data: monthlyCounts,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch monthly fall stats",
    });
  }
});

module.exports = router;