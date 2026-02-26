const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { requireSubscriptionChosen } = require("../middleware/requireSubscription");

const router = express.Router();

// =========================
// GET /api/app/alerts
// =========================
router.get("/", requireAuth, requireSubscriptionChosen(), async (req, res) => {
  try {
    const userId = req.userId ?? req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const alerts = await prisma.alert.findMany({
      where: {
        device: { userId: userId },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        resident: true,
        device: true,
      },
    });

    const safeAlerts = alerts.map(a => ({
      id: a.id,
      type: a.type,
      status: a.status,
      confidence: a.confidence,
      time: a.time,
      createdAt: a.createdAt,
      displayName: a.resident?.name || a.elderly || null,
      room: a.room,
      mediaUrl: a.mediaUrl,
      residentId: a.residentId,
      deviceId: a.device?.deviceId || null,
    }));

    return res.json({ ok: true, alerts: safeAlerts });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch alerts" });
  }
});

// =========================
// GET /api/app/alerts/latest
// =========================
router.get("/latest", requireAuth, requireSubscriptionChosen(), async (req, res) => {
  try {
    const userId = req.userId ?? req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const latest = await prisma.alert.findFirst({
      where: {
        device: { userId: userId },
      },
      orderBy: { createdAt: "desc" },
      include: {
        resident: true,
        device: true,   // ✅ IMPORTANT FIX
      },
    });

    if (!latest) return res.json({ ok: true, alerts: [] });

    const safeLatest = {
      id: latest.id,
      type: latest.type,
      status: latest.status,
      confidence: latest.confidence,
      time: latest.time,
      createdAt: latest.createdAt,
      displayName: latest.resident?.name || latest.elderly || null,
      room: latest.room,
      mediaUrl: latest.mediaUrl,
      residentId: latest.residentId,
      deviceId: latest.device?.deviceId || null,
    };

    return res.json({ ok: true, alerts: [safeLatest] });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch latest alert" });
  }
});

module.exports = router;