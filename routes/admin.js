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
    let recentAlerts = [];

    if (prisma.event && typeof prisma.event.count === "function") {
      alertsToday = await prisma.event.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });

      recentAlerts = await prisma.event.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    } else if (prisma.alert && typeof prisma.alert.count === "function") {
      alertsToday = await prisma.alert.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });

      recentAlerts = await prisma.alert.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }

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