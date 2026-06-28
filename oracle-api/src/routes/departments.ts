import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/departments
router.get("/", async (_req: AuthRequest, res: Response) => {
  const departments = await prisma.department.findMany({
    include: { _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });
  res.json(departments);
});

// POST /api/departments
router.post("/", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Department name is required." }); return; }
  const department = await prisma.department.create({
    data: { name: name.trim() },
  });
  res.status(201).json(department);
});

// DELETE /api/departments/:id
router.delete("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) { res.status(404).json({ error: "Department not found" }); return; }
  await prisma.department.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
