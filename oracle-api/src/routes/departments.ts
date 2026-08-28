import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { hasValidEmployeeResolution } from "../lib/department-management";
import { broadcastChange } from "../lib/ws";

const router = Router();
router.use(requireAuth);

function departmentError(res: Response, error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return res.status(409).json({ error: "An active department with that name already exists." });
  if (["P2021", "P2022", "P1001", "P1003"].includes(code ?? "")) return res.status(503).json({ error: "Department service is temporarily unavailable. Please retry." });
  return res.status(500).json({ error: "Unable to complete department request." });
}

// GET /api/departments
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
  const includeArchived = req.query.includeArchived === "true";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const departments = await prisma.department.findMany({
    where: {
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(branchId ? { branchId } : {}),
    },
    include: { branch: { select: { id: true, name: true } }, _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });
  res.json(departments);
  } catch (error) { departmentError(res, error); }
});

// POST /api/departments
router.post("/", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  try {
  const { name, branchId } = req.body as { name?: string; branchId?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Department name is required." }); return; }
  if (!branchId?.trim()) { res.status(400).json({ error: "Branch is required." }); return; }
  const normalized = name.trim();
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.archivedAt) { res.status(400).json({ error: "Branch must be an active branch." }); return; }
  const duplicate = await prisma.department.findFirst({ where: { archivedAt: null, branchId, name: { equals: normalized, mode: "insensitive" } } });
  if (duplicate) { res.status(409).json({ error: "An active department with that name already exists in this branch." }); return; }
  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({ data: { name: normalized, branchId }, include: { branch: { select: { id: true, name: true } } } });
    await tx.activityLog.create({ data: { userId: req.user?.id, action: "DEPARTMENT_CREATED", entity: "Department", entityId: created.id, metadata: { name: created.name, branchId } } });
    return created;
  });
  broadcastChange({ entity: "Department", action: "DEPARTMENT_CREATED", entityId: department.id, branchId });
  res.status(201).json(department);
  } catch (error) { departmentError(res, error); }
});

// GET /api/departments/:id — detail with employee membership
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
  const department = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: {
      branch: { select: { id: true, name: true } },
      employees: { orderBy: { name: "asc" }, select: { id: true, name: true, employeeId: true, email: true, position: true, isActive: true, branch: { select: { id: true, name: true } } } },
      _count: { select: { employees: true } },
    },
  });
  if (!department) { res.status(404).json({ error: "Department not found" }); return; }
  res.json(department);
  } catch (error) { departmentError(res, error); }
});

// PATCH /api/departments/:id — rename and/or archive
router.patch("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  try {
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Department not found" }); return; }
  const body = req.body as { name?: unknown; archived?: unknown };
  const data: { name?: string; archivedAt?: Date | null } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) { res.status(400).json({ error: "Department name is required." }); return; }
    const name = body.name.trim();
    const duplicate = await prisma.department.findFirst({ where: { id: { not: existing.id }, branchId: existing.branchId, archivedAt: null, name: { equals: name, mode: "insensitive" } } });
    if (duplicate && body.archived !== true) { res.status(409).json({ error: "An active department with that name already exists in this branch." }); return; }
    data.name = name;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") { res.status(400).json({ error: "archived must be a boolean." }); return; }
    if (body.archived === false) {
      const duplicate = await prisma.department.findFirst({ where: { id: { not: existing.id }, branchId: existing.branchId, archivedAt: null, name: { equals: existing.name, mode: "insensitive" } } });
      if (duplicate) { res.status(409).json({ error: "An active department with that name already exists in this branch." }); return; }
    }
    data.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;
    if (body.archived === true && existing.archivedAt === null) {
      const employeeCount = await prisma.employee.count({ where: { departmentId: existing.id } });
      const resolution = (req.body as { resolution?: unknown }).resolution;
      const targetDepartmentId = (req.body as { targetDepartmentId?: unknown }).targetDepartmentId;
      if (!hasValidEmployeeResolution(resolution, targetDepartmentId, employeeCount)) {
        res.status(409).json({ error: "Resolve department employees before archiving.", employeeCount, requiresResolution: true }); return;
      }
      if (resolution === "reassign") {
        if (typeof targetDepartmentId !== "string" || targetDepartmentId === existing.id) { res.status(400).json({ error: "Choose another active department for reassignment." }); return; }
        const target = await prisma.department.findUnique({ where: { id: targetDepartmentId } });
        if (!target || target.archivedAt || target.branchId !== existing.branchId) { res.status(400).json({ error: "Target department must be an active department in the same branch." }); return; }
      }
      const updated = await prisma.$transaction(async (tx) => {
        const currentEmployees = await tx.employee.count({ where: { departmentId: existing.id } });
        if (!hasValidEmployeeResolution(resolution, targetDepartmentId, currentEmployees)) throw new Error("Department employee resolution is stale; retry.");
        if (resolution === "reassign") {
          const target = await tx.department.findUnique({ where: { id: targetDepartmentId as string }, select: { id: true, archivedAt: true, branchId: true } });
          if (!target || target.archivedAt || target.id === existing.id || target.branchId !== existing.branchId) throw new Error("Target department changed; retry.");
        }
        if (resolution === "reassign") await tx.employee.updateMany({ where: { departmentId: existing.id }, data: { departmentId: targetDepartmentId as string } });
        if (resolution === "clear") await tx.employee.updateMany({ where: { departmentId: existing.id }, data: { departmentId: null } });
        const result = await tx.department.update({ where: { id: existing.id }, data, include: { _count: { select: { employees: true } } } });
        await tx.activityLog.create({ data: { userId: req.user?.id, action: "DEPARTMENT_ARCHIVED", entity: "Department", entityId: result.id, metadata: { name: result.name, resolution: resolution ?? "none", targetDepartmentId: targetDepartmentId ?? null, employeeCount: currentEmployees } } });
        return result;
      });
      broadcastChange({ entity: "Department", action: "DEPARTMENT_ARCHIVED", entityId: updated.id, branchId: existing.branchId });
      res.json(updated); return;
    }
  }
  if (!Object.keys(data).length) { res.status(400).json({ error: "Provide a name or archived state." }); return; }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.department.update({ where: { id: existing.id }, data, include: { _count: { select: { employees: true } } } });
    await tx.activityLog.create({ data: { userId: req.user?.id, action: data.archivedAt === null ? "DEPARTMENT_UNARCHIVED" : data.archivedAt ? "DEPARTMENT_ARCHIVED" : "DEPARTMENT_RENAMED", entity: "Department", entityId: result.id, metadata: { before: existing.name, name: result.name } } });
    return result;
  });
  broadcastChange({ entity: "Department", action: data.archivedAt === null ? "DEPARTMENT_UNARCHIVED" : data.archivedAt ? "DEPARTMENT_ARCHIVED" : "DEPARTMENT_RENAMED", entityId: updated.id, branchId: existing.branchId });
  res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Department changed; retry.";
    if (message.includes("stale") || message.includes("changed") || message.includes("no longer")) { res.status(409).json({ error: message }); return; }
    departmentError(res, error);
  }
});

// DELETE /api/departments/:id
router.delete("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  try {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) { res.status(404).json({ error: "Department not found" }); return; }
  const body = req.body as { resolution?: unknown; targetDepartmentId?: unknown };
  const employees = await prisma.employee.count({ where: { departmentId: dept.id } });
  if (!hasValidEmployeeResolution(body.resolution, body.targetDepartmentId, employees)) {
    res.status(409).json({ error: "Resolve department employees before deleting.", employeeCount: employees, requiresResolution: true }); return;
  }
  if (body.resolution === "reassign") {
    if (typeof body.targetDepartmentId !== "string" || body.targetDepartmentId === dept.id) { res.status(400).json({ error: "Choose another active department for reassignment." }); return; }
    const target = await prisma.department.findUnique({ where: { id: body.targetDepartmentId } });
    if (!target || target.archivedAt || target.branchId !== dept.branchId) { res.status(400).json({ error: "Target department must be an active department in the same branch." }); return; }
  }
  try { await prisma.$transaction(async (tx) => {
    const current = await tx.department.findUnique({ where: { id: dept.id }, select: { id: true } });
    if (!current) throw new Error("Department no longer exists");
    const currentEmployees = await tx.employee.count({ where: { departmentId: dept.id } });
    if (!hasValidEmployeeResolution(body.resolution, body.targetDepartmentId, currentEmployees)) throw new Error("Department employee resolution is stale; retry.");
    if (body.resolution === "reassign") {
      const target = await tx.department.findUnique({ where: { id: body.targetDepartmentId as string }, select: { id: true, archivedAt: true, branchId: true } });
      if (!target || target.archivedAt || target.id === dept.id || target.branchId !== dept.branchId) throw new Error("Target department changed; retry.");
    }
    if (body.resolution === "reassign") await tx.employee.updateMany({ where: { departmentId: dept.id }, data: { departmentId: body.targetDepartmentId as string } });
    if (body.resolution === "clear") await tx.employee.updateMany({ where: { departmentId: dept.id }, data: { departmentId: null } });
    await tx.department.delete({ where: { id: dept.id } });
    await tx.activityLog.create({ data: { userId: req.user?.id, action: "DEPARTMENT_DELETED", entity: "Department", entityId: dept.id, metadata: { name: dept.name, resolution: body.resolution ?? "none", targetDepartmentId: body.targetDepartmentId ?? null, employeeCount: currentEmployees } } });
  }); } catch (error) {
    const message = error instanceof Error ? error.message : "Department changed; retry.";
    if (message.includes("stale") || message.includes("no longer")) { res.status(409).json({ error: message }); return; }
    departmentError(res, error); return;
  }
  broadcastChange({ entity: "Department", action: "DEPARTMENT_DELETED", entityId: dept.id, branchId: dept.branchId });
  res.json({ success: true });
  } catch (error) {
    departmentError(res, error);
  }
});

export default router;
