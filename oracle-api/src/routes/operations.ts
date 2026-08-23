import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
const statuses = ["disabled", "staged", "pilot", "enabled", "paused"] as const;
const minimumRoles = ["staff", "admin", "super_admin"] as const;
const featureFields = new Set(["enabled", "enabledGlobally", "status", "minimumRole", "expectedUpdatedAt", "reason"]);
const branchFields = new Set(["enabled", "expectedUpdatedAt", "reason"]);
const secretLike = /(password|passphrase|secret|token|api[_ -]?key|database[_ -]?url|jwt|credential|postgres(?:ql)?:\/\/|https?:\/\/[^\s]*@)/i;
const roleRank: Record<string, number> = { staff: 1, admin: 2, super_admin: 3 };

export function safeKey(value: string) { return /^[a-z][a-z0-9_.-]{1,80}$/.test(value); }
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
export function isStaleWrite(updatedAt: Date | string | undefined, expectedUpdatedAt: string | undefined) {
  return Boolean(updatedAt && (!expectedUpdatedAt || new Date(updatedAt).toISOString() !== expectedUpdatedAt));
}
export function redact(value: unknown): unknown {
  if (typeof value === "string" && secretLike.test(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, /password|passphrase|secret|token|api[_ -]?key|database|jwt|credential/i.test(key) ? "[REDACTED]" : redact(nested)]));
  return value;
}
function invalidObject(body: unknown, fields: Set<string>) { return !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body as object).some((field) => !fields.has(field)); }
function validReason(reason: unknown) { return reason === undefined || (typeof reason === "string" && reason.length <= 500 && !secretLike.test(reason)); }
function validExpected(value: unknown) { return value === undefined || isIsoTimestamp(value); }
async function currentUser(req: AuthRequest) { return prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { id: true, branchId: true, role: { select: { name: true } } } }); }

export async function effective(feature: { key: string; enabledGlobally: boolean; status: string; minimumRole: string | null; branchOverrides?: Array<{ branchId: string; enabled: boolean }> }, branchId?: string, roleName?: string) {
  const envKey = `FEATURE_${feature.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  if (process.env[envKey]?.trim().toLowerCase() !== "true") return false;
  const minimumRole = feature.minimumRole?.trim().toLowerCase();
  if (minimumRole && (roleRank[roleName?.trim().toLowerCase() ?? ""] ?? 0) < (roleRank[minimumRole] ?? Number.MAX_SAFE_INTEGER)) return false;
  if (feature.status === "disabled" || feature.status === "paused") return false;
  const override = branchId ? feature.branchOverrides?.find((item) => item.branchId === branchId) : undefined;
  return override?.enabled ?? (feature.status === "enabled" && feature.enabledGlobally);
}

router.get("/feature-flags", async (req: AuthRequest, res: Response) => {
  const requestedBranchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  const isSuperAdmin = user.role?.name?.trim().toLowerCase() === "super_admin";
  if (requestedBranchId && !isSuperAdmin) { res.status(403).json({ error: "Only a Super Admin may select another branch." }); return; }
  const branchId = requestedBranchId ?? (isSuperAdmin ? undefined : user.branchId ?? undefined);
  const rows = await prisma.featureRollout.findMany({ include: { branchOverrides: branchId ? { where: { branchId } } : true }, orderBy: { key: "asc" } });
  res.json(await Promise.all(rows.map(async (feature) => ({ key: feature.key, status: feature.status, minimumRole: feature.minimumRole, enabledGlobally: feature.enabledGlobally, configVersion: feature.configVersion, effective: await effective(feature, branchId, user.role?.name), branchId: branchId ?? null, updatedAt: feature.updatedAt.toISOString() }))));
});

router.put("/feature-flags/:key", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const key = req.params.key; const body = req.body as Record<string, unknown>;
  if (!safeKey(key) || invalidObject(body, featureFields) || !validReason(body.reason) || !validExpected(body.expectedUpdatedAt)) { res.status(400).json({ error: "Unknown or invalid rollout fields." }); return; }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") { res.status(400).json({ error: "enabled must be a boolean." }); return; }
  if (body.enabledGlobally !== undefined && typeof body.enabledGlobally !== "boolean") { res.status(400).json({ error: "enabledGlobally must be a boolean." }); return; }
  if (body.status !== undefined && (typeof body.status !== "string" || !statuses.includes(body.status as typeof statuses[number]))) { res.status(400).json({ error: "Invalid rollout status." }); return; }
  if (body.minimumRole !== undefined && body.minimumRole !== null && (typeof body.minimumRole !== "string" || !minimumRoles.includes(body.minimumRole.trim().toLowerCase() as typeof minimumRoles[number]))) { res.status(400).json({ error: "Invalid minimumRole." }); return; }
  const current = await prisma.featureRollout.findUnique({ where: { key } });
  if (current && body.expectedUpdatedAt === undefined) { res.status(400).json({ error: "expectedUpdatedAt is required for existing rollout changes." }); return; }
  if (current && current.updatedAt.toISOString() !== body.expectedUpdatedAt) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      let row;
      if (current) {
        const cas = await tx.featureRollout.updateMany({ where: { key, updatedAt: new Date(body.expectedUpdatedAt as string) }, data: { enabledGlobally: (body.enabledGlobally ?? body.enabled ?? current.enabledGlobally) as boolean, status: (body.status ?? current.status) as typeof statuses[number], minimumRole: body.minimumRole === undefined ? current.minimumRole : body.minimumRole as string | null, configVersion: { increment: 1 }, updatedById: req.user!.id } });
        if (cas.count !== 1) throw Object.assign(new Error("STALE_WRITE"), { code: "STALE_WRITE" });
        row = await tx.featureRollout.findUniqueOrThrow({ where: { key } });
      } else row = await tx.featureRollout.create({ data: { key, enabledGlobally: (body.enabledGlobally ?? body.enabled ?? false) as boolean, status: (body.status ?? "disabled") as typeof statuses[number], minimumRole: body.minimumRole as string | null | undefined, configVersion: 1, updatedById: req.user!.id } });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "feature_rollout_changed", entity: "FeatureRollout", entityId: row.id, metadata: redact({ key, status: row.status, enabled: row.enabledGlobally, reason: body.reason }) as any } });
      return row;
    });
    res.json({ key: updated.key, status: updated.status, enabledGlobally: updated.enabledGlobally, minimumRole: updated.minimumRole, configVersion: updated.configVersion, updatedAt: updated.updatedAt.toISOString() });
  } catch (error) { const code = (error as { code?: string }).code; if (code === "STALE_WRITE" || code === "P2002") { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; } throw error; }
});

router.put("/feature-flags/:key/branches/:branchId", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const { key, branchId } = req.params; const body = req.body as Record<string, unknown>;
  if (!safeKey(key) || !branchId || invalidObject(body, branchFields) || typeof body.enabled !== "boolean" || !validReason(body.reason) || !validExpected(body.expectedUpdatedAt)) { res.status(400).json({ error: "enabled boolean, optional reason, and valid expectedUpdatedAt are required." }); return; }
  const feature = await prisma.featureRollout.findUnique({ where: { key } });
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, archivedAt: true } });
  if (!feature || !branch || branch.archivedAt) { res.status(404).json({ error: "Feature or active branch not found." }); return; }
  const existing = await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: key, branchId } } });
  if (existing && body.expectedUpdatedAt === undefined) { res.status(400).json({ error: "expectedUpdatedAt is required for existing branch overrides." }); return; }
  if (existing && existing.updatedAt.toISOString() !== body.expectedUpdatedAt) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; }
  try {
    const row = await prisma.$transaction(async (tx) => {
      let updated;
      if (existing) {
        const cas = await tx.featureRolloutBranch.updateMany({ where: { featureKey: key, branchId, updatedAt: new Date(body.expectedUpdatedAt as string) }, data: { enabled: body.enabled as boolean, reason: body.reason as string | undefined, updatedById: req.user!.id } });
        if (cas.count !== 1) throw Object.assign(new Error("STALE_WRITE"), { code: "STALE_WRITE" });
        updated = await tx.featureRolloutBranch.findUniqueOrThrow({ where: { featureKey_branchId: { featureKey: key, branchId } } });
      } else updated = await tx.featureRolloutBranch.create({ data: { featureKey: key, branchId, enabled: body.enabled as boolean, reason: body.reason as string | undefined, updatedById: req.user!.id } });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "feature_rollout_branch_changed", entity: "FeatureRolloutBranch", entityId: updated.id, metadata: redact({ key, branchId, enabled: updated.enabled, reason: updated.reason }) as any } });
      return updated;
    });
    res.json({ key: row.featureKey, branchId: row.branchId, enabled: row.enabled, reason: row.reason, updatedAt: row.updatedAt.toISOString() });
  } catch (error) { const code = (error as { code?: string }).code; if (code === "STALE_WRITE" || code === "P2002") { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE" }); return; } throw error; }
});

export default router;
