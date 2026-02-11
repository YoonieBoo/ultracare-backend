const express = require("express")
const router = express.Router()
const prisma = require("../lib/prisma")

// GET /api/residents  (now includes device info)
router.get("/", async (req, res) => {
  try {
    const rows = await prisma.resident.findMany({
      orderBy: { id: "desc" },
      include: {
        device: true, // include linked camera/device
      },
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
      include: { device: true },
    })

    return res.json({ ok: true, updated })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to update resident" })
  }
})

/**
 * PATCH /api/residents/:id/assign-device
 * body: { "deviceId": 2 }
 * Links Grandpa Aung -> Device row id=2
 */
router.patch("/:id/assign-device", async (req, res) => {
  try {
    const residentId = Number(req.params.id)
    if (!residentId) return res.status(400).json({ ok: false, error: "Invalid resident id" })

    const { deviceId } = req.body || {}
    const deviceRowId = Number(deviceId)
    if (!deviceRowId) {
      return res.status(400).json({ ok: false, error: "deviceId (Device.id) is required" })
    }

    // Make sure resident exists
    const resident = await prisma.resident.findUnique({ where: { id: residentId } })
    if (!resident) return res.status(404).json({ ok: false, error: "Resident not found" })

    // Make sure device exists & active
    const device = await prisma.device.findUnique({ where: { id: deviceRowId } })
    if (!device) return res.status(404).json({ ok: false, error: "Device not found" })
    if (device.isActive === false) {
      return res.status(409).json({ ok: false, error: "Device is inactive" })
    }

    // Assign link (Resident.deviceId = Device.id)
    const updated = await prisma.resident.update({
      where: { id: residentId },
      data: { deviceId: deviceRowId },
      include: { device: true },
    })

    return res.json({ ok: true, updated })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to assign device" })
  }
})

/**
 * PATCH /api/residents/:id/unassign-device
 * Removes the link
 */
router.patch("/:id/unassign-device", async (req, res) => {
  try {
    const residentId = Number(req.params.id)
    if (!residentId) return res.status(400).json({ ok: false, error: "Invalid resident id" })

    const updated = await prisma.resident.update({
      where: { id: residentId },
      data: { deviceId: null },
      include: { device: true },
    })

    return res.json({ ok: true, updated })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: "Failed to unassign device" })
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
