import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

// GET /api/roles — list all roles with permission count
router.get("/", async (_req, res: Response) => {
  const roles = await prisma.role.findMany({
    include: {
      _count: { select: { permissions: true, users: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(roles);
});

// GET /api/roles/:id — single role with full permissions list
router.get("/:id", async (req, res: Response) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(role);
});

// POST /api/roles — create role
router.post(
  "/",
  requirePermission("assign_roles"),
  async (req: AuthRequest, res: Response) => {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Role name is required." });
      return;
    }
    const existing = await prisma.role.findUnique({ where: { name: name.trim() } });
    if (existing) {
      res.status(409).json({ error: "A role with that name already exists." });
      return;
    }
    const role = await prisma.role.create({
      data: { name: name.trim(), description: description?.trim() ?? null },
    });
    await logActivity({ userId: req.user!.id, action: "ROLE_CREATED", entity: "Role", entityId: role.id, metadata: { name: role.name } });
    res.status(201).json(role);
  }
);

// PUT /api/roles/:id — update name/description
router.put(
  "/:id",
  requirePermission("assign_roles"),
  async (req: AuthRequest, res: Response) => {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Role name is required." });
      return;
    }
    const conflict = await prisma.role.findFirst({
      where: { name: name.trim(), NOT: { id: req.params.id } },
    });
    if (conflict) {
      res.status(409).json({ error: "A role with that name already exists." });
      return;
    }
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { name: name.trim(), description: description?.trim() ?? null },
    });
    await logActivity({ userId: req.user!.id, action: "ROLE_UPDATED", entity: "Role", entityId: role.id, metadata: { name: role.name } });
    res.json(role);
  }
);

// DELETE /api/roles/:id — delete role (cannot delete if users assigned)
router.delete(
  "/:id",
  requirePermission("assign_roles"),
  async (req: AuthRequest, res: Response) => {
    const count = await prisma.systemUser.count({ where: { roleId: req.params.id } });
    if (count > 0) {
      res.status(409).json({
        error: `Cannot delete: ${count} user(s) assigned to this role.`,
      });
      return;
    }
    await prisma.role.delete({ where: { id: req.params.id } });
    await logActivity({ userId: req.user!.id, action: "ROLE_DELETED", entity: "Role", entityId: req.params.id });
    res.json({ success: true });
  }
);

// PUT /api/roles/:id/permissions — replace all permissions for a role
router.put(
  "/:id/permissions",
  requirePermission("assign_roles"),
  async (req: AuthRequest, res: Response) => {
    const { permissionIds } = req.body as { permissionIds?: string[] };
    if (!Array.isArray(permissionIds)) {
      res.status(400).json({ error: "permissionIds must be an array." });
      return;
    }
    // Delete existing, insert new — in a transaction
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: req.params.id,
          permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { permissions: { include: { permission: true } } },
    });
    await logActivity({ userId: req.user!.id, action: "ROLE_PERMISSIONS_SET", entity: "Role", entityId: req.params.id, metadata: { permissionCount: permissionIds.length } });
    res.json(role);
  }
);

export default router;
