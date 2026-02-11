const express = require("express")
const router = express.Router()
const prisma = require("../lib/prisma")

// GET /api/residents
router.get("/", async (req, res) => {
  try {
    const rows = await prisma.resident.findMany({
      orderBy: { id: "desc" },
    })
    return res.json(rows)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to fetch residents" })
  }
})

// POST /api/residents
router.post("/", async (req, res) => {
  try {
    const { name, room } = req.body || {}

    if (!name || !room) {
      return res.status(400).json({ ok: false, error: "name and room are required" })
    }

    const created = await prisma.resident.create({
      data: { name, room },
    })

    return res.json({ ok: true, created })
  } catch (err) {
  console.error(err)

  // Prisma duplicate name
  if (err.code === "P2002") {
    return res.status(409).json({ ok: false, error: "Resident name already exists" })
  }

  return res.status(500).json({ ok: false, error: "Failed to create resident" })
}

})

// PATCH /api/residents/:id
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" })

    const { name, room } = req.body || {}

    const updated = await prisma.resident.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(room !== undefined ? { room } : {}),
      },
    })

    return res.json({ ok: true, updated })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to update resident" })
  }
})

// DELETE /api/residents/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" })

    const activeCount = await prisma.alert.count({
      where: {
        residentId: id,
        status: { in: ["New", "Acknowledged"] },
      },
    })

    if (activeCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "Cannot delete resident with active alerts",
        activeAlerts: activeCount,
      })
    }

    await prisma.resident.delete({ where: { id } })

    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to delete resident" })
  }
})

module.exports = router
