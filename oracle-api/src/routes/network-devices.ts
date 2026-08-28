import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AuthRequest, requireAuth, requirePermission } from "../middleware/auth";
import { broadcastChange } from "../lib/ws";

const router = Router();
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keyOf = (req: AuthRequest) => typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
const role = async (req: AuthRequest) => prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
const isSuper = (u: { role: { name: string } | null } | null) => u?.role?.name.toLowerCase() === "super_admin";
// Network inventory is a released domain; auth, permissions, and branch scope
// remain enforced by the route handlers below.
const enabled = async (_branchId?: string) => true;
const gate = (res: import("express").Response) => res.status(503).json({ error: "Network infrastructure is disabled.", code: "NETWORK_DISABLED" });
const unknownFields = (body: Record<string, unknown>, allowed: string[]) => Object.keys(body).filter((k) => !allowed.includes(k));
const scopeAsset = async (req: AuthRequest, assetId: string) => {
  const [u, asset] = await Promise.all([role(req), prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, branchId: true, category: { select: { name: true } } } })]);
  return { u, asset, allowed: Boolean(asset && (isSuper(u) || u?.branchId === asset.branchId)) };
};
const categoryMatches = (name: string | null | undefined, kind: "access_point" | "switch") => {
  const value = (name ?? "").toLowerCase();
  return kind === "access_point" ? /access.?point|\bap\b|wifi|wi-fi/.test(value) : /switch/.test(value);
};

router.use(requireAuth);

router.get("/access-points", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req); const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!isSuper(u) && branchId && branchId !== u?.branchId) return res.status(403).json({ error: "Branch is outside your scope." });
  if (!(await enabled(branchId ?? u?.branchId ?? undefined))) return gate(res);
  const items = await prisma.accessPointProfile.findMany({
    where: { asset: { branchId: isSuper(u) ? branchId : u?.branchId } },
    include: { asset: { select: { id: true, name: true, assetTag: true, status: true } } },
    orderBy: { physicalLocation: "asc" },
  });
  res.json({ items });
});

router.post("/access-points", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const allowed = ["assetId", "physicalLocation", "notes"];
  const bad = unknownFields(b, allowed);
  if (bad.length) return res.status(400).json({ error: "Unknown fields are not accepted.", code: "INVALID_PAYLOAD", fieldErrors: bad });
  const assetId = typeof b.assetId === "string" ? b.assetId : "";
  const location = typeof b.physicalLocation === "string" ? b.physicalLocation.trim() : "";
  const s = await scopeAsset(req, assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!categoryMatches(s.asset.category?.name, "access_point")) return res.status(400).json({ error: "Asset category must be Access Point.", code: "INVALID_ASSET_CATEGORY" });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  if (!location) return res.status(400).json({ error: "physicalLocation is required.", fieldErrors: ["physicalLocation"] });
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "Idempotency-Key is required." });
  const data = { assetId, physicalLocation: location, notes: typeof b.notes === "string" ? b.notes.trim() : null };
  const dataHash = hash(data);
  const prior = await prisma.accessPointProfile.findUnique({ where: { idempotencyKey: key } });
  if (prior) {
    if (prior.idempotencyPayloadHash !== dataHash) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.json(prior);
  }
  Object.assign(data, { idempotencyKey: key, idempotencyPayloadHash: dataHash });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.accessPointProfile.create({ data });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "access_point_created", entity: "AccessPointProfile", entityId: created.id, metadata: { source: "network_manual", actorId: req.user!.id, assetId, branchId: s.asset!.branchId } } });
      return created;
    });
    broadcastChange({ entity: "AccessPointProfile", action: "access_point_created", entityId: item.id, branchId: s.asset!.branchId });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ error: "An access point profile already exists for this asset.", code: "DUPLICATE_ACCESS_POINT_PROFILE" });
  }
});

router.get("/switches", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req); const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!isSuper(u) && branchId && branchId !== u?.branchId) return res.status(403).json({ error: "Branch is outside your scope." });
  if (!(await enabled(branchId ?? u?.branchId ?? undefined))) return gate(res);
  const items = await prisma.switchProfile.findMany({
    where: { asset: { branchId: isSuper(u) ? branchId : u?.branchId } },
    include: { asset: { select: { id: true, name: true, assetTag: true, status: true } } },
    orderBy: { physicalLocation: "asc" },
  });
  res.json({ items });
});

router.post("/switches", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const allowed = ["assetId", "switchType", "physicalLocation", "portCount", "notes"];
  const bad = unknownFields(b, allowed);
  if (bad.length) return res.status(400).json({ error: "Unknown fields are not accepted.", code: "INVALID_PAYLOAD", fieldErrors: bad });
  const assetId = typeof b.assetId === "string" ? b.assetId : "";
  const location = typeof b.physicalLocation === "string" ? b.physicalLocation.trim() : "";
  const switchType = b.switchType === "managed" ? "managed" : "unmanaged";
  const portCount = b.portCount === undefined || b.portCount === null || b.portCount === "" ? null : Number(b.portCount);
  const s = await scopeAsset(req, assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!categoryMatches(s.asset.category?.name, "switch")) return res.status(400).json({ error: "Asset category must be Switch.", code: "INVALID_ASSET_CATEGORY" });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  if (!location) return res.status(400).json({ error: "physicalLocation is required.", fieldErrors: ["physicalLocation"] });
  if (portCount !== null && (!Number.isInteger(portCount) || portCount < 1 || portCount > 512)) return res.status(400).json({ error: "portCount must be a whole number between 1 and 512.", fieldErrors: ["portCount"] });
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "Idempotency-Key is required." });
  const data = { assetId, switchType: switchType as never, physicalLocation: location, portCount, notes: typeof b.notes === "string" ? b.notes.trim() : null };
  const dataHash = hash(data);
  const prior = await prisma.switchProfile.findUnique({ where: { idempotencyKey: key } });
  if (prior) {
    if (prior.idempotencyPayloadHash !== dataHash) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.json(prior);
  }
  Object.assign(data, { idempotencyKey: key, idempotencyPayloadHash: dataHash });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.switchProfile.create({ data });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "switch_created", entity: "SwitchProfile", entityId: created.id, metadata: { source: "network_manual", actorId: req.user!.id, assetId, branchId: s.asset!.branchId } } });
      return created;
    });
    broadcastChange({ entity: "SwitchProfile", action: "switch_created", entityId: item.id, branchId: s.asset!.branchId });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ error: "A switch profile already exists for this asset.", code: "DUPLICATE_SWITCH_PROFILE" });
  }
});

// Access Point / Switch credential linking — same AssetSecretReference
// pointer pattern as CCTV, scoped to network.v1. The reference itself
// (provider/referenceId/displayLabel) is created via POST /api/secret-references.
router.get("/devices/:assetId/secret-references", requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const s = await scopeAsset(req, req.params.assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!categoryMatches(s.asset.category?.name, "access_point") && !categoryMatches(s.asset.category?.name, "switch")) return res.status(400).json({ error: "Asset category must be Access Point or Switch.", code: "INVALID_ASSET_CATEGORY" });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  const links = await prisma.assetSecretReference.findMany({ where: { assetId: req.params.assetId, cameraProfileId: null }, include: { secretReference: { select: { id: true, provider: true, displayLabel: true, system: true, ownerTeam: true, rotationAt: true } } } });
  res.json({ items: links.map((link) => ({ id: link.id, assetId: link.assetId, reference: link.secretReference })) });
});

router.post("/devices/:assetId/secret-references", requirePermission("manage_infrastructure_assets"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const bad = unknownFields(b, ["secretReferenceId"]);
  if (bad.length) return res.status(400).json({ error: "Only a secretReferenceId is accepted.", code: "INVALID_DEVICE_SECRET_REFERENCE", fieldErrors: bad });
  const s = await scopeAsset(req, req.params.assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!categoryMatches(s.asset.category?.name, "access_point") && !categoryMatches(s.asset.category?.name, "switch")) return res.status(400).json({ error: "Asset category must be Access Point or Switch.", code: "INVALID_ASSET_CATEGORY" });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  const secretReferenceId = typeof b.secretReferenceId === "string" ? b.secretReferenceId : "";
  const ref = await prisma.secretReference.findUnique({ where: { id: secretReferenceId } });
  if (!ref) return res.status(404).json({ error: "Secret reference not found." });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.assetSecretReference.create({ data: { assetId: req.params.assetId, secretReferenceId: ref.id } });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "network_device_secret_reference_linked", entity: "AssetSecretReference", entityId: created.id, metadata: { source: "network_manual", actorId: req.user!.id, assetId: req.params.assetId, branchId: s.asset!.branchId } } });
      return created;
    });
    broadcastChange({ entity: "AssetSecretReference", action: "network_device_secret_reference_linked", entityId: item.id, branchId: s.asset!.branchId });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ error: "Secret reference is already linked.", code: "DUPLICATE_SECRET_LINK" });
  }
});

router.delete("/devices/:assetId/secret-references/:linkId", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const s = await scopeAsset(req, req.params.assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  const link = await prisma.assetSecretReference.findFirst({ where: { id: req.params.linkId, assetId: req.params.assetId }, select: { id: true } });
  if (!link) return res.status(404).json({ error: "Secret reference link not found." });
  await prisma.$transaction(async (tx) => {
    await tx.assetSecretReference.delete({ where: { id: link.id } });
    await tx.activityLog.create({ data: { userId: req.user!.id, action: "network_device_secret_reference_unlinked", entity: "AssetSecretReference", entityId: link.id, metadata: { source: "network_manual", actorId: req.user!.id, assetId: req.params.assetId, referenceRemoved: true } } });
  });
  broadcastChange({ entity: "AssetSecretReference", action: "network_device_secret_reference_unlinked", entityId: link.id, branchId: s.asset!.branchId });
  res.status(204).send();
});

export default router;
