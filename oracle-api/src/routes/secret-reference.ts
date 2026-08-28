import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { broadcastChange } from "../lib/ws";

const router = Router();

// SecretReference metadata (provider/referenceId/label) carries no secret
// material, but each domain that links it to an asset (CCTV, Servers/
// Firewall/ISP, Network) still owns its own rollout gate — this file only
// decides which gate applies, it doesn't loosen any of them.
type Domain = "cctv" | "servers" | "network";
const domainFeature: Record<Domain, { key: string; env: string }> = {
  cctv:    { key: "cctv.nvr.v1",             env: "CCTV_NVR_ENABLED" },
  servers: { key: "servers.firewall.isp.v1", env: "SERVERS_FIREWALL_ISP_ENABLED" },
  network: { key: "network.v1",              env: "NETWORK_INFRA_ENABLED" },
};
const domainEnabled = async (domain: Domain, branchId?: string) => {
  const { key, env } = domainFeature[domain];
  if (process.env[env] !== "true") return false;
  const feature = await prisma.featureRollout.findUnique({ where: { key } }).catch(() => null);
  if (!feature) return false;
  const override = branchId ? await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: key, branchId } } }).catch(() => null) : null;
  return Boolean(override?.enabled ?? (feature.enabledGlobally && feature.status === "enabled"));
};
const anyDomainEnabled = async (branchId?: string) => {
  for (const domain of Object.keys(domainFeature) as Domain[]) if (await domainEnabled(domain, branchId)) return true;
  return false;
};
const domainForCategory = (name: string | null | undefined): Domain | null => {
  const value = (name ?? "").toLowerCase();
  if (/camera|cctv|nvr|dvr|recorder/.test(value)) return "cctv";
  if (/firewall|server/.test(value)) return "servers";
  if (/access.?point|\bap\b|switch/.test(value)) return "network";
  return null;
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
  const asset = assetId ? await prisma.asset.findUnique({ where: { id: assetId }, select: { branchId: true, category: { select: { name: true } } } }) : null;
  if (assetId) { if (!asset) return res.status(404).json({ error: "Asset not found." }); if (!superAdmin && asset.branchId !== user?.branchId) return res.status(403).json({ error: "Asset is outside your scope." }); }
  const domain = asset ? domainForCategory(asset.category?.name) : null;
  const gateOk = domain ? await domainEnabled(domain, asset?.branchId ?? user?.branchId ?? undefined) : await anyDomainEnabled(user?.branchId ?? undefined);
  if (!gateOk) return res.status(503).json({ error: "This inventory domain is disabled.", code: "INFRASTRUCTURE_DISABLED" });
  const links = await prisma.assetSecretReference.findMany({ where: assetId ? { assetId } : undefined, include: { secretReference: { select: { id: true, provider: true, displayLabel: true, system: true, ownerTeam: true, rotationAt: true } } } });
  res.json({ items: links.map((link) => ({ id: link.id, assetId: link.assetId, cameraProfileId: link.cameraProfileId, reference: link.secretReference })) });
});

router.post("/", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const body = req.body as Record<string, unknown>; const allowed = ["provider", "referenceId", "displayLabel", "system", "ownerTeam", "rotationAt"]; const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length || hasSecret(body)) return res.status(400).json({ error: "Only secret-reference metadata is accepted.", code: "INVALID_SECRET_REFERENCE", fieldErrors: unknown });
  const branchId = (await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true } }))?.branchId ?? undefined;
  if (!(await anyDomainEnabled(branchId))) return res.status(503).json({ error: "No infrastructure domain that uses secret references is enabled.", code: "INFRASTRUCTURE_DISABLED" });
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""; const referenceId = typeof body.referenceId === "string" ? body.referenceId.trim() : ""; if (!provider || !referenceId) return res.status(400).json({ error: "provider and referenceId are required." });
  try { const item = await prisma.$transaction(async (tx) => { const created = await tx.secretReference.create({ data: { provider, referenceId, displayLabel: typeof body.displayLabel === "string" ? body.displayLabel.trim() : null, system: typeof body.system === "string" ? body.system.trim() : null, ownerTeam: typeof body.ownerTeam === "string" ? body.ownerTeam.trim() : null, rotationAt: typeof body.rotationAt === "string" ? new Date(body.rotationAt) : null } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "secret_reference_created", entity: "SecretReference", entityId: created.id, metadata: { source: "secret_reference_alias", actorId: req.user!.id, provider, referenceRecorded: true } } }); return created; }); broadcastChange({ entity: "SecretReference", action: "secret_reference_created", entityId: item.id, branchId: null }); res.status(201).json(item); } catch { res.status(409).json({ error: "Secret reference already exists.", code: "DUPLICATE_SECRET_REFERENCE" }); }
});

export default router;
export { hasSecret };
