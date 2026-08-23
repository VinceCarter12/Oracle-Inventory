import { Router, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { effective } from "./operations";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
const blockedKey = /(password|secret|token|api.?key|credential|private.?key|product.?key)/i;
const blockedValue = /\b(password|passwd|secret|token|api\s*key|private\s*key|credential|product\s*key)\s*[:=]/i;
const fields = new Set(["assetTag","computerName","categoryId","branchId","ownership","serialNumber","name","condition","status","purchaseDate","warrantyExpiry","description","processor","motherboard","operatingSystem","osVersion","osInstallDate","deviceType","employeeId","components","brand","model"]);
const componentFields = new Set(["type","slotOrBay","brand","model","serialNumber","capacity","storageKind"]);
type Intake = Record<string, any>;
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function secret(v: unknown): boolean {
  if (typeof v === "string") return blockedValue.test(v);
  if (!record(v)) return false;
  return Object.entries(v).some(([key, value]) => blockedKey.test(key) || secret(value));
}
function unknown(v: unknown): boolean {
  if (!record(v) || Object.keys(v).some((key) => !fields.has(key))) return true;
  return v.components !== undefined && (!Array.isArray(v.components) || v.components.some((c) => !record(c) || Object.keys(c).some((key) => !componentFields.has(key))));
}
export function validateIntake(v: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!record(v)) return { form: "Payload must be an object." };
  const data = v as Intake;
  for (const key of ["name","assetTag","computerName","categoryId","branchId","ownership","serialNumber","condition","status","description","processor","motherboard","operatingSystem","osVersion","deviceType","employeeId","brand","model"]) if (data[key] !== undefined && typeof data[key] !== "string") errors[key] = "Must be a string.";
  for (const key of ["purchaseDate","warrantyExpiry","osInstallDate"]) if (data[key] !== undefined && (typeof data[key] !== "string" || Number.isNaN(Date.parse(String(data[key]))))) errors[key] = "Must be a valid date.";
  if (data.ownership !== undefined && data.ownership !== "company") errors.ownership = "Phase 1 computer intake supports company-owned devices only.";
  for (const [key, allowed] of Object.entries({ condition: ["usable","for_repair","for_disposal"], status: ["active","lost","stolen"], deviceType: ["computer","laptop"] })) if (data[key] !== undefined && !allowed.includes(String(data[key]))) errors[key] = `Invalid ${key}.`;
  if (data.components !== undefined && (!Array.isArray(data.components) || data.components.length > 64)) errors.components = "Must contain at most 64 component rows.";
  for (const [index, component] of (Array.isArray(data.components) ? data.components : []).entries()) {
    if (!record(component) || !["ram","storage"].includes(String(component.type))) { errors[`components.${index}.type`] = "Must be ram or storage."; continue; }
    for (const key of ["slotOrBay","brand","model","serialNumber","capacity","storageKind"]) if (component[key] !== undefined && typeof component[key] !== "string") errors[`components.${index}.${key}`] = "Must be a string.";
    if (component.capacity !== undefined && (!/^\d+(\.\d+)?$/.test(String(component.capacity)) || Number(component.capacity) <= 0)) errors[`components.${index}.capacity`] = "Must be a positive number.";
  }
  return errors;
}
function dates(data: Intake, key: string) { return data[key] ? new Date(data[key]) : null; }
function normalize(data: Intake): Intake { return { ...data, name: typeof data.name === "string" ? data.name.trim() : data.name, assetTag: typeof data.assetTag === "string" ? data.assetTag.trim() || undefined : data.assetTag, components: Array.isArray(data.components) ? data.components.map((c: Intake) => ({ ...c, slotOrBay: c.slotOrBay?.trim() || undefined, brand: c.brand?.trim() || undefined, model: c.model?.trim() || undefined, serialNumber: c.serialNumber?.trim() || undefined, capacity: c.capacity?.trim() || undefined, storageKind: c.storageKind?.trim().toLowerCase() || undefined })) : [] }; }
function changedFieldNames(before: unknown, after: Intake) { const oldValue = record(before) ? before : {}; return Object.keys(after).filter((key) => key !== "components" ? JSON.stringify((oldValue as Intake)[key]) !== JSON.stringify(after[key]) : JSON.stringify((oldValue as Intake).components ?? []) !== JSON.stringify(after.components ?? [])); }
async function gate(req: AuthRequest, res: Response, next: NextFunction) {
  if (process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1?.trim().toLowerCase() !== "true") { res.status(404).json({ error: "Computer manual intake is disabled." }); return; }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { role: { select: { name: true } }, branchId: true } });
  const enabled = await prisma.featureRollout.findUnique({ where: { key: "computer.manual-intake.v1" }, include: { branchOverrides: true } });
  if (!user || !enabled || !(await effective(enabled, user.branchId ?? undefined, user.role?.name))) { res.status(404).json({ error: "Computer manual intake is disabled." }); return; }
  next();
}
async function role(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const name = user?.role?.name?.trim().toLowerCase();
  if (name !== "admin" && name !== "super_admin") { res.status(403).json({ error: "Only Admin or Super Admin may manage computer intake." }); return; }
  next();
}
async function scopedBranch(req: AuthRequest, branchId: string | undefined) {
  if (!branchId) return false;
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, archivedAt: true } });
  return !!user && !!branch && !branch.archivedAt && (user.role?.name?.trim().toLowerCase() === "super_admin" || user.branchId === branchId);
}
async function canSubmit(req: AuthRequest, branchId: string) { const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } }); const n = user?.role?.name?.trim().toLowerCase(); return !!user && (n === "super_admin" || (n === "admin" && user.branchId === branchId)); }
function expected(req: AuthRequest) { const value = req.body?.expectedUpdatedAt ?? req.header("If-Match"); return typeof value === "string" ? value.replace(/^W\//, "").replace(/^\"|\"$/g, "") : undefined; }
function matchesExpected(value: string | undefined, current: Date) { if (!value) return false; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) && parsed.toISOString() === current.toISOString(); }
function idempotency(req: AuthRequest) { const value = req.header("Idempotency-Key"); return value && /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : undefined; }
function payloadHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function submitPayload(value: unknown): Intake { if (!record(value)) return {}; const { expectedUpdatedAt: _expected, ifMatch: _ifMatch, idempotencyKey: _idempotencyKey, ...data } = value as Intake; return data; }
async function normalizedAssetTagExists(tag: string) { const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Asset" WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> '' AND lower(btrim("assetTag")) = lower(btrim(${tag})) LIMIT 1`; return rows.length > 0; }

router.use(gate, requirePermission("create_inventory"), role);
router.get("/lookups", async (req: AuthRequest, res) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const superAdmin = user?.role?.name?.trim().toLowerCase() === "super_admin";
  const requestedBranch = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const branchId = superAdmin ? requestedBranch : user?.branchId;
  if (requestedBranch && !superAdmin && requestedBranch !== user?.branchId) { res.status(403).json({ error: "Branch is outside your scope." }); return; }
  const [branches, categories, employees] = await Promise.all([
    prisma.branch.findMany({ where: superAdmin ? { archivedAt: null } : { id: user?.branchId ?? "", archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { isActive: true, ...(branchId ? { branchId } : { branchId: { not: null } }) }, select: { id: true, name: true, employeeId: true, branchId: true }, orderBy: { name: "asc" } }),
  ]);
  res.json({ branches, categories: categories.filter((item) => /desktop|laptop|computer/i.test(item.name)), employees });
});
router.get("/drafts", async (req: AuthRequest, res) => res.json(await prisma.computerIntakeDraft.findMany({ where: { createdById: req.user!.id, status: "draft" }, orderBy: { updatedAt: "desc" } })));
router.get("/drafts/:id", async (req: AuthRequest, res) => { const row = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id } }); if (!row) { res.status(404).json({ error: "Draft not found." }); return; } res.json(row); });
router.get("/drafts/:id/preflight", async (req: AuthRequest, res) => { const row = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } }); if (!row || !record(row.data)) { res.status(404).json({ error: "Draft not found." }); return; } const data = normalize(row.data as Intake); const [tag, name] = await Promise.all([data.assetTag ? normalizedAssetTagExists(data.assetTag) : false, data.computerName && data.branchId ? prisma.asset.findFirst({ where: { branchId: data.branchId, computerName: { equals: data.computerName, mode: "insensitive" } }, select: { id: true } }) : null]); res.json({ assetTagAvailable: !tag, duplicateComputerName: Boolean(name), updatedAt: row.updatedAt.toISOString() }); });
router.post("/drafts", async (req: AuthRequest, res) => {
  const errors = validateIntake(req.body); if (Object.keys(errors).length || secret(req.body) || unknown(req.body)) { res.status(400).json({ error: "Only approved inventory fields are accepted.", fields: errors }); return; }
  const data = normalize(req.body); if (data.branchId && !(await scopedBranch(req, data.branchId))) { res.status(403).json({ error: "Branch is outside your scope." }); return; }
  const row = await prisma.$transaction(async (tx) => { const draft = await tx.computerIntakeDraft.create({ data: { createdById: req.user!.id, branchId: data.branchId ?? null, data } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "create", entity: "ComputerIntakeDraft", entityId: draft.id, metadata: { source: "manual", provenance: "manual-intake-draft", operationReason: "draft-created", changedFields: Object.keys(data).filter((key) => key !== "components"), branchId: data.branchId ?? null } } }); return draft; });
  res.status(201).json(row);
});
router.put("/drafts/:id", async (req: AuthRequest, res) => {
  const { expectedUpdatedAt: _expectedUpdatedAt, ...payload } = record(req.body) ? req.body as Intake : {};
  const errors = validateIntake(payload); if (Object.keys(errors).length || secret(payload) || unknown(payload)) { res.status(400).json({ error: "Only approved inventory fields are accepted.", fields: errors }); return; }
  const current = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } }); if (!current) { res.status(404).json({ error: "Draft not found." }); return; }
  const tag = expected(req); if (!matchesExpected(tag, current.updatedAt)) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE", currentUpdatedAt: current.updatedAt.toISOString() }); return; }
  const data = normalize(payload); if (data.branchId && !(await scopedBranch(req, data.branchId))) { res.status(403).json({ error: "Branch is outside your scope." }); return; }
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.computerIntakeDraft.updateMany({ where: { id: current.id, status: "draft", updatedAt: current.updatedAt }, data: { branchId: data.branchId ?? null, data } }); if (result.count !== 1) throw Object.assign(new Error("STALE_WRITE"), { code: "STALE_WRITE" }); const row = await tx.computerIntakeDraft.findUniqueOrThrow({ where: { id: current.id } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "update", entity: "ComputerIntakeDraft", entityId: row.id, metadata: { source: "manual", provenance: "manual-intake-draft", operationReason: "draft-fields-updated", changedFields: changedFieldNames(current.data, data), branchId: row.branchId } } }); return row; });
  res.json(updated);
});
router.delete("/drafts/:id", async (req: AuthRequest, res) => { const current = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } }); if (!current) { res.status(404).json({ error: "Draft not found." }); return; } await prisma.$transaction(async (tx) => { await tx.computerIntakeDraft.update({ where: { id: current.id }, data: { status: "cancelled" } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cancel", entity: "ComputerIntakeDraft", entityId: current.id, metadata: { source: "manual", provenance: "manual-intake-draft-cancelled", operationReason: "draft-cancelled" } } }); }); res.status(204).send(); });
router.post("/drafts/:id/submit", async (req: AuthRequest, res) => {
  const draft = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id } }); if (!draft) { res.status(404).json({ error: "Draft not found." }); return; }
  const key = idempotency(req); if (!key) { res.status(400).json({ error: "Idempotency-Key header is required and must be 8-160 safe characters." }); return; }
  const expectedUpdatedAt = expected(req); const cleanSubmitBody = submitPayload(req.body); const requestHash = payloadHash({ draftId: draft.id, body: cleanSubmitBody });
  if (draft.status === "submitted" && draft.submittedAssetId) {
    if (draft.submitIdempotencyKey !== key || draft.submitPayloadHash !== requestHash) { res.status(409).json({ error: "IDEMPOTENCY_KEY_REUSE", code: "IDEMPOTENCY_KEY_REUSE" }); return; }
    const existing = await prisma.asset.findUnique({ where: { id: draft.submittedAssetId }, include: { deviceProfile: true, components: true } }); if (existing) { res.status(200).json(existing); return; }
  }
  if (!matchesExpected(expectedUpdatedAt, draft.updatedAt)) { res.status(409).json({ error: "STALE_WRITE", code: "STALE_WRITE", currentUpdatedAt: draft.updatedAt.toISOString() }); return; }
  if (draft.status !== "draft" || !record(draft.data) || !record(req.body)) { res.status(409).json({ error: "Draft is not submittable." }); return; }
  const data = normalize({ ...draft.data, ...cleanSubmitBody }); const errors = validateIntake(data); if (Object.keys(errors).length || secret(data) || unknown(data)) { res.status(400).json({ error: "Only approved inventory fields are accepted.", fields: errors }); return; }
  if (!data.name) { res.status(400).json({ error: "Computer name is required." }); return; }
  if (!data.branchId || !(await scopedBranch(req, data.branchId))) { res.status(400).json({ error: "An active branch is required." }); return; }
  if (!(await canSubmit(req, data.branchId))) { res.status(403).json({ error: "Only a branch Admin or Super Admin may submit." }); return; }
  if (data.categoryId) { const category = await prisma.category.findUnique({ where: { id: data.categoryId }, select: { name: true } }); if (!category || !/desktop|laptop|computer/i.test(category.name)) { res.status(400).json({ error: "Category must be a desktop or laptop computer." }); return; } }
  if (data.employeeId) { const employee = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { branchId: true, isActive: true } }); if (!employee?.isActive || employee.branchId !== data.branchId) { res.status(400).json({ error: "Employee must belong to the selected branch." }); return; } }
  const duplicateComputerName = Boolean(data.computerName && await prisma.asset.findFirst({ where: { branchId: data.branchId, computerName: { equals: data.computerName.trim(), mode: "insensitive" } }, select: { id: true } }));
  try {
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({ data: { name: data.name.trim(), assetTag: data.assetTag ?? null, computerName: data.computerName?.trim() || null, serialNumber: data.serialNumber?.trim() || null, categoryId: data.categoryId ?? null, branchId: data.branchId, ownership: data.ownership ?? "company", condition: data.condition ?? "usable", status: data.status ?? "active", purchaseDate: dates(data, "purchaseDate"), warrantyExpiry: dates(data, "warrantyExpiry"), description: data.description?.trim() || null } });
      const profile = await tx.deviceProfile.create({ data: { assetId: created.id, deviceType: data.deviceType ?? "computer", brand: data.brand?.trim() || null, model: data.model?.trim() || null, deviceSerial: data.serialNumber?.trim() || null, processor: data.processor?.trim() || null, motherboard: data.motherboard?.trim() || null, operatingSystem: data.operatingSystem?.trim() || null, osVersion: data.osVersion?.trim() || null, osInstallDate: dates(data, "osInstallDate") } });
      await tx.assetComponent.createMany({ data: data.components.map((c: Intake) => ({ assetId: created.id, deviceProfileId: profile.id, type: c.type, slotOrBay: c.slotOrBay ?? null, brand: c.brand ?? null, model: c.model ?? null, serialNumber: c.serialNumber ?? null, capacity: c.capacity ?? null, storageKind: c.storageKind ?? null })) });
      if (data.employeeId) await tx.assetAssignment.create({ data: { assetId: created.id, employeeId: data.employeeId, status: "active" } });
      const claimed = await tx.computerIntakeDraft.updateMany({ where: { id: draft.id, status: "draft", updatedAt: draft.updatedAt, submitIdempotencyKey: null }, data: { status: "submitted", submittedAt: new Date(), submittedAssetId: created.id, submitIdempotencyKey: key, submitPayloadHash: requestHash } });
      if (claimed.count !== 1) throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { code: "IDEMPOTENCY_CONFLICT" });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "submit", entity: "ComputerIntake", entityId: created.id, metadata: { source: "manual", provenance: "manual-intake-submit", operationReason: "official-record-submitted", branchId: data.branchId, draftId: draft.id, changedFields: ["asset", "deviceProfile", ...(data.components.length ? ["components"] : []), ...(data.employeeId ? ["assignment"] : [])] } } });
      return tx.asset.findUniqueOrThrow({ where: { id: created.id }, include: { deviceProfile: true, components: true, assignments: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ ...asset, warnings: duplicateComputerName ? ["A computer with this network name already exists in this branch; confirm this is a separate device."] : [] });
  } catch (error) { const code = (error as { code?: string }).code; if (code === "P2002" || code === "IDEMPOTENCY_CONFLICT") { res.status(409).json({ error: code === "IDEMPOTENCY_CONFLICT" ? "Submission already claimed; retry with the same key." : "Asset tag already exists.", code }); return; } throw error; }
});
router.get("/assets/:id", async (req: AuthRequest, res) => { const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } }); const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, include: { branch: true, category: true, deviceProfile: true, components: true, assignments: { include: { employee: true } } } }); if (!asset) { res.status(404).json({ error: "Asset not found." }); return; } if (user?.role?.name?.trim().toLowerCase() !== "super_admin" && asset.branchId !== user?.branchId) { res.status(404).json({ error: "Asset not found." }); return; } res.json(asset); });
export default router;
