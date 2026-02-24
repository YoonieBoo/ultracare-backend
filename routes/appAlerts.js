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
      include: { resident: true },
    });

    return res.json({ ok: true, alerts });
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
      include: { resident: true },
    });

    if (!latest) return res.json({ ok: true, alerts: [] });

    return res.json({ ok: true, alerts: [latest] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch latest alert" });
  }
});

module.exports = router;