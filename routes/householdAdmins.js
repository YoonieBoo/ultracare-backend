const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");

const router = express.Router();

/**
 * GET /api/household-admins
 * Returns all users (later you can filter only "household admins" by role)
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return res.json({ ok: true, users });
  } catch (err) {
    console.error("[HOUSEHOLD ADMINS] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;