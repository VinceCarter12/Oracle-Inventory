import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/roles — list all roles with permissions and user count
router.get("/", async (_req, res: Response) => {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(roles);
});

// GET /api/roles/permissions — list all available permissions (must be before /:id)
router.get("/permissions", async (_req, res: Response) => {
  const perms = await prisma.permission.findMany({ orderBy: { key: "asc" } });
  res.json(perms);
});

// POST /api/roles — create role
router.post("/", requirePermission("assign_roles"), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  if (name.trim().length > 64) { res.status(400).json({ error: "name too long (max 64)" }); return; }
  try {
    const role = await prisma.role.create({
      data: { name: name.trim(), description: description?.trim() ?? null },
    });
    res.status(201).json(role);
  } catch (e: any) {
    if (e.code === "P2002") { res.status(409).json({ error: "Role name already exists" }); return; }
    throw e;
  }
});

// GET /api/roles/:id/permissions — get permissions for a role
router.get("/:id/permissions", async (req, res: Response) => {
  const rps = await prisma.rolePermission.findMany({
    where: { roleId: req.params.id },
    include: { permission: true },
  });
  res.json(rps.map((rp) => rp.permission));
});

// PUT /api/roles/:id — update role name/description
router.put("/:id", requirePermission("assign_roles"), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  if (name.trim().length > 64) { res.status(400).json({ error: "name too long (max 64)" }); return; }
  try {
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { name: name.trim(), description: description?.trim() ?? null },
    });
    res.json(role);
  } catch (e: any) {
    if (e.code === "P2025") { res.status(404).json({ error: "Role not found" }); return; }
    if (e.code === "P2002") { res.status(409).json({ error: "Role name already exists" }); return; }
    throw e;
  }
});

// PUT /api/roles/:id/permissions — replace all permissions for a role
router.put("/:id/permissions", requirePermission("assign_roles"), async (req: AuthRequest, res: Response) => {
  const { permissionIds } = req.body as { permissionIds?: unknown };
  if (!Array.isArray(permissionIds)) {
    res.status(400).json({ error: "permissionIds must be an array" });
    return;
  }
  const ids = permissionIds.filter((x): x is string => typeof x === "string");
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } }),
    ...(ids.length > 0
      ? [prisma.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: req.params.id, permissionId })),
          skipDuplicates: true,
        })]
      : []),
  ]);
  res.json({ ok: true });
});

// DELETE /api/roles/:id — delete role
router.delete("/:id", requirePermission("assign_roles"), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") { res.status(404).json({ error: "Role not found" }); return; }
    throw e;
  }
});

export default router;
