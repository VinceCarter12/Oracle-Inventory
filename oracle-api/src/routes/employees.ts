import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { isZohoConfigured, enrichEmployee } from "../lib/integrations/zoho";

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
// Backward compatible: no page/limit → full array, unchanged for existing callers.
// Pass page and/or limit to opt into { items, total, page, limit }; q filters by name/employeeId.
router.get("/", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const { q, page, limit, isActive } = req.query;

  const where: Record<string, unknown> = {};
  if (isActive === "true" || isActive === "false") where.isActive = isActive === "true";
  if (typeof q === "string" && q.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { employeeId: { contains: term, mode: "insensitive" } },
    ];
  }

  if (page === undefined && limit === undefined) {
    const employees = await prisma.employee.findMany({ where, include, orderBy: { name: "asc" } });
    res.json(employees);
    return;
  }

  const pageNum  = Math.max(1, parseInt(String(page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(limit ?? "20"), 10) || 20));

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where, include, orderBy: { name: "asc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  res.json({ items, total, page: pageNum, limit: pageSize });
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

// Sequential EMP-### fallback when neither the admin nor Zoho supplies an
// employeeId. `offset` lets the retry loop below step past a collision from
// a race with another concurrent create.
async function nextEmployeeId(offset = 0): Promise<string> {
  const count = await prisma.employee.count();
  return `EMP-${String(count + 1 + offset).padStart(3, "0")}`;
}

// POST /api/employees
// When the admin supplies an email and Zoho Directory is configured, the
// employee is matched against Zoho by that email — only fields the admin
// left blank get filled in (employeeId, department). This is the only path
// that pulls Zoho data into a manually-added employee; nothing is fetched
// unless the admin enters an email here. If employeeId is still blank after
// that (no email, or no Zoho match), one is auto-generated (EMP-###) rather
// than blocking the save.
router.post("/", requirePermission("manage_stock"), async (req: AuthRequest, res: Response) => {
  const { name, email, phone, employeeId, branchId, departmentId, position } = req.body;
  if (!name) { res.status(400).json({ error: "Employee name is required." }); return; }

  let resolvedEmployeeId: string | null = employeeId || null;
  let resolvedDepartmentId: string | null = departmentId || null;
  let source: "manual" | "zoho" = "manual";

  if (email && isZohoConfigured()) {
    const branch = branchId ? await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null;
    const enriched = await enrichEmployee({ name, email, employeeId: employeeId || null, branchHint: branch?.name ?? null }).catch(() => null);
    if (enriched?.source === "zoho") {
      source = "zoho";
      if (!resolvedEmployeeId && enriched.employeeId) resolvedEmployeeId = enriched.employeeId;
      if (!resolvedDepartmentId && enriched.department && branchId) {
        const dept = await prisma.department.findFirst({ where: { branchId, name: { equals: enriched.department, mode: "insensitive" } }, select: { id: true } });
        if (dept) resolvedDepartmentId = dept.id;
      }
    }
  }

  const autoAssignId = !resolvedEmployeeId;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (autoAssignId) resolvedEmployeeId = await nextEmployeeId(attempt);
    try {
      const employee = await prisma.employee.create({
        data: {
          name,
          email:        email    || null,
          phone:        phone    || null,
          position:     position || null,
          employeeId:   resolvedEmployeeId,
          branchId:     branchId     || null,
          departmentId: resolvedDepartmentId,
          isActive:     true,
          source,
        },
        include,
      });
      await logActivity({ userId: req.user!.id, action: "create", entity: "Employee", entityId: employee.id, branchId: employee.branchId, metadata: { name, employeeId: resolvedEmployeeId, source } });
      res.status(201).json(employee);
      return;
    } catch (e) {
      const isUniqueConflict = typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
      const conflictedOnEmployeeId = isUniqueConflict && (e as { meta?: { target?: string[] } }).meta?.target?.includes("employeeId");
      if (conflictedOnEmployeeId && autoAssignId) continue;
      if (isUniqueConflict) { res.status(409).json({ error: "That email or employee ID is already in use." }); return; }
      throw e;
    }
  }
  res.status(500).json({ error: "Could not generate a unique employee ID. Try entering one manually." });
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
  await logActivity({ userId: req.user!.id, action: "update", entity: "Employee", entityId: employee.id, branchId: employee.branchId, metadata: { name } });
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
  await logActivity({ userId: req.user!.id, action: isActive ? "activate" : "deactivate", entity: "Employee", entityId: req.params.id, branchId: employee.branchId, metadata: { name: existing.name } });
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
  await logActivity({ userId: req.user!.id, action: "delete", entity: "Employee", entityId: req.params.id, branchId: existing.branchId, metadata: { name: existing.name } });
  res.json({ success: true });
});

export default router;
