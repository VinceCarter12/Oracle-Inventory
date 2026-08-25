import { Router, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

type ComponentInput = { type: "ram" | "storage"; slotOrBay?: string; brand?: string; model?: string; serialNumber?: string; capacity?: string; storageKind?: string };
type IntakeData = {
  assetTag?: string; computerName?: string; categoryId?: string; branchId?: string; ownership?: "company" | "personal";
  serialNumber?: string; name?: string; brand?: string; model?: string; condition?: "usable" | "for_repair" | "for_disposal";
  status?: "active" | "lost" | "stolen"; purchaseDate?: string; warrantyExpiry?: string; description?: string;
  processor?: string; motherboard?: string; operatingSystem?: string; osVersion?: string; osInstallDate?: string;
  deviceType?: "computer" | "laptop"; employeeId?: string; components?: ComponentInput[];
};

const blockedKey = /(password|secret|token|api.?key|credential|private.?key|product.?key)/i;
const blockedValue = /\b(password|passwd|secret|token|api\s*key|private\s*key|credential|product\s*key)\s*[:=]/i;
const allowedKeys = new Set(["assetTag", "computerName", "categoryId", "branchId", "ownership", "serialNumber", "name", "brand", "model", "condition", "status", "purchaseDate", "warrantyExpiry", "description", "processor", "motherboard", "operatingSystem", "osVersion", "osInstallDate", "deviceType", "employeeId", "components"]);
const allowedComponentKeys = new Set(["type", "slotOrBay", "brand", "model", "serialNumber", "capacity", "storageKind"]);
function hasBlockedKey(value: unknown): boolean {
  if (typeof value === "string") return blockedValue.test(value);
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (blockedKey.test(key) || hasBlockedKey(child)) return true;
  }
  return false;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasUnknownKey(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) return true;
  if (value.components === undefined) return false;
  if (!Array.isArray(value.components)) return true;
  return value.components.some((component) => !isRecord(component) || Object.keys(component).some((key) => !allowedComponentKeys.has(key)));
}

async function canUseBranch(req: AuthRequest, branchId: string | undefined): Promise<boolean> {
  if (!branchId) return false;
  const [user, branch] = await Promise.all([
    prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { archivedAt: true } }),
  ]);
  return Boolean(branch && !branch.archivedAt && user && (user.role?.name?.trim().toLowerCase() === "super_admin" || user.branchId === branchId));
}
async function canSubmitOfficial(req: AuthRequest, branchId: string): Promise<boolean> {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const role = user?.role?.name?.trim().toLowerCase();
  return Boolean(user && (role === "super_admin" || (role === "admin" && user.branchId === branchId)));
}
async function requireDraftRole(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, include: { role: true } });
  const role = user?.role?.name?.trim().toLowerCase();
  if (role !== "admin" && role !== "super_admin") { res.status(403).json({ error: "Only Admin or Super Admin may manage computer intake drafts." }); return; }
  next();
}

function cleanDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function changedKeys(before: unknown, after: Record<string, unknown>): string[] {
  const previous = isRecord(before) ? before : {};
  return [...new Set([...Object.keys(previous), ...Object.keys(after)])].filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(after[key]));
}
function actor(req: AuthRequest) { return { id: req.user!.id, name: req.user!.name, email: req.user!.email }; }
export function validateIntake(value: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isRecord(value)) return { form: "Payload must be an object." };
  const data = value as Record<string, unknown>;
  const strings = ["name", "assetTag", "computerName", "serialNumber", "brand", "model", "categoryId", "branchId", "employeeId", "description", "processor", "motherboard", "operatingSystem", "osVersion"];
  for (const key of strings) if (data[key] !== undefined && typeof data[key] !== "string") errors[key] = "Must be a string.";
  for (const key of ["purchaseDate", "warrantyExpiry", "osInstallDate"]) if (data[key] !== undefined && (typeof data[key] !== "string" || Number.isNaN(Date.parse(data[key] as string)))) errors[key] = "Must be a valid date.";
  const enums: Record<string, string[]> = { ownership: ["company", "personal"], condition: ["usable", "for_repair", "for_disposal"], status: ["active", "lost", "stolen"], deviceType: ["computer", "laptop"] };
  for (const [key, allowed] of Object.entries(enums)) if (data[key] !== undefined && (typeof data[key] !== "string" || !allowed.includes(data[key] as string))) errors[key] = `Invalid ${key}.`;
  if (data.components !== undefined) {
    if (!Array.isArray(data.components)) errors.components = "Must be an array.";
    else data.components.forEach((component, index) => {
      if (!isRecord(component)) { errors[`components.${index}`] = "Must be an object."; return; }
      if (component.type !== "ram" && component.type !== "storage") errors[`components.${index}.type`] = "Must be ram or storage.";
      for (const key of ["slotOrBay", "brand", "model", "serialNumber", "storageKind"]) if (component[key] !== undefined && typeof component[key] !== "string") errors[`components.${index}.${key}`] = "Must be a string.";
      if (component.capacity !== undefined && (typeof component.capacity !== "string" || !/^\d+(\.\d+)?$/.test(component.capacity) || Number(component.capacity) <= 0)) errors[`components.${index}.capacity`] = "Must be a positive number.";
      if (component.storageKind !== undefined && !["ssd", "hdd", "nvme", "other"].includes(String(component.storageKind).toLowerCase())) errors[`components.${index}.storageKind`] = "Invalid storage kind.";
    });
  }
  return errors;
}

function draftPayload(body: IntakeData): IntakeData {
  return {
    ...body,
    name: typeof body.name === "string" ? body.name.trim() : body.name,
    assetTag: typeof body.assetTag === "string" ? body.assetTag.trim() || undefined : body.assetTag,
    components: Array.isArray(body.components) ? body.components.slice(0, 64).map((component) => ({
      type: component.type, slotOrBay: component.slotOrBay?.trim() || undefined, brand: component.brand?.trim() || undefined,
      model: component.model?.trim() || undefined, serialNumber: component.serialNumber?.trim() || undefined, capacity: component.capacity?.trim() || undefined, storageKind: component.storageKind?.trim().toLowerCase() || undefined,
    })) : [],
  };
}

router.get("/drafts", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const drafts = await prisma.computerIntakeDraft.findMany({ where: { createdById: req.user!.id, status: "draft" }, orderBy: { updatedAt: "desc" } });
  res.json(drafts);
});

router.get("/drafts/:id", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const draft = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id } });
  if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
  res.json(draft);
});

router.post("/drafts", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const validation = validateIntake(req.body); if (Object.keys(validation).length) { res.status(400).json({ error: "Invalid intake fields.", fields: validation }); return; }
  if (hasBlockedKey(req.body) || hasUnknownKey(req.body)) { res.status(400).json({ error: "Only approved inventory fields are accepted; credentials and unknown fields cannot be stored." }); return; }
  const data = draftPayload(req.body as IntakeData);
  if (data.branchId && !(await canUseBranch(req, data.branchId))) { res.status(403).json({ error: "You can only use your assigned branch." }); return; }
  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.computerIntakeDraft.create({ data: { createdById: req.user!.id, branchId: data.branchId || null, data: JSON.parse(JSON.stringify(data)) } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "create", entity: "ComputerIntakeDraft", entityId: created.id, metadata: { actor: actor(req), branchId: data.branchId, assetTag: data.assetTag, source: "manual", provenance: "manual-intake-draft", reason: "draft-created" } } });
    return created;
  });
  res.status(201).json(draft);
});

router.put("/drafts/:id", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const validation = validateIntake(req.body); if (Object.keys(validation).length) { res.status(400).json({ error: "Invalid intake fields.", fields: validation }); return; }
  if (hasBlockedKey(req.body) || hasUnknownKey(req.body)) { res.status(400).json({ error: "Only approved inventory fields are accepted; credentials and unknown fields cannot be stored." }); return; }
  const existing = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } });
  if (!existing) { res.status(404).json({ error: "Draft not found" }); return; }
  const data = draftPayload(req.body as IntakeData);
  if (data.branchId && !(await canUseBranch(req, data.branchId))) { res.status(403).json({ error: "You can only use your assigned branch." }); return; }
  const draft = await prisma.$transaction(async (tx) => {
    const updated = await tx.computerIntakeDraft.update({ where: { id: existing.id }, data: { branchId: data.branchId || null, data: JSON.parse(JSON.stringify(data)) } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "update", entity: "ComputerIntakeDraft", entityId: updated.id, metadata: { actor: actor(req), branchId: data.branchId, assetTag: data.assetTag, changedFields: changedKeys(existing.data, data as unknown as Record<string, unknown>), source: "manual", provenance: "manual-intake-draft", reason: "draft-updated" } } });
    return updated;
  });
  res.json(draft);
});

router.delete("/drafts/:id", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } });
  if (!existing) { res.status(404).json({ error: "Draft not found" }); return; }
  await prisma.$transaction(async (tx) => {
    await tx.computerIntakeDraft.update({ where: { id: existing.id }, data: { status: "cancelled" } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "discard", entity: "ComputerIntakeDraft", entityId: existing.id, metadata: { actor: actor(req), source: "manual", reason: "draft-discarded" } } });
  });
  res.status(204).send();
});

router.post("/drafts/:id/submit", requirePermission("create_inventory"), requireDraftRole, async (req: AuthRequest, res: Response) => {
  const draft = await prisma.computerIntakeDraft.findFirst({ where: { id: req.params.id, createdById: req.user!.id, status: "draft" } });
  if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
  if (!isRecord(draft.data) || !isRecord(req.body) || hasBlockedKey(draft.data) || hasBlockedKey(req.body)) { res.status(400).json({ error: "Draft data is malformed or contains credentials/secrets." }); return; }
  const merged = { ...draft.data, ...req.body };
  const validation = validateIntake(merged); if (Object.keys(validation).length) { res.status(400).json({ error: "Invalid intake fields.", fields: validation }); return; }
  if (hasBlockedKey(merged) || hasUnknownKey(merged)) { res.status(400).json({ error: "Only approved inventory fields are accepted; credentials and unknown fields cannot be stored." }); return; }
  if (merged.components !== undefined && !Array.isArray(merged.components)) { res.status(400).json({ error: "components must be an array." }); return; }
  const data = draftPayload(merged as IntakeData);
  if (!data.name?.trim()) { res.status(400).json({ error: "Computer name is required." }); return; }
  if (!data.branchId || !(await canUseBranch(req, data.branchId))) { res.status(400).json({ error: "An active branch is required." }); return; }
  if (!(await canSubmitOfficial(req, data.branchId))) { res.status(403).json({ error: "Only a branch Admin or Super Admin can submit an official record." }); return; }
  if (data.assetTag && await prisma.asset.findFirst({ where: { assetTag: data.assetTag } })) { res.status(409).json({ error: "Asset tag already exists." }); return; }
  if (data.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { branchId: true, isActive: true } });
    if (!employee?.isActive || employee.branchId !== data.branchId) { res.status(400).json({ error: "Employee must be active and belong exactly to the selected branch." }); return; }
  }
  let asset;
  try {
    asset = await prisma.$transaction(async (tx) => {
    const created = await tx.asset.create({ data: {
      name: data.name!.trim(), serialNumber: data.serialNumber?.trim() || null, assetTag: data.assetTag || null,
      computerName: data.computerName?.trim() || null, categoryId: data.categoryId || null, branchId: data.branchId,
      ownership: data.ownership ?? "company", condition: data.condition ?? "usable", status: data.status ?? "active",
      purchaseDate: cleanDate(data.purchaseDate), warrantyExpiry: cleanDate(data.warrantyExpiry), description: data.description?.trim() || null,
    } });
    const profile = await tx.deviceProfile.create({ data: { assetId: created.id, deviceType: data.deviceType ?? "computer", brand: data.brand?.trim() || null, model: data.model?.trim() || null, deviceSerial: data.serialNumber?.trim() || null, processor: data.processor?.trim() || null, motherboard: data.motherboard?.trim() || null, operatingSystem: data.operatingSystem?.trim() || null, osVersion: data.osVersion?.trim() || null, osInstallDate: cleanDate(data.osInstallDate), source: "manual" } });
    await tx.assetComponent.createMany({ data: (data.components ?? []).filter((component) => component.type === "ram" || component.type === "storage").map((component) => ({ assetId: created.id, deviceProfileId: profile.id, type: component.type, slotOrBay: component.slotOrBay || null, brand: component.brand || null, model: component.model || null, serialNumber: component.serialNumber || null, capacity: component.capacity || null, storageKind: component.storageKind || null, source: "manual" })) });
    if (data.employeeId) {
      await tx.assetAssignment.create({ data: { assetId: created.id, employeeId: data.employeeId, status: "active" } });
    }
    await tx.computerIntakeDraft.update({ where: { id: draft.id }, data: { status: "submitted", submittedAt: new Date() } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "submit", entity: "ComputerIntake", entityId: created.id, metadata: { actor: actor(req), assetTag: data.assetTag, branchId: data.branchId, draftId: draft.id, source: "manual", provenance: "manual-intake-submit", reason: "official-record-submitted", newValueSummary: { name: data.name, deviceType: data.deviceType, componentCount: data.components?.length ?? 0, employeeAssigned: Boolean(data.employeeId) } } } });
    return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") { res.status(409).json({ error: "Asset tag already exists; refresh and choose a unique tag." }); return; }
    throw error;
  }
  res.status(201).json(asset);
});

export default router;
