const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { signToken } = require("../lib/auth");

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: "email and password required" });

    const emailClean = String(email).toLowerCase().trim();
    if (String(password).length < 6) return res.status(400).json({ ok: false, error: "password must be at least 6 chars" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await prisma.user.create({
      data: { email: emailClean, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    const token = signToken(user);
    return res.json({ ok: true, token, user });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ ok: false, error: "Email already exists" });
    console.error("[AUTH signup] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: "email and password required" });

    const emailClean = String(email).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: emailClean } });

    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const token = signToken(user);
    return res.json({ ok: true, token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("[AUTH login] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;