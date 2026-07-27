import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

const include = {
  category: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  assignments: {
    where: { status: "active" as const },
    include: { employee: { select: { id: true, name: true, employeeId: true, department: { select: { id: true, name: true } } } } },
  },
  movementLogs: {
    orderBy: { createdAt: "desc" as const },
    include: { employee: { select: { id: true, name: true } } },
  },
};

// GET /api/assets/stats — must be before /:id
router.get("/stats", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const [total, assigned, forRepair, forDisposal, lost, stolen, available] = await Promise.all([
    prisma.asset.count(),
    prisma.assetAssignment.count({ where: { status: "active" } }),
    prisma.asset.count({ where: { condition: "for_repair" } }),
    prisma.asset.count({ where: { condition: "for_disposal" } }),
    prisma.asset.count({ where: { status: "lost" } }),
    prisma.asset.count({ where: { status: "stolen" } }),
    prisma.asset.count({
      where: { status: "active", condition: "usable", assignments: { none: { status: "active" } } },
    }),
  ]);
  res.json({ total, assigned, available, forRepair, forDisposal, lost, stolen });
});

// GET /api/assets
router.get("/", requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  const assets = await prisma.asset.findMany({ include, orderBy: { createdAt: "desc" } });
  res.json(assets);
});

// GET /api/assets/:id
router.get("/:id", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, include });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(asset);
});

// POST /api/assets
router.post("/", requirePermission("create_inventory"), async (req: AuthRequest, res: Response) => {
  const { name, serialNumber, categoryId, branchId, condition, ownership, description } = req.body;
  if (!name) { res.status(400).json({ error: "Asset name is required." }); return; }

  const asset = await prisma.asset.create({
    data: {
      name,
      serialNumber: serialNumber || null,
      categoryId: categoryId || null,
      branchId: branchId || null,
      condition: condition ?? "usable",
      ownership: ownership ?? "company",
      description: description || null,
    },
    include,
  });

  await logActivity({ userId: req.user!.id, action: "create", entity: "Asset", entityId: asset.id, metadata: { name } });
  res.status(201).json(asset);
});

// PUT /api/assets/:id
router.put("/:id", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const { name, serialNumber, categoryId, branchId, condition, ownership, description } = req.body;
  if (!name) { res.status(400).json({ error: "Asset name is required." }); return; }

  const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Asset not found" }); return; }

  const asset = await prisma.asset.update({
    where: { id: req.params.id },
    data: {
      name,
      serialNumber: serialNumber || null,
      categoryId: categoryId || null,
      branchId: branchId || null,
      condition: condition ?? existing.condition,
      ownership: ownership ?? existing.ownership,
      description: description || null,
    },
    include,
  });

  await logActivity({ userId: req.user!.id, action: "update", entity: "Asset", entityId: asset.id, metadata: { name } });
  res.json(asset);
});

// DELETE /api/assets/:id
router.delete("/:id", requirePermission("delete_inventory"), async (req: AuthRequest, res: Response) => {
  const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Asset not found" }); return; }

  try {
    await prisma.$transaction([
      prisma.assetAssignment.deleteMany({ where: { assetId: req.params.id } }),
      prisma.movementLog.deleteMany({ where: { assetId: req.params.id } }),
      prisma.asset.delete({ where: { id: req.params.id } }),
    ]);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete asset", detail: err?.message });
    return;
  }

  await logActivity({ userId: req.user!.id, action: "delete", entity: "Asset", entityId: req.params.id, metadata: { name: existing.name } });
  res.json({ success: true });
});

// ── Lost / Stolen / Recovery ──────────────────────────────────────────────────

// POST /api/assets/:id/report-lost
router.post("/:id/report-lost", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (asset.status === "lost") { res.status(400).json({ error: "Asset is already marked as lost" }); return; }

  // Suspend any active assignments
  await prisma.assetAssignment.updateMany({
    where: { assetId: asset.id, status: { in: ["active", "pending_return"] } },
    data: { status: "returned", returnedAt: new Date() },
  });

  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: { status: "lost", lostAt: new Date(), lostStolenNotes: notes || null },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: asset.id, type: "lost_report", notes: notes || `${asset.name} reported as lost` },
  });

  await logActivity({ userId: req.user!.id, action: "report_lost", entity: "Asset", entityId: asset.id, metadata: { name: asset.name, notes } });
  res.json(updated);
});

// POST /api/assets/:id/report-stolen
router.post("/:id/report-stolen", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (asset.status === "stolen") { res.status(400).json({ error: "Asset is already marked as stolen" }); return; }

  await prisma.assetAssignment.updateMany({
    where: { assetId: asset.id, status: { in: ["active", "pending_return"] } },
    data: { status: "returned", returnedAt: new Date() },
  });

  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: { status: "stolen", lostAt: new Date(), lostStolenNotes: notes || null },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: asset.id, type: "stolen_report", notes: notes || `${asset.name} reported as stolen` },
  });

  await logActivity({ userId: req.user!.id, action: "report_stolen", entity: "Asset", entityId: asset.id, metadata: { name: asset.name, notes } });
  res.json(updated);
});

// POST /api/assets/:id/recover
// Body: { condition?, notes?, inspector?, skip? }
// skip=true → bypass verification, mark recovered with condition=usable + note "Recovery unverified"
router.post("/:id/recover", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const { condition = "usable", notes, inspector, skip = false } = req.body;
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (asset.status === "active") { res.status(400).json({ error: "Asset is not lost or stolen" }); return; }

  const recoveryNotes = skip
    ? "Recovery unverified — marked recovered without inspection"
    : [notes, inspector ? `Inspector: ${inspector}` : null].filter(Boolean).join(" | ");

  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: {
      status: "active",
      condition: skip ? "usable" : (condition as "usable" | "for_repair" | "for_disposal"),
      lostAt: null,
      lostStolenNotes: null,
    },
    include,
  });

  await prisma.movementLog.create({
    data: { assetId: asset.id, type: "recovery", notes: recoveryNotes || `${asset.name} recovered` },
  });

  await logActivity({ userId: req.user!.id, action: "recovered", entity: "Asset", entityId: asset.id, metadata: { name: asset.name, skip, condition } });
  res.json(updated);
});

export default router;
