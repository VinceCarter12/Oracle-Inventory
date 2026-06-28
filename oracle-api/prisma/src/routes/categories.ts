import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

// GET /api/categories
router.get("/", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  res.json(categories);
});

// POST /api/categories
router.post("/", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Category name is required." }); return; }
  const category = await prisma.category.create({
    data: { name: name.trim() },
    include: { _count: { select: { assets: true } } },
  });
  await logActivity({ userId: req.user!.id, action: "CATEGORY_CREATED", entity: "Category", entityId: category.id, metadata: { name: category.name } });
  res.status(201).json(category);
});

// PUT /api/categories/:id
router.put("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Category name is required." }); return; }
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Category not found" }); return; }
  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: { name: name.trim() },
    include: { _count: { select: { assets: true } } },
  });
  await logActivity({ userId: req.user!.id, action: "CATEGORY_UPDATED", entity: "Category", entityId: category.id, metadata: { name: category.name } });
  res.json(category);
});

// DELETE /api/categories/:id
router.delete("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const cat = await prisma.category.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { assets: true } } },
  });
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  if (cat._count.assets > 0) {
    res.status(400).json({ error: "Cannot delete a category that has assets." });
    return;
  }
  await prisma.category.delete({ where: { id: req.params.id } });
  await logActivity({ userId: req.user!.id, action: "CATEGORY_DELETED", entity: "Category", entityId: req.params.id, metadata: { name: cat.name } });
  res.json({ success: true });
});

export default router;
