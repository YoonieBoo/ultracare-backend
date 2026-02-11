const express = require("express")
const router = express.Router()

// ✅ Correct import (your lib/prisma.js exports prisma directly)
const prisma = require("../lib/prisma")

/**
 * POST /api/events
 *
 * Supports 2 input styles:
 *
 * A) Old style (manual):
 * {
 *   "elderly": "Grandpa",
 *   "room": "Room 201",
 *   "type": "Fall detected",
 *   "confidence": 0.97,
 *   "time": "15:20",
 *   "mediaUrl": "/uploads/xxx.jpg",
 *   "source": "pi"
 * }
 *
 * B) Product style (recommended):
 * {
 *   "residentId": 4,
 *   "type": "Fall detected",
 *   "confidence": 0.97,
 *   "time": "15:20",
 *   "mediaUrl": "/uploads/xxx.jpg",
 *   "source": "pi"
 * }
 *
 * If residentId is provided, backend will auto-fill elderly + room from resident record.
 */
router.post("/events", async (req, res) => {
  try {
    const {
      elderly,
      room,
      type,
      confidence,
      time,
      mediaUrl,
      source,
      residentId: incomingResidentId,
    } = req.body || {}

    // ---------- ✅ NEW LOGIC GOES HERE (before validation) ----------
    let residentId = null
    let elderlyFinal = elderly
    let roomFinal = room

    // If residentId given, auto-fill elderly + room from DB
    if (incomingResidentId != null) {
      const rid = Number(incomingResidentId)
      if (!rid) {
        return res.status(400).json({ ok: false, error: "Invalid residentId" })
      }

      const r = await prisma.resident.findUnique({ where: { id: rid } })
      if (!r) {
        return res.status(400).json({ ok: false, error: "residentId not found" })
      }

      residentId = rid
      elderlyFinal = r.name
      roomFinal = r.room
    }
    // -------------------------------------------------------------

    // ✅ Validation uses elderlyFinal + roomFinal
    if (!elderlyFinal || !roomFinal || !type) {
      return res
        .status(400)
        .json({ ok: false, error: "elderly/room (or residentId) and type are required" })
    }

    const created = await prisma.alert.create({
      data: {
        elderly: elderlyFinal,
        room: roomFinal,
        type,
        confidence: confidence == null ? 0 : Number(confidence),
        status: "New",
        time:
          time ||
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),

        // optional fields (only if your Prisma schema has them)
        mediaUrl: mediaUrl || null,
        source: source || "pi",
        residentId,
      },
    })

    return res.json({ ok: true, created })
  } catch (err) {
    console.error(err)

    return res.status(500).json({ ok: false, error: "server_error" })
  }
})

module.exports = router
