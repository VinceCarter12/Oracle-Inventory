import { Router, Response } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

const ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ATTACHMENT_MIME_TYPES.has(file.mimetype)),
});

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
  deviceProfile: true,
  components: true,
};
async function scopedAssetWhere(req: AuthRequest) {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  return user?.role?.name?.trim().toLowerCase() === "super_admin" ? {} : { branchId: user?.branchId ?? "__no_branch__" };
}

// GET /api/assets/stats — must be before /:id
router.get("/stats", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const scope = await scopedAssetWhere(req);
  const [total, assigned, forRepair, forDisposal, lost, stolen, available] = await Promise.all([
    prisma.asset.count({ where: scope }),
    prisma.assetAssignment.count({ where: { status: "active", asset: scope } }),
    prisma.asset.count({ where: { ...scope, condition: "for_repair" } }),
    prisma.asset.count({ where: { ...scope, condition: "for_disposal" } }),
    prisma.asset.count({ where: { ...scope, status: "lost" } }),
    prisma.asset.count({ where: { ...scope, status: "stolen" } }),
    prisma.asset.count({
      where: { ...scope, status: "active", condition: "usable", assignments: { none: { status: "active" } } },
    }),
  ]);
  res.json({ total, assigned, available, forRepair, forDisposal, lost, stolen });
});

// GET /api/assets
// Backward compatible: no page/limit → full array, unchanged for existing callers.
// Pass page and/or limit to opt into { items, total, page, limit }; q/category/available filter server-side.
router.get("/", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const { q, page, limit, category, available } = req.query;
  const scope = await scopedAssetWhere(req);

  const where: Record<string, unknown> = { ...scope };
  if (typeof q === "string" && q.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { serialNumber: { contains: term, mode: "insensitive" } },
    ];
  }
  if (typeof category === "string" && category.trim() && category !== "All") {
    where.category = { name: category };
  }
  if (available === "true") {
    where.condition = "usable";
    where.assignments = { none: { status: "active" } };
  }

  if (page === undefined && limit === undefined) {
    const assets = await prisma.asset.findMany({ where, include, orderBy: { createdAt: "desc" } });
    res.json(assets);
    return;
  }

  const pageNum  = Math.max(1, parseInt(String(page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(limit ?? "20"), 10) || 20));

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where, include, orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  res.json({ items, total, page: pageNum, limit: pageSize });
});

// GET /api/assets/:id
router.get("/:id", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, ...(await scopedAssetWhere(req)) }, include });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(asset);
});

// POST /api/assets
router.post("/", requirePermission("create_inventory"), async (req: AuthRequest, res: Response) => {
  const { name, serialNumber, categoryId, branchId, condition, ownership, description, warrantyExpiry, nextMaintenanceDate, imeiNumber, propertyTag } = req.body;
  if (!name) { res.status(400).json({ error: "Asset name is required." }); return; }
  if (!branchId) { res.status(400).json({ error: "Branch is required." }); return; }

  const asset = await prisma.asset.create({
    data: {
      name,
      serialNumber: serialNumber || null,
      categoryId: categoryId || null,
      branchId: branchId || null,
      condition: condition ?? "usable",
      ownership: ownership ?? "company",
      description: description || null,
      warrantyExpiry: warrantyExpiry || null,
      nextMaintenanceDate: nextMaintenanceDate || null,
      imeiNumber: imeiNumber || null,
      propertyTag: propertyTag || null,
    },
    include,
  });

  await logActivity({ userId: req.user!.id, action: "create", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: { name } });
  res.status(201).json(asset);
});

// PUT /api/assets/:id
router.put("/:id", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const { name, serialNumber, categoryId, branchId, condition, ownership, description, warrantyExpiry, nextMaintenanceDate, imeiNumber, propertyTag } = req.body;
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
      warrantyExpiry: warrantyExpiry !== undefined ? (warrantyExpiry || null) : existing.warrantyExpiry,
      nextMaintenanceDate: nextMaintenanceDate !== undefined ? (nextMaintenanceDate || null) : existing.nextMaintenanceDate,
      imeiNumber: imeiNumber !== undefined ? (imeiNumber || null) : existing.imeiNumber,
      propertyTag: propertyTag !== undefined ? (propertyTag || null) : existing.propertyTag,
    },
    include,
  });

  await logActivity({ userId: req.user!.id, action: "update", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: { name } });
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

  await logActivity({ userId: req.user!.id, action: "delete", entity: "Asset", entityId: req.params.id, branchId: existing.branchId, metadata: { name: existing.name } });
  res.json({ success: true });
});

// ── Components (peripherals, RAM/storage, etc.) ────────────────────────────────
// Generic child rows on any asset — reused for peripherals (Monitor, Keyboard,
// Printer, etc.) attached to any category, not just the Computer/Laptop
// draft flow's own ram/storage rows.
const componentTypes = new Set([
  "ram", "storage", "monitor", "keyboard", "mouse", "speaker", "webcam", "microphone",
  "printer", "ups", "avr", "clicker", "projector", "tv", "signal_booster", "flash_drive",
  "external_hdd", "hdd_ssd_docking_station", "nvme_docking_station",
]);

// POST /api/assets/:id/components
router.post("/:id/components", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

  const rows = Array.isArray(req.body?.components) ? req.body.components : [];
  if (rows.length === 0 || rows.length > 64) { res.status(400).json({ error: "Provide 1-64 component rows." }); return; }
  for (const row of rows) {
    if (!row || typeof row !== "object" || !componentTypes.has(row.type)) { res.status(400).json({ error: "Each component row needs a valid type." }); return; }
  }

  const created = await prisma.$transaction(
    rows.map((row: Record<string, unknown>) => prisma.assetComponent.create({
      data: {
        assetId: asset.id,
        type: row.type as never,
        slotOrBay: typeof row.slotOrBay === "string" ? row.slotOrBay.trim() || null : null,
        brand: typeof row.brand === "string" ? row.brand.trim() || null : null,
        model: typeof row.model === "string" ? row.model.trim() || null : null,
        serialNumber: typeof row.serialNumber === "string" ? row.serialNumber.trim() || null : null,
        capacity: typeof row.capacity === "string" ? row.capacity.trim() || null : null,
        storageKind: typeof row.storageKind === "string" ? row.storageKind.trim() || null : null,
        propertyTag: typeof row.propertyTag === "string" ? row.propertyTag.trim() || null : null,
      },
    }))
  );

  await logActivity({ userId: req.user!.id, action: "components_added", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: { count: created.length } });
  res.status(201).json({ items: created });
});

// PUT /api/assets/:id/device-profile
// Generic motherboard/processor record for any asset (Server hardware needs
// this too, not just Computer/Laptop) — reuses the same DeviceProfile model.
router.put("/:id/device-profile", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

  const { brand, model, processor, motherboard } = req.body ?? {};
  const data = {
    brand: typeof brand === "string" ? brand.trim() || null : null,
    model: typeof model === "string" ? model.trim() || null : null,
    processor: typeof processor === "string" ? processor.trim() || null : null,
    motherboard: typeof motherboard === "string" ? motherboard.trim() || null : null,
  };

  const profile = await prisma.deviceProfile.upsert({
    where: { assetId: asset.id },
    create: { assetId: asset.id, ...data },
    update: data,
  });

  await logActivity({ userId: req.user!.id, action: "device_profile_saved", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: {} });
  res.json(profile);
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

  await logActivity({ userId: req.user!.id, action: "report_lost", entity: "Asset", entityId: asset.id, branchId: updated.branchId, metadata: { name: asset.name, notes } });
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

  await logActivity({ userId: req.user!.id, action: "report_stolen", entity: "Asset", entityId: asset.id, branchId: updated.branchId, metadata: { name: asset.name, notes } });
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

  await logActivity({ userId: req.user!.id, action: "recovered", entity: "Asset", entityId: asset.id, branchId: updated.branchId, metadata: { name: asset.name, skip, condition } });
  res.json(updated);
});

// ── Attachments ─────────────────────────────────────────────────────────────

// POST /api/assets/:id/attachments
router.post("/:id/attachments", requirePermission("edit_inventory"), attachmentUpload.single("file"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, ...(await scopedAssetWhere(req)) } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "A file is required, and must be one of: PDF, CSV, ZIP, DOCX, XLSX, JPEG, PNG (max 5MB)." }); return; }

  const attachment = await prisma.assetAttachment.create({
    data: {
      assetId: asset.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      data: new Uint8Array(req.file.buffer),
      uploadedById: req.user!.id,
    },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, uploadedById: true },
  });

  await logActivity({ userId: req.user!.id, action: "attachment_upload", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: { fileName: attachment.fileName } });
  res.status(201).json(attachment);
});

// GET /api/assets/:id/attachments
router.get("/:id/attachments", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, ...(await scopedAssetWhere(req)) } });
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }

  const attachments = await prisma.assetAttachment.findMany({
    where: { assetId: asset.id },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(attachments);
});

// GET /api/assets/attachments/:attachmentId/download
router.get("/attachments/:attachmentId/download", requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const attachment = await prisma.assetAttachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }
  const asset = await prisma.asset.findFirst({ where: { id: attachment.assetId, ...(await scopedAssetWhere(req)) }, select: { id: true } });
  if (!asset) { res.status(404).json({ error: "Attachment not found" }); return; }

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
  res.send(Buffer.from(attachment.data));
});

// DELETE /api/assets/attachments/:attachmentId
router.delete("/attachments/:attachmentId", requirePermission("edit_inventory"), async (req: AuthRequest, res: Response) => {
  const attachment = await prisma.assetAttachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }
  const asset = await prisma.asset.findFirst({ where: { id: attachment.assetId, ...(await scopedAssetWhere(req)) }, select: { id: true, name: true, branchId: true } });
  if (!asset) { res.status(404).json({ error: "Attachment not found" }); return; }

  await prisma.assetAttachment.delete({ where: { id: attachment.id } });
  await logActivity({ userId: req.user!.id, action: "attachment_delete", entity: "Asset", entityId: asset.id, branchId: asset.branchId, metadata: { fileName: attachment.fileName } });
  res.json({ success: true });
});

export default router;
