import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

const include = {
  branch: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignments: {
    where: { status: "active" as const },
    include: { asset: { select: { id: true, name: true } } },
  },
};

// GET /api/employees
router.get("/", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const employees = await prisma.employee.findMany({
    include,
    orderBy: { name: "asc" },
  });
  res.json(employees);
});

// GET /api/employees/:id
router.get("/:id", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: {
      branch: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      assignments: {
        orderBy: { assignedAt: "desc" as const },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
              condition: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(employee);
});

// POST /api/employees
router.post("/", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { name, email, phone, employeeId, branchId, departmentId, position } = req.body;
  if (!name) { res.status(400).json({ error: "Employee name is required." }); return; }
  if (!employeeId) { res.status(400).json({ error: "Employee ID is required." }); return; }

  const employee = await prisma.employee.create({
    data: {
      name,
      email:        email    || null,
      phone:        phone    || null,
      position:     position || null,
      employeeId,
      branchId:     branchId     || null,
      departmentId: departmentId || null,
      isActive:     true,
      source:       "manual",
    },
    include,
  });
  await logActivity({ userId: req.user!.id, action: "create", entity: "Employee", entityId: employee.id, metadata: { name, employeeId } });
  res.status(201).json(employee);
});

// PUT /api/employees/:id
router.put("/:id", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { name, email, phone, employeeId, branchId, departmentId, position, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "Employee name is required." }); return; }

  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: {
      name,
      email:        email    || null,
      phone:        phone    || null,
      position:     position || null,
      employeeId:   employeeId   || existing.employeeId,
      branchId:     branchId     || null,
      departmentId: departmentId || null,
      isActive:     isActive ?? existing.isActive,
    },
    include,
  });
  await logActivity({ userId: req.user!.id, action: "update", entity: "Employee", entityId: employee.id, metadata: { name } });
  res.json(employee);
});

// PATCH /api/employees/:id/status — toggle isActive
router.patch("/:id/status", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive must be a boolean." }); return; }
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: { isActive },
    include,
  });
  await logActivity({ userId: req.user!.id, action: isActive ? "activate" : "deactivate", entity: "Employee", entityId: req.params.id, metadata: { name: existing.name } });
  res.json(employee);
});

// DELETE /api/employees/:id — hard delete (rejected if employee has active assignments)
router.delete("/:id", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const existing = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { assignments: { where: { status: "active" } } },
  });
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
  if (existing.assignments.length > 0) {
    res.status(409).json({ error: `Cannot delete: employee has ${existing.assignments.length} active asset assignment(s). Return all assets first.` });
    return;
  }
  await prisma.employee.delete({ where: { id: req.params.id } });
  await logActivity({ userId: req.user!.id, action: "delete", entity: "Employee", entityId: req.params.id, metadata: { name: existing.name } });
  res.json({ success: true });
});

export default router;
