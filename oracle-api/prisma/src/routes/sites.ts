import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

const include = {
  _count: { select: { assets: true, employees: true } },
  departments: { select: { id: true, name: true } },
};

// GET /api/sites — excludes archived by default; ?includeArchived=true to include
router.get("/", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const includeArchived = req.query.includeArchived === "true";
  const sites = await prisma.site.findMany({
    where: includeArchived ? undefined : { archivedAt: null },
    include,
    orderBy: { name: "asc" },
  });
  res.json(sites);
});

// POST /api/sites
router.post("/", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name, address, latitude, longitude } = req.body;
  if (!name) { res.status(400).json({ error: "Site name is required." }); return; }
  const site = await prisma.site.create({
    data: {
      name,
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
    include,
  });
  await logActivity({ userId: req.user!.id, action: "SITE_CREATED", entity: "Site", entityId: site.id, metadata: { name: site.name } });
  res.status(201).json(site);
});

// GET /api/sites/:id
router.get("/:id", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const site = await prisma.site.findUnique({ where: { id: req.params.id }, include });
  if (!site) { res.status(404).json({ error: "Site not found" }); return; }
  res.json(site);
});

// PUT /api/sites/:id — edit name, address, coordinates
router.put("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name, address, latitude, longitude } = req.body;
  if (!name) { res.status(400).json({ error: "Site name is required." }); return; }
  const site = await prisma.site.update({
    where: { id: req.params.id },
    data: {
      name,
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
    include,
  });
  await logActivity({ userId: req.user!.id, action: "SITE_UPDATED", entity: "Site", entityId: site.id, metadata: { name: site.name } });
  res.json(site);
});

// PATCH /api/sites/:id/archive — toggle archived state
router.patch("/:id/archive", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const existing = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Site not found" }); return; }
  const site = await prisma.site.update({
    where: { id: req.params.id },
    data: { archivedAt: existing.archivedAt ? null : new Date() },
  });
  await logActivity({ userId: req.user!.id, action: site.archivedAt ? "SITE_ARCHIVED" : "SITE_UNARCHIVED", entity: "Site", entityId: site.id, metadata: { name: existing.name } });
  res.json(site);
});

export default router;
