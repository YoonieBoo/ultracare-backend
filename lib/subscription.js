const prisma = require("./prisma");

function planToLimit(plan) {
  return plan === "PRO" ? 4 : 2;
}

async function requireActiveSubscription(req, res, next) {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.userId },
    });

    if (!sub) {
      return res.status(403).json({ ok: false, error: "Subscription required", action: "CHOOSE_PLAN" });
    }

    if (sub.status !== "ACTIVE") {
      return res.status(403).json({
        ok: false,
        error: "Subscription not active",
        action: "COMPLETE_PAYMENT",
        plan: sub.plan,
        status: sub.status,
      });
    }

    req.subscription = sub;
    req.deviceLimit = planToLimit(sub.plan);
    next();
  } catch (err) {
    console.error("[requireActiveSubscription] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

module.exports = { planToLimit, requireActiveSubscription };