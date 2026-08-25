import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
const statuses = ["disabled", "staged", "pilot", "enabled", "paused"] as const;
const keys = new Set(["enabled", "enabledGlobally", "status", "minimumRole", "expectedUpdatedAt", "reason"]);
export function safeKey(value: string) { return /^[a-z][a-z0-9_.-]{1,80}$/.test(value); }
export function isStaleWrite(updatedAt: Date | string | undefined, expectedUpdatedAt: string | undefined) {
  return Boolean(updatedAt && (!expectedUpdatedAt || new Date(updatedAt).toISOString() !== expectedUpdatedAt));
}
export function redact(value: unknown): unknown {
  if (typeof value === "string" && /(password|secret|token|api.?key|database_url|jwt|postgres(?:ql)?:\/\/|https?:\/\/[^\s]*@)/i.test(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, /password|secret|token|api.?key|database|jwt|credential/i.test(k) ? "[REDACTED]" : redact(v)]));
  return value;
}
async function effective(feature: any, branchId?: string, roleName?: string) {
  const env = process.env[`FEATURE_${feature.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
  if (env === "false" || env === "0") return false;
  const rank: Record<string, number> = { staff: 1, admin: 2, super_admin: 3 };
  if (feature.minimumRole && (rank[roleName?.toLowerCase() ?? ""] ?? 0) < (rank[feature.minimumRole.toLowerCase()] ?? 99)) return false;
  const override = branchId ? await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: feature.key, branchId } } }) : null;
  return override?.enabled ?? (feature.enabledGlobally && feature.status === "enabled");
}

router.get("/feature-flags", async (req: AuthRequest, res: Response) => {
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const currentUser = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const rows = await prisma.featureRollout.findMany({ include: { branchOverrides: true }, orderBy: { key: "asc" } });
  const result = await Promise.all(rows.map(async (feature) => ({ key: feature.key, status: feature.status, minimumRole: feature.minimumRole, enabledGlobally: feature.enabledGlobally, configVersion: feature.configVersion, effective: await effective(feature, branchId, currentUser?.role?.name), branchId })));
  res.json(result);
});

router.put("/feature-flags/:key", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const key = req.params.key;
  if (!safeKey(key) || !req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((field) => !keys.has(field))) { res.status(400).json({ error: "Unknown or invalid rollout fields." }); return; }
  const { enabled, enabledGlobally, status, minimumRole, expectedUpdatedAt, reason } = req.body;
  if (status !== undefined && !statuses.includes(status)) { res.status(400).json({ error: "Invalid rollout status." }); return; }
  const current = await prisma.featureRollout.findUnique({ where: { key } });
  if (current && !expectedUpdatedAt) { res.status(400).json({ error: "expectedUpdatedAt is required for existing rollout changes." }); return; }
  if (current && expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; }
  let updated;
  try { updated = await prisma.$transaction(async (tx) => {
    let row;
    if (current) {
      const cas = await tx.featureRollout.updateMany({ where: { key, updatedAt: new Date(expectedUpdatedAt) }, data: { enabledGlobally: enabledGlobally ?? enabled ?? current.enabledGlobally, status: status ?? current.status, minimumRole: minimumRole ?? current.minimumRole, configVersion: { increment: 1 }, updatedById: req.user!.id } });
      if (cas.count !== 1) throw Object.assign(new Error("STALE_WRITE"), { code: "STALE_WRITE" });
      row = await tx.featureRollout.findUniqueOrThrow({ where: { key } });
    } else {
      row = await tx.featureRollout.create({ data: { key, enabledGlobally: enabledGlobally ?? enabled ?? false, status: status ?? "disabled", minimumRole: minimumRole ?? null, configVersion: 1, updatedById: req.user!.id } });
    }
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "feature_rollout_changed", entity: "FeatureRollout", entityId: row.id, metadata: redact({ actorId: req.user!.id, source: "operations", key, status: row.status, enabled: row.enabledGlobally, reason: typeof reason === "string" ? reason.slice(0, 500) : null }) as any } });
    return row;
  }); } catch (error) { if ((error as { code?: string }).code === "STALE_WRITE") { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; } if ((error as { code?: string }).code === "P2002") { res.status(409).json({ error: "Rollout was created concurrently; retry with its version.", code: "STALE_WRITE" }); return; } throw error; }
  res.json(updated);
});

router.put("/feature-flags/:key/branches/:branchId", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const { key, branchId } = req.params;
  if (!safeKey(key) || typeof req.body?.enabled !== "boolean" || (req.body.reason !== undefined && typeof req.body.reason !== "string")) { res.status(400).json({ error: "enabled boolean and optional reason are required." }); return; }
  const feature = await prisma.featureRollout.findUnique({ where: { key } });
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, archivedAt: true } });
  if (!feature || !branch || branch.archivedAt) { res.status(404).json({ error: "Feature or active branch not found." }); return; }
  const currentOverride = await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: key, branchId } } });
  // First-create semantics: no row means no version exists yet, so expectedUpdatedAt is omitted.
  if (currentOverride && isStaleWrite(currentOverride.updatedAt, req.body.expectedUpdatedAt)) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; }
  let row;
  try { row = await prisma.$transaction(async (tx) => {
    let updated;
    if (currentOverride) {
      const cas = await tx.featureRolloutBranch.updateMany({ where: { featureKey: key, branchId, updatedAt: new Date(req.body.expectedUpdatedAt) }, data: { enabled: req.body.enabled, reason: req.body.reason?.slice(0, 500), updatedById: req.user!.id } });
      if (cas.count !== 1) throw Object.assign(new Error("STALE_WRITE"), { code: "STALE_WRITE" });
      updated = await tx.featureRolloutBranch.findUniqueOrThrow({ where: { featureKey_branchId: { featureKey: key, branchId } } });
    } else updated = await tx.featureRolloutBranch.create({ data: { featureKey: key, branchId, enabled: req.body.enabled, reason: req.body.reason?.slice(0, 500), updatedById: req.user!.id } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "feature_rollout_branch_changed", entity: "FeatureRolloutBranch", entityId: updated.id, metadata: redact({ actorId: req.user!.id, source: "operations", key, branchId, enabled: updated.enabled, reason: updated.reason }) as any } });
    return updated;
  }); } catch (error) { if ((error as { code?: string }).code === "STALE_WRITE" || (error as { code?: string }).code === "P2002") { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; } throw error; }
  res.json(row);
});

export default router;
