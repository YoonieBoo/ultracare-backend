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
      acknowledgedAt: a.acknowledgedAt,
      resolvedAt: a.resolvedAt,
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
      acknowledgedAt: latest.acknowledgedAt,
      resolvedAt: latest.resolvedAt,
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

// =========================
// PATCH /api/app/alerts/:id
// =========================
router.patch("/:id", requireAuth, requireSubscriptionChosen(), async (req, res) => {
  try {
    const userId = req.userId ?? req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const rawStatus = String(req.body?.status || "").trim();
    const normalizedMap = {
      new: "New",
      acknowledged: "Acknowledged",
      acknowledge: "Acknowledged",
      checked: "Acknowledged",
      resolved: "Resolved",
    };
    const status = normalizedMap[rawStatus.toLowerCase()];
    if (!status) return res.status(400).json({ ok: false, error: "Invalid status" });

    // User can update only alerts belonging to their claimed devices.
    const existing = await prisma.alert.findFirst({
      where: {
        id,
        device: { userId: userId },
      },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "Alert not found" });

    const data = { status };
    if (status === "Acknowledged") data.acknowledgedAt = new Date();
    if (status === "Resolved") data.resolvedAt = new Date();

    const updated = await prisma.alert.update({
      where: { id },
      data,
      include: {
        resident: true,
        device: true,
      },
    });

    const payload = {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      acknowledgedAt: updated.acknowledgedAt,
      resolvedAt: updated.resolvedAt,
      confidence: updated.confidence,
      time: updated.time,
      createdAt: updated.createdAt,
      displayName: updated.resident?.name || updated.elderly || null,
      room: updated.room,
      mediaUrl: updated.mediaUrl,
      residentId: updated.residentId,
      deviceId: updated.device?.deviceId || null,
    };

    return res.json({
      ok: true,
      ...payload,
      alert: payload,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to update alert status" });
  }
});

module.exports = router;
