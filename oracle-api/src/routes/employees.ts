import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const include = {
  site: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignments: {
    where: { status: "active" as const },
    include: { asset: { select: { id: true, name: true } } },
  },
};

// GET /api/employees
router.get("/", async (_req: AuthRequest, res: Response) => {
  const employees = await prisma.employee.findMany({
    include,
    orderBy: { name: "asc" },
  });
  res.json(employees);
});

// GET /api/employees/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: {
      site: { select: { id: true, name: true } },
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
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, email, phone, employeeId, siteId, departmentId } = req.body;
  if (!name) { res.status(400).json({ error: "Employee name is required." }); return; }
  if (!employeeId) { res.status(400).json({ error: "Employee ID is required." }); return; }

  const employee = await prisma.employee.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      employeeId,
      siteId: siteId || null,
      departmentId: departmentId || null,
      isActive: true,
    },
    include,
  });
  res.status(201).json(employee);
});

// PUT /api/employees/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, email, phone, employeeId, siteId, departmentId, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "Employee name is required." }); return; }

  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: {
      name,
      email: email || null,
      phone: phone || null,
      employeeId: employeeId || existing.employeeId,
      siteId: siteId || null,
      departmentId: departmentId || null,
      isActive: isActive ?? existing.isActive,
    },
    include,
  });
  res.json(employee);
});

// DELETE /api/employees/:id (soft delete)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
  await prisma.employee.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true });
});

export default router;
