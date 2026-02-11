const express = require("express")
const db = require("../db")
const router = express.Router()

// POST /api/devices/heartbeat
router.post("/devices/heartbeat", (req, res) => {
  try {
    const { deviceId } = req.body || {}

    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "deviceId is required" })
    }

    const now = Date.now()

    db.prepare(
      `
      INSERT INTO devices (deviceId, lastSeen, status)
      VALUES (?, ?, ?)
      ON CONFLICT(deviceId)
      DO UPDATE SET lastSeen=?, status=?
      `
    ).run(deviceId, now, "Online", now, "Online")

    return res.json({ ok: true, deviceId, status: "Online", lastSeen: now })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "server_error" })
  }
})

module.exports = router
