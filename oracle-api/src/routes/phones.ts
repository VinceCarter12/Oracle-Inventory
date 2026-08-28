import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AuthRequest, requireAuth, requirePermission } from "../middleware/auth";
import { broadcastChange } from "../lib/ws";

const router = Router();
const featureKey = "phones.v1";
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keyOf = (req: AuthRequest) => typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
const role = async (req: AuthRequest) => prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
const isSuper = (u: { role: { name: string } | null } | null) => u?.role?.name.toLowerCase() === "super_admin";
const enabled = async (branchId?: string) => {
  const feature = await prisma.featureRollout.findUnique({ where: { key: featureKey } }).catch(() => null);
  const override = feature && branchId ? await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey: feature.key, branchId } } }).catch(() => null) : null;
  return process.env.PHONES_ENABLED === "true" && Boolean(override?.enabled ?? (feature?.enabledGlobally && feature.status === "enabled"));
};
const gate = (res: import("express").Response) => res.status(503).json({ error: "Phone inventory is disabled.", code: "PHONES_DISABLED" });
const unknownFields = (body: Record<string, unknown>, allowed: string[]) => Object.keys(body).filter((k) => !allowed.includes(k));
const scopeAsset = async (req: AuthRequest, assetId: string) => {
  const [u, asset] = await Promise.all([role(req), prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, branchId: true, category: { select: { name: true } } } })]);
  return { u, asset, allowed: Boolean(asset && (isSuper(u) || u?.branchId === asset.branchId)) };
};
const categoryMatches = (name: string | null | undefined) => /phone/i.test(name ?? "");

router.use(requireAuth);

router.get("/", requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const u = await role(req); const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!isSuper(u) && branchId && branchId !== u?.branchId) return res.status(403).json({ error: "Branch is outside your scope." });
  if (!(await enabled(branchId ?? u?.branchId ?? undefined))) return gate(res);
  const items = await prisma.phoneProfile.findMany({
    where: { asset: { branchId: isSuper(u) ? branchId : u?.branchId } },
    include: { asset: { select: { id: true, name: true, assetTag: true, imeiNumber: true, propertyTag: true, ownership: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items });
});

router.post("/", requirePermission("manage_infrastructure_assets"), async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const allowed = ["assetId", "brand", "model", "notes"];
  const bad = unknownFields(b, allowed);
  if (bad.length) return res.status(400).json({ error: "Unknown fields are not accepted.", code: "INVALID_PAYLOAD", fieldErrors: bad });
  const assetId = typeof b.assetId === "string" ? b.assetId : "";
  const s = await scopeAsset(req, assetId);
  if (!s.asset) return res.status(404).json({ error: "Asset not found." });
  if (!s.allowed) return res.status(403).json({ error: "Asset is outside your branch scope." });
  if (!categoryMatches(s.asset.category?.name)) return res.status(400).json({ error: "Asset category must be Phone.", code: "INVALID_ASSET_CATEGORY" });
  if (!(await enabled(s.asset.branchId ?? undefined))) return gate(res);
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "Idempotency-Key is required." });
  const data = { assetId, brand: typeof b.brand === "string" ? b.brand.trim() : null, model: typeof b.model === "string" ? b.model.trim() : null, notes: typeof b.notes === "string" ? b.notes.trim() : null };
  const dataHash = hash(data);
  const prior = await prisma.phoneProfile.findUnique({ where: { idempotencyKey: key } });
  if (prior) {
    if (prior.idempotencyPayloadHash !== dataHash) return res.status(409).json({ error: "Idempotency-Key was reused for different data.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.json(prior);
  }
  Object.assign(data, { idempotencyKey: key, idempotencyPayloadHash: dataHash });
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.phoneProfile.create({ data });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "phone_created", entity: "PhoneProfile", entityId: created.id, metadata: { source: "phone_manual", actorId: req.user!.id, assetId, branchId: s.asset!.branchId } } });
      return created;
    });
    broadcastChange({ entity: "PhoneProfile", action: "phone_created", entityId: item.id, branchId: s.asset!.branchId });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ error: "A phone profile already exists for this asset.", code: "DUPLICATE_PHONE_PROFILE" });
  }
});

export default router;
