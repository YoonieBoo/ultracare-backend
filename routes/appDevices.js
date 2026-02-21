const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { requireActiveSubscription } = require("../lib/subscription");
const { requireSubscriptionChosen } = require("../middleware/requireSubscription");

const router = express.Router();

router.get("/", requireAuth, requireSubscriptionChosen(), async (req, res) => {
  const devices = await prisma.device.findMany({
    where: { userId: req.userId },
    orderBy: { id: "asc" },
  });

  return res.json({
    ok: true,
    plan: req.subscription.plan,
    deviceLimit: req.deviceLimit,
    count: devices.length,
    devices,
  });
});

router.post("/claim", requireAuth, requireSubscriptionChosen(), async (req, res) => {
  try {
    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId is required" });

    // 1️⃣ Check if device exists
const existingDevice = await prisma.device.findUnique({
  where: { deviceId }
});

if (!existingDevice) {
  return res.status(404).json({
    ok: false,
    error: "Device not found"
  });
}

    const currentCount = await prisma.device.count({ where: { userId: req.userId } });
    if (currentCount >= req.deviceLimit) {
      return res.status(409).json({
        ok: false,
        error: "Device limit reached",
        plan: req.subscription.plan,
        limit: req.deviceLimit,
      });
    }

    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" });
    if (device.isActive === false) return res.status(409).json({ ok: false, error: "Device is disabled" });
    if (device.userId && device.userId !== req.userId) return res.status(409).json({ ok: false, error: "Device already claimed" });

    const updated = await prisma.device.update({
      where: { deviceId },
      data: { userId: req.userId },
    });

    return res.json({ ok: true, device: updated });
  } catch (err) {
    console.error("[APP claim] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;