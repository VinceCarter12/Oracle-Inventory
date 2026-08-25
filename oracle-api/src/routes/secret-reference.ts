import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
const enabled = async (branchId?: string) => {
  if (process.env.CCTV_NVR_ENABLED !== "true") return false;
  const feature = await prisma.featureRollout.findUnique({ where: { key: "cctv.nvr.v1" } }).catch(() => null);
  if (!feature) return false;
  const override = branchId ? await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: "cctv.nvr.v1", branchId } } }).catch(() => null) : null;
  return Boolean(override?.enabled ?? (feature.enabledGlobally && feature.status === "enabled"));
};
const forbidden = /password|passwd|pwd|secret|token|credential|username|login|api.?key|private.?key|license.?key|rtsp|onvif|stream|recovery|config/i;
const hasSecret = (value: unknown, path = ""): boolean => {
  if (path && forbidden.test(path)) return true;
  if (typeof value === "string") return forbidden.test(value) || /:\/\/[^/\s]+:[^@\s]+@/i.test(value);
  if (Array.isArray(value)) return value.some((item, index) => hasSecret(item, `${path}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).some(([key, item]) => hasSecret(item, path ? `${path}.${key}` : key));
  return false;
};

router.use(requireAuth);
router.get("/", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : undefined;
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  const superAdmin = user?.role?.name.toLowerCase() === "super_admin";
  if (!assetId && !superAdmin) return res.status(403).json({ error: "Global secret-reference listing is restricted." });
  if (assetId) { const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { branchId: true } }); if (!asset) return res.status(404).json({ error: "Asset not found." }); if (!superAdmin && asset.branchId !== user?.branchId) return res.status(403).json({ error: "Asset is outside your scope." }); }
  const asset = assetId ? await prisma.asset.findUnique({ where: { id: assetId }, select: { branchId: true } }) : null; if (!(await enabled(asset?.branchId ?? user?.branchId ?? undefined))) return res.status(503).json({ error: "CCTV/NVR inventory is disabled.", code: "CCTV_NVR_DISABLED" });
  const links = await prisma.assetSecretReference.findMany({ where: assetId ? { assetId } : undefined, include: { secretReference: { select: { id: true, provider: true, displayLabel: true, system: true, ownerTeam: true, rotationAt: true } } } });
  res.json({ items: links.map((link) => ({ id: link.id, assetId: link.assetId, cameraProfileId: link.cameraProfileId, reference: link.secretReference })) });
});

router.post("/", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const body = req.body as Record<string, unknown>; const allowed = ["provider", "referenceId", "displayLabel", "system", "ownerTeam", "rotationAt"]; const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length || hasSecret(body)) return res.status(400).json({ error: "Only secret-reference metadata is accepted.", code: "INVALID_SECRET_REFERENCE", fieldErrors: unknown });
  if (!(await enabled((await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true } }))?.branchId ?? undefined))) return res.status(503).json({ error: "CCTV/NVR inventory is disabled.", code: "CCTV_NVR_DISABLED" });
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""; const referenceId = typeof body.referenceId === "string" ? body.referenceId.trim() : ""; if (!provider || !referenceId) return res.status(400).json({ error: "provider and referenceId are required." });
  try { const item = await prisma.$transaction(async (tx) => { const created = await tx.secretReference.create({ data: { provider, referenceId, displayLabel: typeof body.displayLabel === "string" ? body.displayLabel.trim() : null, system: typeof body.system === "string" ? body.system.trim() : null, ownerTeam: typeof body.ownerTeam === "string" ? body.ownerTeam.trim() : null, rotationAt: typeof body.rotationAt === "string" ? new Date(body.rotationAt) : null } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "secret_reference_created", entity: "SecretReference", entityId: created.id, metadata: { source: "secret_reference_alias", actorId: req.user!.id, provider, referenceRecorded: true } } }); return created; }); res.status(201).json(item); } catch { res.status(409).json({ error: "Secret reference already exists.", code: "DUPLICATE_SECRET_REFERENCE" }); }
});

export default router;
export { hasSecret };
