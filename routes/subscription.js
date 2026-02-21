// routes/subscription.js
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { planToLimit } = require("../lib/subscription");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.userId },
    });

    if (!sub) return res.json({ ok: true, subscription: null });

    return res.json({
      ok: true,
      subscription: sub,
      deviceLimit: planToLimit(sub.plan),
    });
  } catch (err) {
    console.error("[SUB me] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.post("/select", requireAuth, async (req, res) => {
  try {
    const { plan } = req.body || {};

    if (!plan || !["FREE", "PRO"].includes(plan)) {
      return res.status(400).json({ ok: false, error: "plan must be FREE or PRO" });
    }

    // FREE becomes ACTIVE immediately
    // PRO stays PENDING_PAYMENT until you call /confirm-payment
    const status = plan === "FREE" ? "ACTIVE" : "PENDING_PAYMENT";

    const sub = await prisma.subscription.upsert({
      where: { userId: req.userId },
      update: { plan, status },
      create: { userId: req.userId, plan, status },
    });

    return res.json({
      ok: true,
      subscription: sub,
      deviceLimit: planToLimit(sub.plan),
    });
  } catch (err) {
    console.error("[SUB select] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.post("/confirm-payment", requireAuth, async (req, res) => {
  try {
    const existing = await prisma.subscription.findUnique({
      where: { userId: req.userId },
    });

    if (!existing) {
      return res.status(400).json({ ok: false, error: "No subscription selected yet" });
    }

    const updated = await prisma.subscription.update({
      where: { userId: req.userId },
      data: { plan: "PRO", status: "ACTIVE" },
    });

    return res.json({
      ok: true,
      subscription: updated,
      deviceLimit: planToLimit(updated.plan),
    });
  } catch (err) {
    console.error("[SUB confirm-payment] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;