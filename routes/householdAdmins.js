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
        isDisabled: true,
      },
    });

    return res.json({ ok: true, users });
  } catch (err) {
    console.error("[HOUSEHOLD ADMINS] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isDisabled } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }
    if (typeof isDisabled !== "boolean") {
      return res.status(400).json({ ok: false, message: "isDisabled must be boolean" });
    }

    // prevent self-disable
    if (String(req.user?.id) === String(id)) {
      return res.status(400).json({ ok: false, message: "You cannot disable yourself" });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isDisabled },
      select: { id: true, email: true, isDisabled: true, updatedAt: true },
    });

    return res.json({ ok: true, user });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "User not found" });
    }
    return res.status(500).json({ ok: false, message: "Failed to update status" });
  }
});

module.exports = router;