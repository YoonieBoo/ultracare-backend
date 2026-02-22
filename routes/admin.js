// routes/admin.js
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

// If your devices are still in SQLite (db.js), we can count them too.
// If you don't have db.js in backend root, adjust the path or remove this block.
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
    // Your "users" table is Prisma-based (since you can sign up/login and get prisma user id)
    const totalHouseholdAdmins = await prisma.user.count();

    // 2) ACTIVE PRO SUBSCRIPTIONS
    // Your subscription model exists in Prisma (you showed routes/subscription.js using prisma.subscription)
    const activeProSubscriptions = await prisma.subscription.count({
      where: { plan: "PRO", status: "ACTIVE" },
    });

    // 3) TOTAL DEVICES (platform-wide)
    // We try Prisma first (if you have prisma.device), else fallback to SQLite devices table.
    let totalDevices = 0;

    if (prisma.device && typeof prisma.device.count === "function") {
      totalDevices = await prisma.device.count();
    } else if (db) {
      const row = db.prepare(`SELECT COUNT(*) as c FROM devices`).get();
      totalDevices = row?.c ?? 0;
    }

    // 4) ALERTS TODAY + RECENT ALERTS
    // You might have prisma.event OR prisma.alert depending on your schema.
    // We'll try prisma.event first, then prisma.alert.
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

module.exports = router;