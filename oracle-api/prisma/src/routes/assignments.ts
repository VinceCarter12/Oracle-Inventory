import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

const include = {
  asset: { select: { id: true, name: true, serialNumber: true, category: { select: { id: true, name: true } }, site: { select: { id: true, name: true } } } },
  employee: { select: { id: true, name: true, employeeId: true, department: { select: { id: true, name: true } }, site: { select: { id: true, name: true } } } },
};

// GET /api/assignments
router.get("/", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const assignments = await prisma.assetAssignment.findMany({
    include,
    orderBy: { assignedAt: "desc" },
  });
  res.json(assignments);
});

// POST /api/assignments — assign asset to employee
router.post("/", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { assetId, employeeId, notes } = req.body;
  if (!assetId) { res.status(400).json({ error: "assetId is required." }); return; }
  if (!employeeId) { res.status(400).json({ error: "employeeId is required." }); return; }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }

  // Close any existing active assignment for this asset
  await prisma.assetAssignment.updateMany({
    where: { assetId, status: "active" },
    data: { status: "transferred", returnedAt: new Date() },
  });

  const assignment = await prisma.assetAssignment.create({
    data: { assetId, employeeId, status: "active" },
    include,
  });

  await prisma.movementLog.create({
    data: {
      assetId,
      employeeId,
      type: "assignment",
      notes: notes || `Assigned to ${employee.name}`,
    },
  });

  await logActivity({ userId: req.user!.id, action: "ASSET_ASSIGNED", entity: "AssetAssignment", entityId: assignment.id, metadata: { assetId, assetName: asset.name, employeeId, employeeName: employee.name } });
  res.status(201).json(assignment);
});

// PUT /api/assignments/:id/return — return asset
router.put("/:id/return", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;

  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: req.params.id },
    include: { employee: { select: { name: true } } },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.status !== "active") { res.status(400).json({ error: "Assignment is not active" }); return; }

  const updated = await prisma.assetAssignment.update({
    where: { id: req.params.id },
    data: { status: "returned", returnedAt: new Date() },
    include,
  });

  await prisma.movementLog.create({
    data: {
      assetId: assignment.assetId,
      employeeId: assignment.employeeId,
      type: "assignment",
      notes: notes || `Returned by ${assignment.employee.name}`,
    },
  });

  await logActivity({ userId: req.user!.id, action: "ASSET_RETURNED", entity: "AssetAssignment", entityId: updated.id, metadata: { assetId: assignment.assetId, employeeId: assignment.employeeId } });
  res.json(updated);
});

export default router;
