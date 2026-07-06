import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { getExitCheckState, isExitCheckBlocked, exitCheckMessage } from "../lib/belarc/exitCheck";

const router = Router();
router.use(requireAuth);

const include = {
  asset: { select: { id: true, name: true, serialNumber: true, condition: true, category: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } } },
  employee: { select: { id: true, name: true, employeeId: true, department: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } } },
};

// GET /api/assignments/stats — must be before /:id
router.get("/stats", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const [total, active, pendingReturn, returned] = await Promise.all([
    prisma.assetAssignment.count(),
    prisma.assetAssignment.count({ where: { status: "active" } }),
    prisma.assetAssignment.count({ where: { status: "pending_return" } }),
    prisma.assetAssignment.count({ where: { status: "returned" } }),
  ]);
  res.json({ total, active, pendingReturn, returned });
});

// GET /api/assignments
router.get("/", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const assignments = await prisma.assetAssignment.findMany({ include, orderBy: { assignedAt: "desc" } });
  res.json(assignments);
});

// POST /api/assignments
router.post("/", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { assetId, employeeId, notes } = req.body;
  if (!assetId) { res.status(400).json({ error: "assetId is required." }); return; }
  if (!employeeId) { res.status(400).json({ error: "employeeId is required." }); return; }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }

  await prisma.assetAssignment.updateMany({
    where: { assetId, status: "active" },
    data: { status: "transferred", returnedAt: new Date() },
  });

  const assignment = await prisma.assetAssignment.create({
    data: { assetId, employeeId, status: "active", notes: notes || null },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId, employeeId, type: "assignment", notes: notes || `Assigned to ${employee.name}` },
  });

  await logActivity({
    userId: req.user!.id, action: "assign", entity: "Assignment", entityId: assignment.id,
    metadata: { asset: asset.name, employee: employee.name },
  });

  res.status(201).json(assignment);
});

// GET /api/assignments/:id
router.get("/:id", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const assignment = await prisma.assetAssignment.findUnique({ where: { id: req.params.id }, include });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  res.json(assignment);
});

// PUT /api/assignments/:id/request-return
// Any user with manage_stock can request a return — sets status to pending_return
router.put("/:id/request-return", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: req.params.id },
    include: { employee: { select: { name: true } }, asset: { select: { name: true } } },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.status !== "active") { res.status(400).json({ error: "Assignment is not active" }); return; }

  const updated = await prisma.assetAssignment.update({
    where: { id: req.params.id },
    data: {
      status: "pending_return",
      returnRequestedAt: new Date(),
      returnRequestedBy: req.user!.id,
      returnNotes: notes || null,
    },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: assignment.assetId, employeeId: assignment.employeeId, type: "return_requested", notes: notes || `Return requested for ${assignment.asset.name}` },
  });

  await logActivity({
    userId: req.user!.id, action: "return_requested", entity: "Assignment", entityId: assignment.id,
    metadata: { asset: assignment.asset.name, employee: assignment.employee.name },
  });

  res.json(updated);
});

// PUT /api/assignments/:id/approve-return
// Only Admin/SuperAdmin (approve_transactions permission)
router.put("/:id/approve-return", requirePermission("approve_transactions"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: req.params.id },
    include: { employee: { select: { name: true } }, asset: { select: { name: true } } },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.status !== "pending_return") { res.status(400).json({ error: "Assignment is not pending return" }); return; }

  // Hardware Audit exit check — audit-enrolled assets need a reviewed scan first
  const exitCheck = await getExitCheckState(assignment.assetId);
  if (isExitCheckBlocked(exitCheck)) {
    res.status(409).json({ error: exitCheckMessage(assignment.asset.name, exitCheck), exitCheck });
    return;
  }

  const updated = await prisma.assetAssignment.update({
    where: { id: req.params.id },
    data: { status: "returned", returnedAt: new Date() },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: assignment.assetId, employeeId: assignment.employeeId, type: "return_approved", notes: notes || `Return approved for ${assignment.asset.name}` },
  });

  await logActivity({
    userId: req.user!.id, action: "return_approved", entity: "Assignment", entityId: assignment.id,
    metadata: { asset: assignment.asset.name, employee: assignment.employee.name },
  });

  res.json(updated);
});

// PUT /api/assignments/:id/reject-return
// Only Admin/SuperAdmin (approve_transactions permission)
router.put("/:id/reject-return", requirePermission("approve_transactions"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: req.params.id },
    include: { employee: { select: { name: true } }, asset: { select: { name: true } } },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.status !== "pending_return") { res.status(400).json({ error: "Assignment is not pending return" }); return; }

  const updated = await prisma.assetAssignment.update({
    where: { id: req.params.id },
    data: { status: "active", returnRequestedAt: null, returnRequestedBy: null, returnNotes: null },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: assignment.assetId, employeeId: assignment.employeeId, type: "return_rejected", notes: notes || `Return rejected for ${assignment.asset.name}` },
  });

  await logActivity({
    userId: req.user!.id, action: "return_rejected", entity: "Assignment", entityId: assignment.id,
    metadata: { asset: assignment.asset.name, employee: assignment.employee.name, reason: notes },
  });

  res.json(updated);
});

// POST /api/assignments/:id/return
// Admin/SuperAdmin direct return — bypasses request/approval flow
router.post("/:id/return", requirePermission("approve_transactions"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: req.params.id },
    include: { employee: { select: { name: true } }, asset: { select: { name: true } } },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.status === "returned") { res.status(400).json({ error: "Assignment is already returned" }); return; }

  // Hardware Audit exit check applies to direct returns too
  const exitCheck = await getExitCheckState(assignment.assetId);
  if (isExitCheckBlocked(exitCheck)) {
    res.status(409).json({ error: exitCheckMessage(assignment.asset.name, exitCheck), exitCheck });
    return;
  }

  const updated = await prisma.assetAssignment.update({
    where: { id: req.params.id },
    data: { status: "returned", returnedAt: new Date(), returnNotes: notes || null },
    include,
  });

  await prisma.movementLog.create({
    data: {
      assetId: assignment.assetId,
      employeeId: assignment.employeeId,
      type: "return_approved",
      notes: notes || `${assignment.asset.name} returned by ${assignment.employee.name}`,
    },
  });

  await logActivity({
    userId: req.user!.id, action: "return_recorded", entity: "Assignment", entityId: assignment.id,
    metadata: { asset: assignment.asset.name, employee: assignment.employee.name, notes },
  });

  res.json(updated);
});

// GET /api/assignments/pending-returns — list all pending_return assignments (Admin+)
router.get("/pending-returns", requirePermission("approve_transactions"), async (_req: AuthRequest, res: Response) => {
  const assignments = await prisma.assetAssignment.findMany({
    where: { status: "pending_return" },
    include,
    orderBy: { returnRequestedAt: "asc" },
  });
  res.json(assignments);
});

export default router;
