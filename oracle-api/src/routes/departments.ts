import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// POST /api/departments
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, siteId } = req.body as { name?: string; siteId?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Department name is required." }); return; }
  if (!siteId) { res.status(400).json({ error: "Site ID is required." }); return; }
  const department = await prisma.department.create({
    data: { name: name.trim(), siteId },
  });
  res.status(201).json(department);
});

// DELETE /api/departments/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) { res.status(404).json({ error: "Department not found" }); return; }
  await prisma.department.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
