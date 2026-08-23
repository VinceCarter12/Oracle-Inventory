import { Router, Response } from "express";
import crypto from "crypto";
import multer from "multer";
import { requireAuth, requirePermission, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { Prisma, ProposalState } from "../generated/prisma/client";
import { logActivity } from "../lib/activity";
import { parseBelarc } from "../lib/belarc/parseBelarc";
import { compareSpecs } from "../lib/belarc/compare";
import { NotABelarcReportError, type ParsedSpecs } from "../lib/belarc/types";

const router = Router();

// ── Belarc proposal hardening (Phase 2) ─────────────────────────────────────
// Production-disabled by default. Enabling requires explicit env flags AND a
// rollout record/branch override, AND an approved retention mode. This gate
// only affects the *proposal* generation path further below — base scan
// upload, comparison, and baseline behavior are unchanged when disabled, and
// unchanged for any pre-existing scan/evidence data.
async function belarcCapability(branchId?: string) {
  const retention = retentionConfig();
  const retentionApproved = retention.mode !== null && (retention.mode === "redacted_only" || retention.key !== null);
  const envDisabled =
    process.env.BELARC_PROPOSALS_ENABLED !== "true" ||
    process.env.BELARC_PROPOSALS_APPROVED !== "true" ||
    !retentionApproved;
  const feature = await prisma.featureRollout.findUnique({ where: { key: "belarc.proposals" } }).catch(() => null);
  const override =
    feature && branchId
      ? await prisma.featureRolloutBranch
          .findUnique({ where: { featureKey_branchId: { featureKey: feature.key, branchId } } })
          .catch(() => null)
      : null;
  return {
    enabled: !envDisabled && Boolean(override?.enabled ?? (feature?.enabledGlobally && feature.status === "enabled")),
    featureKey: "belarc.proposals",
    retentionMode: retentionApproved ? retention.mode : null,
    reason: envDisabled ? "disabled-until-licensing-and-retention-approval" : feature ? "rollout-control" : "no-rollout-record",
  };
}

// Allowlist of fields a Belarc proposal is ever allowed to target. Anything
// not on this list can never become a proposal, no matter what a report contains.
const PROPOSAL_FIELDS = new Set([
  "Asset.computerName",
  "Asset.serialNumber",
  "Asset.assetTag",
  "DeviceProfile.model",
  "DeviceProfile.operatingSystem",
  "DeviceProfile.processor",
  "DeviceProfile.motherboard",
  "AssetComponent.ram.capacity",
]);
const PROPOSAL_DECISIONS = new Set(["accepted", "rejected", "verified"]);

// Allowlist of raw Belarc field keys that are safe to surface at all. Anything
// else parsed out of a report (serials of unrelated peripherals, install paths,
// license keys, etc.) is dropped before it ever reaches a proposal or a preview.
const SAFE_BELARC_FIELD_KEYS = new Set([
  "systemModel.model",
  "systemModel.system_serial_number",
  "systemModel.asset_tag",
  "operatingSystem.description",
  "processor.name",
  "memory.total",
  "mainBoard.board",
  "communications.adapter0.mac",
]);

// Redacts a parsed Belarc report down to the safe-field allowlist. Used only
// for proposal-preview/creation — never mutates what is already stored.
export function projectParsedSpecs(parsed: ParsedSpecs): { specs: ParsedSpecs; omittedUnsafeCount: number } {
  let omittedUnsafeCount = 0;
  const sections: ParsedSpecs["sections"] = {};
  for (const [sectionKey, section] of Object.entries(parsed.sections)) {
    const fields = section.fields.filter((field) => SAFE_BELARC_FIELD_KEYS.has(field.key));
    omittedUnsafeCount += section.fields.length - fields.length;
    if (fields.length) sections[sectionKey] = { ...section, fields };
  }
  return {
    specs: {
      version: parsed.version,
      meta: {
        computerName: parsed.meta.computerName,
        profileDate: parsed.meta.profileDate,
        advisorVersion: parsed.meta.advisorVersion,
        missingSections: parsed.meta.missingSections,
      },
      sections,
    },
    omittedUnsafeCount,
  };
}

function proposalField(key: SafeMergeKey): { fieldKey: string; targetType: string } | null {
  const map: Partial<Record<SafeMergeKey, { fieldKey: string; targetType: string }>> = {
    systemModel: { fieldKey: "Asset.computerName", targetType: "Asset" },
    systemSerial: { fieldKey: "Asset.serialNumber", targetType: "Asset" },
    os: { fieldKey: "DeviceProfile.operatingSystem", targetType: "DeviceProfile" },
    processor: { fieldKey: "DeviceProfile.processor", targetType: "DeviceProfile" },
    motherboard: { fieldKey: "DeviceProfile.motherboard", targetType: "DeviceProfile" },
    ram: { fieldKey: "AssetComponent.ram.capacity", targetType: "AssetComponent" },
    assetTag: { fieldKey: "Asset.assetTag", targetType: "Asset" },
  };
  return map[key] ?? null;
}

// Redaction gate for proposal values / free-text reasons: rejects anything
// that looks like a secret, credential, connection string, or bearer/JWT token.
function safeProposalValue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (/(password|passwd|secret|token|api[_-]?key|bearer|authorization|private[_-]?key)/i.test(value)) return null;
  if (
    /^postgres(?:ql)?:\/\//i.test(value) ||
    /^https?:\/\/[^/\s]+:[^/\s]+@/i.test(value) ||
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)
  )
    return null;
  return value.trim();
}

// Retention is opt-in: with no env configuration, this returns { mode: null },
// which means "unchanged legacy behavior" everywhere it's consulted below.
function retentionConfig(): { mode: "redacted_only" | "encrypted_limited" | null; key: Buffer | null; days: number | null } {
  const mode = process.env.BELARC_RETENTION_MODE;
  if (process.env.BELARC_RETENTION_APPROVED !== "true") return { mode: null, key: null, days: null };
  if (mode === "redacted_only") return { mode, key: null, days: null };
  if (mode !== "encrypted_limited") return { mode: null, key: null, days: null };
  const days = Number(process.env.BELARC_RETENTION_DAYS ?? "");
  if (!Number.isFinite(days) || days <= 0) return { mode: null, key: null, days: null };
  const raw = process.env.BELARC_RETENTION_KEY ?? "";
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : /^[A-Za-z0-9+/]{43}=$/.test(raw) ? Buffer.from(raw, "base64") : null;
  return { mode, key: key?.length === 32 ? key : null, days };
}
function retentionExpiry(): Date | null {
  const days = retentionConfig().days;
  if (days === null || !Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + Math.floor(days) * 86_400_000);
}
export function encryptBelarcHtml(html: string, key: Buffer) {
  if (key.length !== 32) throw new Error("BELARC_RETENTION_KEY must be 32 bytes.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function decryptBelarcHtml(ciphertext: string, iv: string, tag: string, key: Buffer) {
  if (key.length !== 32) throw new Error("BELARC_RETENTION_KEY must be 32 bytes.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// Branch-scoping helper used only by the *new* proposal/evidence-management
// endpoints below. Pre-existing endpoints keep their original access rules
// unchanged so this hardening pass cannot regress already-shipped behavior.
async function scopedAsset(req: AuthRequest, assetId: string) {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, branchId: true } });
  if (!asset) return { asset: null, allowed: false };
  const isSuper = user?.role?.name?.trim().toLowerCase() === "super_admin";
  return { asset, allowed: Boolean(isSuper || (user?.branchId && user.branchId === asset.branchId)) };
}

// ── GET /api/hardware-audit/capabilities ────────────────────────────────────
// Lets the frontend know whether Belarc proposals are enabled anywhere it can
// see. Always safe to call; reflects the same gates enforced server-side.
router.get("/capabilities", requireAuth, requirePermission("view_inventory"), async (_req: AuthRequest, res: Response) => {
  res.json({ belarcProposals: await belarcCapability() });
});

// ── GET /api/hardware-audit/proposals ───────────────────────────────────────
// Lists InventoryFieldProposal rows. Empty by default — nothing creates rows
// here unless Belarc proposals are explicitly enabled (see POST /scan below).
router.get("/proposals", requireAuth, requirePermission("view_inventory"), async (req: AuthRequest, res: Response) => {
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : undefined;
  if (assetId) {
    const scope = await scopedAsset(req, assetId);
    if (!scope.asset) { res.status(404).json({ error: "Asset not found." }); return; }
    if (!scope.allowed) { res.status(403).json({ error: "Asset is outside your branch scope." }); return; }
  }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  const isSuper = user?.role?.name?.trim().toLowerCase() === "super_admin";
  if (!isSuper && !user?.branchId) { res.status(403).json({ error: "A branch is required for proposal access." }); return; }
  const state =
    typeof req.query.state === "string" && Object.values(ProposalState).includes(req.query.state as ProposalState)
      ? (req.query.state as ProposalState)
      : undefined;
  const proposals = await prisma.inventoryFieldProposal.findMany({
    where: {
      ...(assetId ? { assetId } : {}),
      ...(state ? { state } : {}),
      ...(!isSuper && user?.branchId ? { asset: { branchId: user.branchId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, assetId: true, hardwareScanId: true, fieldKey: true, targetType: true, targetRecordId: true,
      proposedValueJson: true, officialValueSnapshotJson: true, state: true, sourceConfidence: true,
      resolvedById: true, resolvedAt: true, reason: true, createdAt: true, updatedAt: true,
    },
  });
  res.json({ proposals });
});

// ── PUT /api/hardware-audit/proposals/:proposalId/resolve ──────────────────
// Only path that can ever apply a Belarc-sourced value to Asset/DeviceProfile/
// AssetComponent. Requires Super Admin, an idempotency key, optimistic
// concurrency (expectedUpdatedAt), and passes every value through the same
// redaction gate used at proposal-creation time.
router.put("/proposals/:proposalId/resolve", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  if (!idempotencyKey) { res.status(400).json({ error: "Idempotency-Key is required." }); return; }
  const body = req.body as Record<string, unknown>;
  const unknownKeys = Object.keys(body).filter((key) => !new Set(["decision", "reason", "expectedUpdatedAt"]).has(key));
  if (unknownKeys.length) { res.status(400).json({ error: "Unknown proposal resolution fields.", fields: unknownKeys }); return; }
  const decision = typeof body.decision === "string" ? body.decision : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (!PROPOSAL_DECISIONS.has(decision) || !expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
    res.status(400).json({ error: "decision and valid expectedUpdatedAt are required." });
    return;
  }
  if (reason && !safeProposalValue(reason)) { res.status(400).json({ error: "reason contains a sensitive value." }); return; }
  const existing = await prisma.inventoryFieldProposal.findUnique({ where: { id: req.params.proposalId } });
  if (!existing) { res.status(404).json({ error: "Proposal not found." }); return; }
  const scope = await scopedAsset(req, existing.assetId);
  if (!scope.allowed) { res.status(403).json({ error: "Proposal is outside your branch scope." }); return; }
  if (existing.lastIdempotencyKey === idempotencyKey) { res.json(existing); return; }
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    res.status(409).json({ error: "Proposal changed since it was loaded.", code: "STALE_WRITE", currentUpdatedAt: existing.updatedAt });
    return;
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (decision === "accepted") {
        const value = safeProposalValue(existing.proposedValueJson);
        if (!value) throw new Error("Proposal value is not safe to accept.");
        if (existing.targetType === "Asset") {
          if (existing.fieldKey === "Asset.computerName") await tx.asset.update({ where: { id: existing.targetRecordId }, data: { computerName: value } });
          else if (existing.fieldKey === "Asset.serialNumber") await tx.asset.update({ where: { id: existing.targetRecordId }, data: { serialNumber: value } });
          else if (existing.fieldKey === "Asset.assetTag") await tx.asset.update({ where: { id: existing.targetRecordId }, data: { assetTag: value } });
        } else if (existing.targetType === "DeviceProfile") {
          const profileData: Prisma.DeviceProfileUpdateInput = {};
          if (existing.fieldKey === "DeviceProfile.model") profileData.model = value;
          if (existing.fieldKey === "DeviceProfile.operatingSystem") profileData.operatingSystem = value;
          if (existing.fieldKey === "DeviceProfile.processor") profileData.processor = value;
          if (existing.fieldKey === "DeviceProfile.motherboard") profileData.motherboard = value;
          const profileCreate: Prisma.DeviceProfileUncheckedCreateInput = { assetId: existing.targetRecordId };
          if (typeof profileData.model === "string") profileCreate.model = profileData.model;
          if (typeof profileData.operatingSystem === "string") profileCreate.operatingSystem = profileData.operatingSystem;
          if (typeof profileData.processor === "string") profileCreate.processor = profileData.processor;
          if (typeof profileData.motherboard === "string") profileCreate.motherboard = profileData.motherboard;
          await tx.deviceProfile.upsert({ where: { assetId: existing.targetRecordId }, create: profileCreate, update: profileData });
        } else if (existing.targetType === "AssetComponent") {
          await tx.assetComponent.create({ data: { assetId: existing.assetId, type: "ram", capacity: value, source: "belarc_proposal" } });
        }
      }
      const changed = await tx.inventoryFieldProposal.updateMany({
        where: { id: existing.id, updatedAt: expectedUpdatedAt },
        data: { state: decision as ProposalState, resolvedById: req.user!.id, resolvedAt: new Date(), reason, lastIdempotencyKey: idempotencyKey },
      });
      if (changed.count !== 1) throw new Error("STALE_WRITE");
      await tx.activityLog.create({
        data: {
          userId: req.user!.id, action: `belarc_proposal_${decision}`, entity: "InventoryFieldProposal", entityId: existing.id,
          metadata: { proposalId: existing.id, assetId: existing.assetId, fieldKey: existing.fieldKey, decision, reason },
        },
      });
      return changed;
    });
    if (updated.count !== 1) { res.status(409).json({ error: "Proposal changed since it was loaded.", code: "STALE_WRITE" }); return; }
    res.json(await prisma.inventoryFieldProposal.findUnique({ where: { id: existing.id } }));
  } catch (e) {
    if (e instanceof Error && e.message === "STALE_WRITE") { res.status(409).json({ error: "Proposal changed since it was loaded.", code: "STALE_WRITE" }); return; }
    if (e instanceof Error && e.message.includes("not safe")) { res.status(400).json({ error: e.message }); return; }
    console.error("hardware-audit proposal resolve failed:", e);
    res.status(500).json({ error: "Failed to resolve proposal." });
  }
});

// multer — memory storage, max 2 MB (real Belarc exports are ~130 KB), HTML only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      /\.html?$/i.test(file.originalname) ||
      file.mimetype === "text/html" ||
      file.mimetype === "application/octet-stream";
    if (ok) cb(null, true);
    else cb(new Error("Only Belarc HTML exports (.html, .htm) are accepted"));
  },
});

// Scan list/detail payloads never include rawHtml (it's ~130 KB of evidence,
// served only by the /raw endpoint)
const scanSummarySelect = {
  id: true,
  assetId: true,
  fileName: true,
  isBaseline: true,
  overallStatus: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

// Fields eligible for a proposal-preview / proposal-creation merge comparison.
const SAFE_MERGE_KEYS = ["systemModel", "systemSerial", "os", "processor", "ram", "motherboard", "macAddress", "assetTag"] as const;
type SafeMergeKey = (typeof SAFE_MERGE_KEYS)[number];
type MergeState = "apply" | "verified" | "conflict" | "unavailable";
type MergeItem = { key: SafeMergeKey; label: string; official: string | null; current: string | null; state: MergeState };

function firstField(parsed: ParsedSpecs, section: string, key: string): string | null {
  const fields = parsed.sections[section]?.fields ?? [];
  const field = fields.find((item) => item.key === key);
  return field ? field.value : null;
}
function firstMac(parsed: ParsedSpecs): string | null {
  const fields = parsed.sections.communications?.fields ?? [];
  return fields.find((item) => /^communications\.adapter\d+\.mac$/.test(item.key))?.value ?? null;
}

export function mergeItems(
  parsed: ParsedSpecs,
  asset: { name: string; serialNumber: string | null; macAddress: string | null; assetTag: string | null; metadata: Prisma.JsonValue | null }
): MergeItem[] {
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? (asset.metadata as Record<string, unknown>) : {};
  const source: Record<SafeMergeKey, string | null> = {
    systemModel: firstField(parsed, "systemModel", "systemModel.model"),
    systemSerial: firstField(parsed, "systemModel", "systemModel.system_serial_number"),
    os: firstField(parsed, "operatingSystem", "operatingSystem.description"),
    processor: firstField(parsed, "processor", "processor.name"),
    ram: firstField(parsed, "memory", "memory.total"),
    motherboard: firstField(parsed, "mainBoard", "mainBoard.board"),
    macAddress: firstMac(parsed),
    assetTag: firstField(parsed, "systemModel", "systemModel.asset_tag"),
  };
  const current: Record<SafeMergeKey, string | null> = {
    systemModel: asset.name,
    systemSerial: asset.serialNumber,
    os: typeof metadata.os === "string" ? metadata.os : null,
    processor: typeof metadata.processor === "string" ? metadata.processor : null,
    ram: typeof metadata.ram === "string" ? metadata.ram : null,
    motherboard: typeof metadata.motherboard === "string" ? metadata.motherboard : null,
    macAddress: asset.macAddress,
    assetTag: asset.assetTag,
  };
  const labels: Record<SafeMergeKey, string> = {
    systemModel: "System model → Asset name", systemSerial: "System serial → Serial number", os: "Operating system",
    processor: "Processor", ram: "Installed memory", motherboard: "Main board", macAddress: "First MAC address", assetTag: "Asset tag",
  };
  return SAFE_MERGE_KEYS.map((key) => {
    const official = source[key];
    const existing = current[key];
    const officialBlank = official === null || official.trim() === "";
    const existingBlank = existing === null || existing.trim() === "";
    const state: MergeState =
      official === null ? "unavailable" : existingBlank ? (officialBlank ? "verified" : "apply") : existing.trim() === official.trim() ? "verified" : "conflict";
    return { key, label: labels[key], official, current: existing, state };
  });
}

// ── POST /api/hardware-audit/scan ───────────────────────────────────────────
// Upload a Belarc HTML export. Pass dryRun=true to parse + preview only.
// Base scan/comparison/baseline behavior below is byte-for-byte unchanged
// from the pre-Phase-2 implementation. Proposal creation is purely additive
// and only runs when belarcCapability(...).enabled is true (off by default).
router.post(
  "/scan",
  requireAuth,
  requirePermission("view_inventory"),
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }
    const html = req.file.buffer.toString("utf-8");

    let parsedSpecs;
    try {
      parsedSpecs = parseBelarc(html);
    } catch (e) {
      if (e instanceof NotABelarcReportError) {
        res.status(400).json({ error: "This file does not look like a Belarc Advisor report." });
        return;
      }
      throw e;
    }

    const assetId = req.body.assetId as string | undefined;

    if (req.body.dryRun === "true") {
      // Preview parse — and preview the comparison too when the asset already
      // has a baseline, so the uploader sees discrepancies before submitting.
      // Also includes a redacted/safe-field merge preview and the current
      // Belarc proposal capability so the frontend can decide whether to show
      // proposal-related UI. None of this mutates anything.
      let comparison = null;
      let merge: MergeItem[] = [];
      let capability = await belarcCapability();
      if (assetId) {
        const baseline = await prisma.hardwareScan.findFirst({
          where: { assetId, isBaseline: true },
          select: { parsedSpecs: true },
        }).catch(() => null);
        if (baseline) {
          comparison = compareSpecs(baseline.parsedSpecs as unknown as ParsedSpecs, parsedSpecs);
        }
        const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { branchId: true, name: true, serialNumber: true, macAddress: true, assetTag: true, metadata: true } });
        if (asset) {
          merge = mergeItems(parsedSpecs, asset);
          capability = await belarcCapability(asset.branchId ?? undefined);
        }
      }
      const projection = projectParsedSpecs(parsedSpecs);
      res.json({ dryRun: true, parsedSpecs, comparison, merge, omittedUnsafeCount: projection.omittedUnsafeCount, belarcProposals: capability });
      return;
    }

    if (!assetId) {
      res.status(400).json({ error: "assetId is required." });
      return;
    }

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, name: true, branchId: true, serialNumber: true, macAddress: true, assetTag: true, metadata: true },
      });
      if (!asset) {
        res.status(404).json({ error: "Asset not found." });
        return;
      }

      const baseline = await prisma.hardwareScan.findFirst({
        where: { assetId, isBaseline: true },
        select: { id: true, parsedSpecs: true },
      });
      const comparison = baseline
        ? compareSpecs(baseline.parsedSpecs as unknown as ParsedSpecs, parsedSpecs)
        : null;

      // Retention is opt-in (see retentionConfig). With no env configuration
      // this resolves to { mode: null } and rawHtml storage below is
      // identical to the pre-Phase-2 behavior.
      const retention = retentionConfig();
      const encrypted = retention.mode === "encrypted_limited" && retention.key ? encryptBelarcHtml(html, retention.key) : null;
      const storeRawPlain = retention.mode === null; // default/unconfigured — unchanged legacy behavior
      const contentSha256 = crypto.createHash("sha256").update(html).digest("hex");
      const idempotencyKeyHeader = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
      const idempotencyKey = idempotencyKeyHeader || crypto.randomUUID();

      const scan = await prisma.hardwareScan.create({
        data: {
          assetId,
          submittedById: req.user!.id,
          fileName: req.file.originalname,
          rawHtml: storeRawPlain ? html : "",
          rawHtmlCiphertext: encrypted?.ciphertext,
          rawHtmlIv: encrypted?.iv,
          rawHtmlTag: encrypted?.tag,
          rawRetentionMode: retention.mode,
          retentionUntil: encrypted ? retentionExpiry() : null,
          parsedSpecs: JSON.parse(JSON.stringify(parsedSpecs)),
          comparisonResult: comparison ? JSON.parse(JSON.stringify(comparison)) : undefined,
          overallStatus: comparison?.overallStatus ?? null,
          parserVersion: "belarc-parser-v1",
          sourceProduct: "Belarc Advisor",
          contentSha256,
          idempotencyKey,
        },
        select: scanSummarySelect,
      });

      await logActivity({
        userId: req.user!.id,
        action: "hardware_scan_submitted",
        entity: "Asset",
        entityId: assetId,
        metadata: {
          scanId: scan.id,
          fileName: req.file.originalname,
          computerName: parsedSpecs.meta.computerName ?? null,
          missingSections: parsedSpecs.meta.missingSections,
          overallStatus: comparison?.overallStatus ?? null,
        },
      });

      // ── Belarc proposal creation (additive, gated) ──────────────────────
      // Off by default. Never applies anything to Asset/DeviceProfile/
      // AssetComponent directly — only ever creates *proposal* rows that
      // require a Super Admin to review via PUT /proposals/:id/resolve.
      let proposalsCreated = 0;
      try {
        const capability = await belarcCapability(asset.branchId ?? undefined);
        if (capability.enabled) {
          const merge = mergeItems(parsedSpecs, asset);
          for (const item of merge) {
            if (item.state !== "apply" && item.state !== "conflict") continue;
            const mapped = proposalField(item.key);
            if (!mapped || !PROPOSAL_FIELDS.has(mapped.fieldKey)) continue;
            const value = safeProposalValue(item.official);
            if (!value) continue;
            const snapshot = safeProposalValue(item.current);
            await prisma.inventoryFieldProposal.create({
              data: {
                hardwareScanId: scan.id,
                assetId,
                fieldKey: mapped.fieldKey,
                targetType: mapped.targetType,
                targetRecordId: assetId,
                proposedValueJson: value,
                officialValueSnapshotJson: snapshot ?? Prisma.JsonNull,
                state: item.state === "conflict" ? "conflict" : "proposed",
                sourceConfidence: item.state === "conflict" ? "conflicted" : "observed",
              },
            });
            proposalsCreated += 1;
          }
        }
      } catch (proposalError) {
        // Never let the additive proposal path fail the base scan upload.
        console.error("hardware-audit belarc proposal creation failed:", proposalError);
      }

      res.status(201).json({ ...scan, proposalsCreated });
    } catch (e) {
      console.error("hardware-audit scan upload failed:", e);
      res.status(500).json({ error: "Failed to store the scan." });
    }
  }
);

// ── GET /api/hardware-audit/scans ─────────────────────────────────────────────
// Filters: assetId, status, overallStatus, branchId. Paginated. Summary counts
// (for the queue chips) ignore the status/overallStatus filters so the chips
// stay stable while filtering, but respect assetId/branchId scoping.
router.get(
  "/scans",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { assetId, status, overallStatus, branchId } = req.query as Record<string, string | undefined>;
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10) || 20));

      const scope = {
        ...(assetId ? { assetId } : {}),
        ...(branchId ? { asset: { branchId } } : {}),
      };
      const where = {
        ...scope,
        ...(status && ["pending", "reviewed", "flagged", "archived"].includes(status) ? { status: status as never } : {}),
        ...(overallStatus && ["match", "warning", "mismatch"].includes(overallStatus) ? { overallStatus: overallStatus as never } : {}),
      };

      // Sorted for the review queue: pending first, worst comparison first, newest first
      const [scans, total, mismatches, warnings, clean, pendingMismatches] = await Promise.all([
        prisma.hardwareScan.findMany({
          where,
          orderBy: [{ status: "asc" }, { overallStatus: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            ...scanSummarySelect,
            asset: { select: { id: true, name: true, serialNumber: true, branch: { select: { id: true, name: true } } } },
          },
        }),
        prisma.hardwareScan.count({ where }),
        prisma.hardwareScan.count({ where: { ...scope, isBaseline: false, overallStatus: "mismatch" } }),
        prisma.hardwareScan.count({ where: { ...scope, isBaseline: false, overallStatus: "warning" } }),
        prisma.hardwareScan.count({ where: { ...scope, isBaseline: false, overallStatus: "match" } }),
        prisma.hardwareScan.count({ where: { ...scope, isBaseline: false, overallStatus: "mismatch", status: "pending" } }),
      ]);

      res.json({
        scans,
        total,
        page,
        pageSize,
        summary: { mismatches, warnings, clean, pendingMismatches },
      });
    } catch (e) {
      console.error("hardware-audit list failed:", e);
      res.status(500).json({ error: "Failed to load scans." });
    }
  }
);

// ── GET /api/hardware-audit/badge ─────────────────────────────────────────────
// Lightweight count for the sidebar red-dot badge.
router.get(
  "/badge",
  requireAuth,
  requirePermission("view_inventory"),
  async (_req: AuthRequest, res: Response) => {
    try {
      const pendingMismatches = await prisma.hardwareScan.count({
        where: { isBaseline: false, overallStatus: "mismatch", status: "pending" },
      });
      res.json({ pendingMismatches });
    } catch (e) {
      console.error("hardware-audit badge failed:", e);
      res.status(500).json({ error: "Failed to load badge count." });
    }
  }
);

// ── GET /api/hardware-audit/baseline/:assetId ─────────────────────────────────
router.get(
  "/baseline/:assetId",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const baseline = await prisma.hardwareScan.findFirst({
        where: { assetId: req.params.assetId, isBaseline: true },
        select: { ...scanSummarySelect, parsedSpecs: true },
      });
      res.json(baseline); // null when no baseline accepted yet
    } catch (e) {
      console.error("hardware-audit baseline fetch failed:", e);
      res.status(500).json({ error: "Failed to load baseline." });
    }
  }
);

// ── GET /api/hardware-audit/scans/:scanId ─────────────────────────────────────
router.get(
  "/scans/:scanId",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: {
          ...scanSummarySelect,
          parsedSpecs: true,
          comparisonResult: true,
          reviewNotes: true,
          asset: { select: { id: true, name: true, serialNumber: true, branch: { select: { id: true, name: true } } } },
        },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }
      res.json(scan);
    } catch (e) {
      console.error("hardware-audit detail failed:", e);
      res.status(500).json({ error: "Failed to load scan." });
    }
  }
);

// ── GET /api/hardware-audit/scans/:scanId/raw ─────────────────────────────────
// Original Belarc HTML kept as evidence. Sandboxed: uploaded HTML must never
// run scripts when viewed. Additive support for the encrypted-retention mode:
// pre-Phase-2 scans (rawRetentionMode null) are served exactly as before.
router.get(
  "/scans/:scanId/raw",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: {
          rawHtml: true, fileName: true, rawHtmlCiphertext: true, rawHtmlIv: true, rawHtmlTag: true,
          rawRetentionMode: true, retentionUntil: true, purgedAt: true,
        },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }
      if (scan.purgedAt) { res.status(410).json({ error: "Belarc evidence has been purged.", code: "EVIDENCE_PURGED" }); return; }
      if (scan.retentionUntil && scan.retentionUntil <= new Date()) {
        res.status(410).json({ error: "Belarc evidence retention has expired.", code: "RETENTION_EXPIRED" });
        return;
      }
      let rawHtml = scan.rawHtml;
      if (scan.rawRetentionMode === "encrypted_limited") {
        const retention = retentionConfig();
        if (!retention.key || !scan.rawHtmlCiphertext || !scan.rawHtmlIv || !scan.rawHtmlTag) {
          res.status(410).json({ error: "Encrypted Belarc retention is unavailable." });
          return;
        }
        try {
          rawHtml = decryptBelarcHtml(scan.rawHtmlCiphertext, scan.rawHtmlIv, scan.rawHtmlTag, retention.key);
        } catch {
          res.status(410).json({ error: "Encrypted Belarc retention could not be decrypted." });
          return;
        }
      }
      if (!rawHtml) { res.status(410).json({ error: "Raw Belarc retention is not enabled for this scan." }); return; }
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(rawHtml);
    } catch (e) {
      console.error("hardware-audit raw fetch failed:", e);
      res.status(500).json({ error: "Failed to load raw report." });
    }
  }
);

// ── GET /api/hardware-audit/expired-evidence ────────────────────────────────
// Lists encrypted evidence past its retention window. Listing only — purge is
// a separate, explicit, confirmed Super Admin action below.
router.get("/expired-evidence", requireAuth, requireSuperAdmin, async (_req: AuthRequest, res: Response) => {
  const scans = await prisma.hardwareScan.findMany({
    where: { rawRetentionMode: "encrypted_limited", retentionUntil: { lte: new Date() }, purgedAt: null },
    select: { id: true, assetId: true, retentionUntil: true, createdAt: true },
    orderBy: { retentionUntil: "asc" },
  });
  res.json({ scans, count: scans.length, action: "Purge each item with POST /scans/:scanId/raw/purge after explicit confirmation." });
});

// ── POST /api/hardware-audit/scans/:scanId/raw/purge ────────────────────────
// Super Admin only. Requires confirm=true and a non-sensitive reason. Clears
// ciphertext/iv/tag, stamps purgedAt, and writes a redacted audit entry. Not
// an automatic delete job — always an explicit, reviewed action.
router.post(
  "/scans/:scanId/raw/purge",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const unknown = Object.keys(body).filter((key) => !new Set(["confirm", "reason"]).has(key));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (unknown.length || body.confirm !== true || !reason || !safeProposalValue(reason)) {
      res.status(400).json({ error: "Purge requires confirm=true and a non-sensitive reason." });
      return;
    }
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: { id: true, assetId: true, rawRetentionMode: true, rawHtmlCiphertext: true, purgedAt: true },
      });
      if (!scan) { res.status(404).json({ error: "Scan not found." }); return; }
      if (scan.rawRetentionMode !== "encrypted_limited") { res.status(409).json({ error: "Only encrypted evidence can be purged." }); return; }
      if (scan.purgedAt || !scan.rawHtmlCiphertext) { res.status(409).json({ error: "Evidence is already purged." }); return; }
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.hardwareScan.updateMany({
          where: { id: scan.id, purgedAt: null, rawHtmlCiphertext: { not: null } },
          data: { rawHtmlCiphertext: null, rawHtmlIv: null, rawHtmlTag: null, rawHtml: "", purgedAt: new Date() },
        });
        if (updated.count !== 1) throw new Error("PURGE_CONFLICT");
        await tx.activityLog.create({
          data: { userId: req.user!.id, action: "hardware_scan_evidence_purged", entity: "HardwareScan", entityId: scan.id, metadata: { scanId: scan.id, assetId: scan.assetId, reason } },
        });
        return updated;
      });
      res.json({ purged: result.count === 1, scanId: scan.id });
    } catch (e) {
      if (e instanceof Error && e.message === "PURGE_CONFLICT") { res.status(409).json({ error: "Evidence was already purged or changed." }); return; }
      console.error("hardware-audit evidence purge failed:", e);
      res.status(500).json({ error: "Failed to purge encrypted evidence." });
    }
  },
);

// ── PUT /api/hardware-audit/scans/:scanId/baseline ────────────────────────────
// Accept this scan as the asset's baseline (exactly one per asset).
router.put(
  "/scans/:scanId/baseline",
  requireAuth,
  requirePermission("edit_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: { id: true, assetId: true },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.hardwareScan.updateMany({
          where: { assetId: scan.assetId, isBaseline: true },
          data: { isBaseline: false },
        });
        const accepted = await tx.hardwareScan.update({
          where: { id: scan.id },
          // The baseline is the reference point — nothing to compare it against
          data: { isBaseline: true, comparisonResult: Prisma.DbNull, overallStatus: null, status: "reviewed", reviewedById: req.user!.id, reviewedAt: new Date() },
          select: { ...scanSummarySelect, parsedSpecs: true },
        });

        // Pending scans were compared against the old baseline — recompute
        // against the new one so the queue reflects reality
        const pending = await tx.hardwareScan.findMany({
          where: { assetId: scan.assetId, isBaseline: false, status: "pending" },
          select: { id: true, parsedSpecs: true },
        });
        const baselineSpecs = accepted.parsedSpecs as unknown as ParsedSpecs;
        for (const p of pending) {
          const comparison = compareSpecs(baselineSpecs, p.parsedSpecs as unknown as ParsedSpecs);
          await tx.hardwareScan.update({
            where: { id: p.id },
            data: {
              comparisonResult: JSON.parse(JSON.stringify(comparison)),
              overallStatus: comparison.overallStatus,
            },
          });
        }
        return accepted;
      });

      await logActivity({
        userId: req.user!.id,
        action: "hardware_baseline_accepted",
        entity: "Asset",
        entityId: scan.assetId,
        metadata: { scanId: scan.id },
      });

      res.json(updated);
    } catch (e) {
      console.error("hardware-audit baseline accept failed:", e);
      res.status(500).json({ error: "Failed to accept baseline." });
    }
  }
);

// ── PUT /api/hardware-audit/scans/:scanId/review ──────────────────────────────
// Mark reviewed, flag for action, or archive — with optional admin notes.
router.put(
  "/scans/:scanId/review",
  requireAuth,
  requirePermission("approve_transactions"),
  async (req: AuthRequest, res: Response) => {
    const { action, notes } = req.body as { action?: string; notes?: string };
    if (!action || !["reviewed", "flagged", "archived"].includes(action)) {
      res.status(400).json({ error: "action must be one of: reviewed, flagged, archived." });
      return;
    }
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: { id: true, assetId: true, isBaseline: true },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }

      const updated = await prisma.hardwareScan.update({
        where: { id: scan.id },
        data: {
          status: action as never,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          reviewNotes: notes?.trim() || null,
        },
        select: scanSummarySelect,
      });

      await logActivity({
        userId: req.user!.id,
        action: `hardware_scan_${action}`,
        entity: "Asset",
        entityId: scan.assetId,
        metadata: { scanId: scan.id, notes: notes?.trim() || null },
      });

      res.json(updated);
    } catch (e) {
      console.error("hardware-audit review failed:", e);
      res.status(500).json({ error: "Failed to update review status." });
    }
  }
);

export default router;
