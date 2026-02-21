const prisma = require("../lib/prisma");

function requireSubscriptionChosen() {
  return async (req, res, next) => {
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: req.userId },
      });

      // User has not chosen a plan yet
      if (!sub) {
        return res.status(403).json({
          ok: false,
          code: "SUBSCRIPTION_REQUIRED",
          error: "Please choose a subscription plan first.",
        });
      }

      // If you want to block PRO until payment:
      if (sub.plan === "PRO" && sub.status !== "ACTIVE") {
        return res.status(403).json({
          ok: false,
          code: "SUBSCRIPTION_NOT_ACTIVE",
          error: "PRO plan not active yet.",
          status: sub.status,
        });
      }

      req.subscription = sub;
      next();
    } catch (err) {
      console.error("[requireSubscriptionChosen] error:", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  };
}

module.exports = { requireSubscriptionChosen };