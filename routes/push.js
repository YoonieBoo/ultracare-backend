const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const { initFirebaseAdmin } = require("../lib/firebaseAdmin");

/*
==================================================
POST /api/push/register
Body: { token: "xxx", platform: "ios" }
==================================================
*/
router.post("/register", async (req, res) => {
  try {
    const { token, platform = "ios" } = req.body || {};

    // Basic validation
    if (!token || typeof token !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Required: token (string)",
      });
    }

    const cleaned = token.trim();

    // Length check (real FCM tokens are long)
    if (cleaned.length < 100) {
      return res.status(400).json({
        ok: false,
        error: "Invalid token format (too short to be real FCM token)",
      });
    }

    // Pattern check (allowed characters only)
    const fcmPattern = /^[A-Za-z0-9\-\_:]+$/;
    if (!fcmPattern.test(cleaned)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid token format (unexpected characters)",
      });
    }

    // Save or update token
    const saved = await prisma.pushToken.upsert({
      where: { token: cleaned },
      update: { platform },
      create: { token: cleaned, platform },
    });

    return res.json({ ok: true, pushToken: saved });
  } catch (err) {
    console.error("[PUSH register] error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/*
==================================================
POST /api/push/send-test
Body: { title: "UltraCare", body: "Hello" }
==================================================
*/
router.post("/send-test", async (req, res) => {
  try {
    const { title, body } = req.body || {};

    if (!title || !body) {
      return res.status(400).json({
        ok: false,
        error: "Required: title, body",
      });
    }

    // Load iOS tokens from DB
    const rows = await prisma.pushToken.findMany({
      where: { platform: "ios" },
      select: { token: true },
    });

    const tokens = rows.map((r) => r.token);

    if (tokens.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "No iOS tokens saved yet",
      });
    }

    const admin = initFirebaseAdmin();

    // FCM allows up to 500 per multicast
    const batch = tokens.slice(0, 500);

    const resp = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    // Auto-clean invalid tokens
    const invalidCodes = new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ]);

    const failures = [];

    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const t = batch[i];
        const code = r.error?.code;
        const msg = r.error?.message || "Unknown error";

        failures.push({
          token: t,
          code,
          error: msg,
        });

        if (code && invalidCodes.has(code)) {
          prisma.pushToken.delete({ where: { token: t } }).catch(() => {});
        }
      }
    });

    return res.json({
      ok: true,
      attempted: batch.length,
      sent: resp.successCount,
      failed: resp.failureCount,
      failures,
    });
  } catch (err) {
    console.error("[PUSH send-test] error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Server error",
    });
  }
});

/*
==================================================
POST /api/push/send-one
Body: { token, title, body }
Used for manual testing
==================================================
*/
router.post("/send-one", async (req, res) => {
  try {
    const { token, title, body } = req.body || {};

    if (!token || !title || !body) {
      return res.status(400).json({
        ok: false,
        error: "Required: token, title, body",
      });
    }

    const admin = initFirebaseAdmin();

    const message = {
      token,
      notification: { title, body },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    };

    const messageId = await admin.messaging().send(message);

    return res.json({
      ok: true,
      messageId,
    });
  } catch (err) {
    console.error("[PUSH send-one] error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Server error",
    });
  }
});

module.exports = router;
