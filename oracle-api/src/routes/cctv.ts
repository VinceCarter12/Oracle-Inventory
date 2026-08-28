import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AuthRequest, requireAuth, requirePermission } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { broadcastChange } from "../lib/ws";

const router = Router();
const forbidden = /password|passwd|pwd|secret|token|credential|username|login|api.?key|private.?key|license.?key|rtsp|onvif|stream(url)?|recovery|config(uration)?/i;
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeJson = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
const intervalsOverlap = (aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null) => aStart < (bEnd ?? new Date("9999-12-31")) && bStart < (aEnd ?? new Date("9999-12-31"));
const keyOf = (req: AuthRequest) => typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
const role = async (req: AuthRequest) => prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
const isSuper = (u: { role: { name: string } | null } | null) => u?.role?.name.toLowerCase() === "super_admin";
// CCTV/NVR is a released inventory domain; auth, permissions, and branch scope
// remain enforced by the route handlers below.
const enabled = async (_branchId?: string) => true;
const gate = (_res: import("express").Response): undefined => undefined;
const rejectSecrets = (value: unknown, path = ""): string | null => {
  if (path && forbidden.test(path)) return path;
  if (typeof value === "string" && (forbidden.test(value) || /:\/\/[^/\s]+:[^@\s]+@/i.test(value))) return path || "value";
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) { const bad = rejectSecrets(value[i], `${path}[${i}]`); if (bad) return bad; }
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { const bad = rejectSecrets(v, path ? `${path}.${k}` : k); if (bad) return bad; }
  return null;
};
const unknown = (body: Record<string, unknown>, allowed: string[]) => Object.keys(body).filter((k) => !allowed.includes(k));
const scopeAsset = async (req: AuthRequest, assetId: string) => {
  const [u, asset] = await Promise.all([role(req), prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, branchId: true, category: { select: { name: true } } } })]);
  return { u, asset, allowed: Boolean(asset && (isSuper(u) || u?.branchId === asset.branchId)) };
};
const categoryMatches = (name: string | null | undefined, kind: "camera" | "recorder") => {
  const value = (name ?? "").toLowerCase();
  return kind === "camera" ? /camera|cctv/.test(value) : /nvr|dvr|recorder/.test(value);
};
const audit = (req: AuthRequest, action: string, entity: string, entityId: string, metadata: Record<string, unknown>) => logActivity({ userId: req.user!.id, action, entity, entityId, branchId: typeof metadata.branchId === "string" ? metadata.branchId : null, metadata: { source: "cctv_manual", actorId: req.user!.id, ...metadata } });

router.use(requireAuth);
router.get("/cameras", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req); const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!isSuper(u) && branchId && branchId !== u?.branchId) return res.status(403).json({ error: "Branch is outside your scope." });
  const where = { asset: { branchId: isSuper(u) ? branchId : u?.branchId } };
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const assigned = req.query.assigned === "true" ? true : req.query.assigned === "false" ? false : undefined;
  const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const cameraWhere = { ...where, ...(q ? { OR: [{ physicalLocation: { contains: q, mode: "insensitive" as const } }, { asset: { name: { contains: q, mode: "insensitive" as const }, branchId: isSuper(u) ? branchId : u?.branchId } } ] } : {}), ...(assigned === undefined ? {} : assigned ? { assignments: { some: { validTo: null } } } : { assignments: { none: { validTo: null } } }) };
  const [items, total] = await prisma.$transaction([
    prisma.cameraProfile.findMany({
      where: cameraWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true } },
        assignments: { where: { validTo: null }, include: { channel: { include: { recorder: { select: { assetId: true, physicalLocation: true } } } } } },
      },
    }),
    prisma.cameraProfile.count({ where: cameraWhere }),
  ]);
  res.json({ items, page, pageSize, total });
});

router.post("/cameras", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>; const allowed = ["assetId", "physicalLocation", "coverageArea", "cameraType", "resolution", "nightVision", "motionDetection", "installationDate", "notes"];
  const bad = unknown(b, allowed); const secret = rejectSecrets(b); if (bad.length || secret) return res.status(400).json({ error: secret ? "Sensitive or credential-like values are not accepted." : "Unknown fields are not accepted.", code: "INVALID_CCTV_PAYLOAD", fieldErrors: bad });
  const assetId = typeof b.assetId === "string" ? b.assetId : ""; const location = typeof b.physicalLocation === "string" ? b.physicalLocation.trim() : ""; const s = await scopeAsset(req, assetId); if (!s.asset) return res.status(404).json({ error: "Asset not found." }); if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." }); if (!categoryMatches(s.asset.category?.name, "camera")) return res.status(400).json({ error: "Asset category must be Camera/CCTV.", code: "INVALID_ASSET_CATEGORY" }); if (!location) return res.status(400).json({ error: "physicalLocation is required.", fieldErrors: ["physicalLocation"] });
  const key = keyOf(req); if (!key) return res.status(400).json({ error: "Idempotency-Key is required." });
  const data = { assetId, physicalLocation: location, coverageArea: typeof b.coverageArea === "string" ? b.coverageArea.trim() : null, cameraType: (b.cameraType as never) ?? "fixed", resolution: typeof b.resolution === "string" ? b.resolution.trim() : null, nightVision: typeof b.nightVision === "boolean" ? b.nightVision : null, motionDetection: typeof b.motionDetection === "boolean" ? b.motionDetection : null, installationDate: typeof b.installationDate === "string" ? new Date(b.installationDate) : null, notes: typeof b.notes === "string" ? b.notes.trim() : null };
  const dataHash = hash(data); const prior = await prisma.cameraProfile.findUnique({ where: { idempotencyKey: key } }); if (prior) { if (prior.idempotencyPayloadHash !== dataHash) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" }); return res.json(prior); }
  Object.assign(data, { idempotencyKey: key, idempotencyPayloadHash: dataHash });
  try { const item = await prisma.$transaction(async (tx) => { const created = await tx.cameraProfile.create({ data }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_camera_created", entity: "CameraProfile", entityId: created.id, metadata: { source: "cctv_manual", actorId: req.user!.id, assetId, branchId: s.asset!.branchId } } }); return created; }); broadcastChange({ entity: "CameraProfile", action: "cctv_camera_created", entityId: item.id, branchId: s.asset!.branchId }); res.status(201).json(item); } catch { res.status(409).json({ error: "A camera profile already exists for this asset.", code: "DUPLICATE_CAMERA_PROFILE" }); }
});

router.post("/recorders", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>; const allowed = ["assetId", "recorderType", "channelCapacity", "physicalLocation", "storageCapacityBytes", "retentionDaysTarget", "notes", "channels"];
  const bad = unknown(b, allowed); const secret = rejectSecrets(b); if (bad.length || secret) return res.status(400).json({ error: secret ? "Sensitive or credential-like values are not accepted." : "Unknown fields are not accepted.", code: "INVALID_CCTV_PAYLOAD", fieldErrors: bad });
  const assetId = typeof b.assetId === "string" ? b.assetId : ""; const location = typeof b.physicalLocation === "string" ? b.physicalLocation.trim() : ""; const capacity = b.channelCapacity; const s = await scopeAsset(req, assetId); if (!s.asset) return res.status(404).json({ error: "Asset not found." }); if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." }); if (!categoryMatches(s.asset.category?.name, "recorder")) return res.status(400).json({ error: "Asset category must be NVR/DVR/recorder.", code: "INVALID_ASSET_CATEGORY" }); if (!location || !Number.isInteger(capacity) || Number(capacity) < 1 || Number(capacity) > 10000) return res.status(400).json({ error: "physicalLocation and channelCapacity are required.", fieldErrors: ["physicalLocation", "channelCapacity"] });
  const channels = b.channels === undefined ? [] : b.channels; if (!Array.isArray(channels) || channels.some((c) => !c || typeof c !== "object" || Array.isArray(c) || unknown(c as Record<string, unknown>, ["channelNumber", "label", "enabled"]).length || !Number.isInteger((c as Record<string, unknown>).channelNumber))) return res.status(400).json({ error: "channels must contain valid channel rows.", code: "INVALID_CHANNELS" });
  if (channels.some((c) => Number((c as Record<string, unknown>).channelNumber) < 1 || Number((c as Record<string, unknown>).channelNumber) > Number(capacity))) return res.status(400).json({ error: "Channel number exceeds recorder capacity.", code: "CHANNEL_OUT_OF_RANGE" });
  const key = keyOf(req); if (!key) return res.status(400).json({ error: "Idempotency-Key is required." }); const payload = { ...b, channels }; const prior = await prisma.recorderProfile.findFirst({ where: { assetId }, include: { channels: true } }); if (prior) return res.status(409).json({ error: "A recorder profile already exists for this asset.", code: "DUPLICATE_RECORDER_PROFILE" });
  try { const recorderHash = hash(payload); const existingKey = await prisma.recorderProfile.findUnique({ where: { idempotencyKey: key }, include: { channels: true } }); if (existingKey) { if (existingKey.idempotencyPayloadHash !== recorderHash) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" }); return res.json(safeJson(existingKey)); } const result = await prisma.$transaction(async (tx) => { const recorder = await tx.recorderProfile.create({ data: { assetId, recorderType: (b.recorderType as never) ?? "nvr", channelCapacity: Number(capacity), physicalLocation: location, storageCapacityBytes: typeof b.storageCapacityBytes === "number" ? BigInt(b.storageCapacityBytes) : null, retentionDaysTarget: Number.isInteger(b.retentionDaysTarget) ? Number(b.retentionDaysTarget) : null, notes: typeof b.notes === "string" ? b.notes.trim() : null, idempotencyKey: key, idempotencyPayloadHash: recorderHash } }); const rows = await Promise.all((channels as Record<string, unknown>[]).map((c) => tx.recorderChannel.create({ data: { recorderId: recorder.id, channelNumber: Number(c.channelNumber), label: typeof c.label === "string" ? c.label.trim() : null, enabled: c.enabled !== false } }))); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_recorder_created", entity: "RecorderProfile", entityId: recorder.id, metadata: { source: "cctv_manual", actorId: req.user!.id, assetId, branchId: s.asset!.branchId, channelCount: rows.length, idempotencyKey: key, payloadHash: recorderHash } } }); return { ...recorder, channels: rows }; }); broadcastChange({ entity: "RecorderProfile", action: "cctv_recorder_created", entityId: result.id, branchId: s.asset!.branchId }); res.status(201).json(safeJson(result)); } catch { res.status(409).json({ error: "Recorder or channel already exists.", code: "DUPLICATE_RECORDER" }); }
});

router.get("/recorders", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req);
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!isSuper(u) && branchId && branchId !== u?.branchId) return res.status(403).json({ error: "Branch is outside your scope." });
  const where = { asset: { branchId: isSuper(u) ? branchId : u?.branchId } };
  const q = typeof req.query.q === "string" ? req.query.q.trim() : ""; const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const recorderWhere = { ...where, ...(q ? { OR: [{ physicalLocation: { contains: q, mode: "insensitive" as const } }, { asset: { name: { contains: q, mode: "insensitive" as const }, branchId: isSuper(u) ? branchId : u?.branchId } }] } : {}) };
  const availableOnly = req.query.available === "true";
  const [items, total] = await prisma.$transaction([
    prisma.recorderProfile.findMany({
      where: recorderWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        channels: {
          orderBy: { channelNumber: "asc" },
          include: {
            ...(availableOnly ? { where: { enabled: true, assignments: { none: { validTo: null } } } } : {}),
            assignments: {
              where: { validTo: null },
              include: { camera: { include: { asset: { select: { name: true, assetTag: true } } } } },
            },
          },
        },
      },
    }),
    prisma.recorderProfile.count({ where: recorderWhere }),
  ]);
  res.json({ items: safeJson(items), page, pageSize, total });
});

router.get("/recorders/:assetId/channels", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const s = await scopeAsset(req, req.params.assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  const recorder = await prisma.recorderProfile.findUnique({
    where: { assetId: req.params.assetId },
    include: {
      channels: {
        orderBy: { channelNumber: "asc" },
        include: {
          assignments: {
            where: { validTo: null },
            include: { camera: { include: { asset: { select: { id: true, name: true, assetTag: true } } } } },
          },
        },
      },
    },
  });
  if (!recorder) return res.status(404).json({ error: "Recorder profile not found." });
  res.json({ recorder: { id: recorder.id, assetId: recorder.assetId, capacity: recorder.channelCapacity, location: recorder.physicalLocation }, items: recorder.channels });
});

router.post("/channel-assignments", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>; const allowed = ["cameraId", "channelId", "validFrom", "validTo", "notes"]; const bad = unknown(b, allowed); const secret = rejectSecrets(b); const key = keyOf(req); if (bad.length || secret) return res.status(400).json({ error: secret ? "Sensitive or credential-like values are not accepted." : "Unknown fields are not accepted.", code: "INVALID_CCTV_PAYLOAD", fieldErrors: bad }); if (!key) return res.status(400).json({ error: "Idempotency-Key is required." });
  const cameraId = typeof b.cameraId === "string" ? b.cameraId : ""; const channelId = typeof b.channelId === "string" ? b.channelId : ""; const from = typeof b.validFrom === "string" ? new Date(b.validFrom) : new Date(); const to = typeof b.validTo === "string" ? new Date(b.validTo) : null; if (!cameraId || !channelId || Number.isNaN(from.getTime()) || (to && (Number.isNaN(to.getTime()) || to <= from))) return res.status(400).json({ error: "cameraId, channelId, and a valid date range are required.", code: "INVALID_DATE_RANGE" });
  const prior = await prisma.cameraChannelAssignment.findUnique({ where: { idempotencyKey: key } }); const payload = { cameraId, channelId, validFrom: from.toISOString(), validTo: to?.toISOString() ?? null, notes: typeof b.notes === "string" ? b.notes.trim() : null }; if (prior) { if (prior.idempotencyPayloadHash !== hash(payload)) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" }); return res.json(prior); }
  const [camera, channel, u] = await Promise.all([prisma.cameraProfile.findUnique({ where: { id: cameraId }, select: { id: true, asset: { select: { branchId: true } } } }), prisma.recorderChannel.findUnique({ where: { id: channelId }, select: { id: true, recorder: { select: { asset: { select: { branchId: true } } } } } }), role(req)]); if (!camera || !channel) return res.status(404).json({ error: "Camera or channel not found." }); if (camera.asset.branchId !== channel.recorder.asset.branchId) return res.status(400).json({ error: "Camera and recorder must share a branch.", code: "CROSS_BRANCH_ASSIGNMENT" }); if (!isSuper(u) && u?.branchId !== camera.asset.branchId) return res.status(403).json({ error: "Assignment is outside your branch scope." });
  try { const item = await prisma.$transaction(async (tx) => { const conflicts = await tx.cameraChannelAssignment.findFirst({ where: { AND: [{ OR: [{ cameraId }, { channelId }] }, { validFrom: { lt: to ?? new Date("9999-12-31") } }, { OR: [{ validTo: null }, { validTo: { gt: from } }] }] } }); if (conflicts) throw new Error("CONFLICT"); const created = await tx.cameraChannelAssignment.create({ data: { cameraId, channelId, validFrom: from, validTo: to, notes: payload.notes, idempotencyKey: key, idempotencyPayloadHash: hash(payload) } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_channel_assigned", entity: "CameraChannelAssignment", entityId: created.id, metadata: { source: "cctv_manual", actorId: req.user!.id, branchId: camera.asset.branchId, idempotencyKey: key, assignment: "redacted" } } }); return created; }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }); broadcastChange({ entity: "CameraChannelAssignment", action: "cctv_channel_assigned", entityId: item.id, branchId: camera.asset.branchId }); res.status(201).json(item); } catch (error) { if (error instanceof Error && error.message === "CONFLICT") return res.status(409).json({ error: "Camera or channel has an overlapping assignment.", code: "CHANNEL_CONFLICT" }); return res.status(409).json({ error: "Assignment could not be created.", code: "ASSIGNMENT_CONFLICT" }); }
});

router.post("/channel-assignments/:id/end", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => { const b = req.body as Record<string, unknown>; const bad = unknown(b, ["validTo", "reason", "expectedUpdatedAt"]); const secret = rejectSecrets(b); if (bad.length || secret) return res.status(400).json({ error: secret ? "Sensitive values are not accepted." : "Unknown fields are not accepted.", fieldErrors: bad }); const existing = await prisma.cameraChannelAssignment.findUnique({ where: { id: req.params.id }, include: { camera: { include: { asset: { select: { branchId: true } } } } } }); if (!existing) return res.status(404).json({ error: "Assignment not found." }); if (!(await enabled(existing.camera.asset.branchId ?? undefined))) return gate(res); const u = await role(req); if (!isSuper(u) && u?.branchId !== existing.camera.asset.branchId) return res.status(403).json({ error: "Assignment is outside your branch scope." }); if (existing.validTo) return res.status(409).json({ error: "Assignment is already closed.", code: "ALREADY_CLOSED" }); const expected = typeof b.expectedUpdatedAt === "string" ? new Date(b.expectedUpdatedAt) : null; const end = typeof b.validTo === "string" ? new Date(b.validTo) : new Date(); if (!expected || expected.getTime() !== existing.updatedAt.getTime()) return res.status(409).json({ error: "Assignment changed since it was loaded.", code: "STALE_WRITE" }); if (end <= existing.validFrom) return res.status(400).json({ error: "validTo must be later than validFrom." }); const updated = await prisma.$transaction(async (tx) => { const result = await tx.cameraChannelAssignment.updateMany({ where: { id: existing.id, updatedAt: expected, validTo: null }, data: { validTo: end, notes: typeof b.reason === "string" ? b.reason.trim() : existing.notes } }); if (result.count !== 1) throw new Error("STALE_WRITE"); const item = await tx.cameraChannelAssignment.findUnique({ where: { id: existing.id } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_channel_assignment_ended", entity: "CameraChannelAssignment", entityId: existing.id, metadata: { source: "cctv_manual", actorId: req.user!.id, branchId: existing.camera.asset.branchId, reasonProvided: Boolean(b.reason) } } }); return item; }); broadcastChange({ entity: "CameraChannelAssignment", action: "cctv_channel_assignment_ended", entityId: existing.id, branchId: existing.camera.asset.branchId }); res.json(updated); });

router.post("/secret-references", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>; const allowed = ["provider", "referenceId", "displayLabel", "system", "ownerTeam", "rotationAt"]; const bad = unknown(b, allowed); const secret = rejectSecrets(b); if (bad.length || secret) return res.status(400).json({ error: secret ? "Secret values must be stored in the approved vault, not inventory." : "Unknown fields are not accepted.", code: "INVALID_SECRET_REFERENCE", fieldErrors: bad }); if (!(await enabled((await role(req))?.branchId ?? undefined))) return gate(res); const provider = typeof b.provider === "string" ? b.provider.trim() : ""; const referenceId = typeof b.referenceId === "string" ? b.referenceId.trim() : ""; if (!provider || !referenceId) return res.status(400).json({ error: "provider and referenceId are required." }); try { const result = await prisma.$transaction(async (tx) => { const item = await tx.secretReference.create({ data: { provider, referenceId, displayLabel: typeof b.displayLabel === "string" ? b.displayLabel.trim() : null, system: typeof b.system === "string" ? b.system.trim() : null, ownerTeam: typeof b.ownerTeam === "string" ? b.ownerTeam.trim() : null, rotationAt: typeof b.rotationAt === "string" ? new Date(b.rotationAt) : null } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_secret_reference_created", entity: "SecretReference", entityId: item.id, metadata: { source: "cctv_manual", actorId: req.user!.id, provider, referenceRecorded: true } } }); return item; }); broadcastChange({ entity: "SecretReference", action: "cctv_secret_reference_created", entityId: result.id, branchId: null }); res.status(201).json(result); } catch { res.status(409).json({ error: "Secret reference already exists.", code: "DUPLICATE_SECRET_REFERENCE" }); }
});

router.get("/secret-references", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req); const assetId = typeof req.query.assetId === "string" ? req.query.assetId : undefined;
  if (!assetId && !isSuper(u)) return res.status(403).json({ error: "Global secret-reference listing is restricted." });
  if (assetId) { const s = await scopeAsset(req, assetId); if (!s.asset) return res.status(404).json({ error: "Asset not found." }); if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." }); if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res); }
  const links = await prisma.assetSecretReference.findMany({ where: assetId ? { assetId } : undefined, include: { secretReference: { select: { id: true, provider: true, displayLabel: true, system: true, ownerTeam: true, rotationAt: true } } } });
  res.json({ items: links.map((link) => ({ id: link.id, assetId: link.assetId, cameraProfileId: link.cameraProfileId, reference: link.secretReference })) });
});

router.post("/secret-references/:id/assets", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>; const bad = unknown(b, ["assetId", "cameraProfileId"]); const secret = rejectSecrets(b); if (bad.length || secret) return res.status(400).json({ error: "Only metadata references are accepted.", code: "INVALID_SECRET_REFERENCE", fieldErrors: bad }); const assetId = typeof b.assetId === "string" ? b.assetId : ""; const s = await scopeAsset(req, assetId); if (!s.asset) return res.status(404).json({ error: "Asset not found." }); if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." }); if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res); const ref = await prisma.secretReference.findUnique({ where: { id: req.params.id } }); if (!ref) return res.status(404).json({ error: "Secret reference not found." }); const cameraProfileId = typeof b.cameraProfileId === "string" ? b.cameraProfileId : null; if (cameraProfileId) { const profile = await prisma.cameraProfile.findUnique({ where: { id: cameraProfileId }, select: { assetId: true, asset: { select: { branchId: true } } } }); if (!profile || profile.assetId !== assetId || profile.asset.branchId !== s.asset.branchId) return res.status(400).json({ error: "Camera profile must belong to the selected asset and branch.", code: "INVALID_CAMERA_REFERENCE" }); } try { const item = await prisma.$transaction(async (tx) => { const created = await tx.assetSecretReference.create({ data: { assetId, secretReferenceId: ref.id, cameraProfileId } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_secret_reference_linked", entity: "AssetSecretReference", entityId: created.id, metadata: { source: "cctv_manual", actorId: req.user!.id, assetId, cameraProfileLinked: Boolean(cameraProfileId), referenceRecorded: true } } }); return created; }); broadcastChange({ entity: "AssetSecretReference", action: "cctv_secret_reference_linked", entityId: item.id, branchId: s.asset.branchId }); res.status(201).json(item); } catch { res.status(409).json({ error: "Secret reference is already linked.", code: "DUPLICATE_SECRET_LINK" }); }
});

router.delete("/secret-references/:id/assets/:assetId", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const s = await scopeAsset(req, req.params.assetId); if (!s.asset) return res.status(404).json({ error: "Asset not found." }); if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." }); if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  const link = await prisma.assetSecretReference.findFirst({ where: { id: req.params.id, assetId: req.params.assetId }, select: { id: true, assetId: true } }); if (!link) return res.status(404).json({ error: "Secret reference link not found." });
  await prisma.$transaction(async (tx) => { await tx.assetSecretReference.delete({ where: { id: link.id } }); await tx.activityLog.create({ data: { userId: req.user!.id, action: "cctv_secret_reference_unlinked", entity: "AssetSecretReference", entityId: link.id, metadata: { source: "cctv_manual", actorId: req.user!.id, assetId: link.assetId, referenceRemoved: true } } }); }); broadcastChange({ entity: "AssetSecretReference", action: "cctv_secret_reference_unlinked", entityId: link.id, branchId: s.asset.branchId }); res.status(204).send();
});

export default router;
export { rejectSecrets, hash, intervalsOverlap };
