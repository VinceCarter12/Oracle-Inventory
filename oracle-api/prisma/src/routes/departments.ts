import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

// POST /api/departments
router.post("/", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name, siteId } = req.body as { name?: string; siteId?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Department name is required." }); return; }
  if (!siteId) { res.status(400).json({ error: "Site ID is required." }); return; }
  const department = await prisma.department.create({
    data: { name: name.trim(), siteId },
  });
  await logActivity({ userId: req.user!.id, action: "DEPARTMENT_CREATED", entity: "Department", entityId: department.id, metadata: { name: department.name, siteId: department.siteId } });
  res.status(201).json(department);
});

// DELETE /api/departments/:id
router.delete("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) { res.status(404).json({ error: "Department not found" }); return; }
  await prisma.department.delete({ where: { id: req.params.id } });
  await logActivity({ userId: req.user!.id, action: "DEPARTMENT_DELETED", entity: "Department", entityId: req.params.id, metadata: { name: dept.name } });
  res.json({ success: true });
});

export default router;
