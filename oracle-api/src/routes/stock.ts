import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest, requireAuth, requirePermission } from "../middleware/auth";
import { broadcastChange } from "../lib/ws";

const router = Router(); const featureKey = "stock.tools.v1";
const enabled = async () => { if (process.env.STOCK_TOOLS_ENABLED !== "true") return false; const f = await prisma.featureRollout.findUnique({ where: { key: featureKey } }).catch(() => null); return Boolean(f?.enabledGlobally && f.status === "enabled"); };
const gate = (res: Response) => res.status(503).json({ error: "Tools and stock is disabled.", code: "STOCK_DISABLED" });
const secret = /password|passwd|secret|token|credential|license|api.?key|private.?key/i;
const unknown = (body: Record<string, unknown>, allowed: string[]) => Object.keys(body).filter((k) => !allowed.includes(k));
const rejectSecret = (body: Record<string, unknown>) => Object.entries(body).find(([k, v]) => secret.test(k) || (typeof v === "string" && secret.test(v)));
const balance = async (stockItemId: string, locationId?: string) => { const rows = await prisma.stockLedgerEntry.findMany({ where: { movement: { stockItemId }, ...(locationId ? { locationId } : {}) }, select: { quantityDelta: true } }); return rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0); };
const scopedLocation = async (req: AuthRequest, locationId: string) => { const [location, account] = await Promise.all([prisma.stockLocation.findUnique({ where: { id: locationId } }), prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } })]); const global = account?.role?.name.toLowerCase() === "super_admin"; return { location, allowed: Boolean(location && !location.archivedAt && (global || location.branchId === account?.branchId)) }; };

router.use(requireAuth);
router.use("/items/:id/movements", async (req: AuthRequest, res, next) => { if (req.method !== "GET") return next(); const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const global = account?.role?.name.toLowerCase() === "super_admin"; const row = await prisma.stockLedgerEntry.findFirst({ where: { movement: { stockItemId: req.params.id }, ...(global ? {} : { location: { branchId: account?.branchId ?? "" } }) }, select: { id: true } }); if (!row) return res.status(403).json({ error: "Stock history is outside your branch scope.", code: "STOCK_HISTORY_FORBIDDEN" }); next(); });
router.use("/movements", async (req: AuthRequest, res, next) => { if (req.method !== "POST" || req.path.includes("/transfer")) return next(); const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : ""; const locationId = typeof req.body?.locationId === "string" ? req.body.locationId : ""; const scope = locationId ? await scopedLocation(req, locationId) : null; if (!key || !scope?.allowed) return res.status(key ? 403 : 400).json({ error: key ? "Location is outside your scope or archived." : "Idempotency-Key header is required.", code: key ? "STOCK_LOCATION_FORBIDDEN" : "IDEMPOTENCY_KEY_REQUIRED" }); next(); });
router.use("/movements", async (req: AuthRequest, res, next) => { if (req.method !== "POST" || req.path.includes("/transfer")) return next(); const b = req.body as Record<string, unknown>; const header = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : ""; const types = ["receive", "issue", "transfer", "adjustment", "count_correction", "consume", "return", "opening"]; if (!types.includes(String(b.movementType))) return res.status(400).json({ error: "Invalid movementType.", code: "INVALID_MOVEMENT_TYPE" }); if (typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() !== header) return res.status(409).json({ error: "Idempotency-Key header does not match body.", code: "IDEMPOTENCY_KEY_MISMATCH" }); const item = typeof b.stockItemId === "string" ? await prisma.stockItem.findUnique({ where: { id: b.stockItemId }, select: { active: true, archivedAt: true } }) : null; if (!item || !item.active || item.archivedAt) return res.status(409).json({ error: "Stock item is missing or archived.", code: "STOCK_ITEM_ARCHIVED" }); next(); });
router.use("/locations", async (req: AuthRequest, res, next) => { if (req.method !== "POST") return next(); const b = req.body as Record<string, unknown>; const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); if (account?.role?.name.toLowerCase() !== "super_admin" && b.branchId !== account?.branchId) return res.status(403).json({ error: "Location branch is outside your scope.", code: "STOCK_BRANCH_FORBIDDEN" }); next(); });
router.use("/branches/:branchId/summary", async (req: AuthRequest, res, next) => { const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); if (account?.role?.name.toLowerCase() !== "super_admin" && account?.branchId !== req.params.branchId) return res.status(403).json({ error: "Branch summary is outside your scope.", code: "STOCK_BRANCH_FORBIDDEN" }); next(); });
router.use("/count-sessions/:id/approve", async (req: AuthRequest, res, next) => { if (req.method !== "POST") return next(); const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id }, select: { locationId: true, expectedUpdatedAt: true } }); const expected = typeof req.body?.expectedUpdatedAt === "string" ? new Date(req.body.expectedUpdatedAt) : null; const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : ""; if (!session || !expected || Number.isNaN(expected.getTime()) || !key) return res.status(400).json({ error: "expectedUpdatedAt and Idempotency-Key header are required.", code: "COUNT_APPROVAL_PRECONDITION" }); const scope = await scopedLocation(req, session.locationId); if (!scope.allowed) return res.status(403).json({ error: "Count is outside your branch scope.", code: "STOCK_LOCATION_FORBIDDEN" }); if (expected.getTime() !== session.expectedUpdatedAt.getTime()) return res.status(409).json({ error: "Count changed since it was loaded.", code: "STALE_WRITE" }); next(); });
const skuPrefix = (category: string) => (category.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "STK");
async function nextSku(category: string): Promise<string> {
  const prefix = skuPrefix(category);
  const count = await prisma.stockItem.count({ where: { category } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

router.post("/items", requirePermission("manage_stock"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const b = req.body as Record<string, unknown>;
  const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  const bad = unknown(b, ["sku", "name", "category", "unitOfMeasure", "description", "isSerialized"]);
  if (!key || bad.length || rejectSecret(b) || typeof b.name !== "string" || typeof b.category !== "string" || typeof b.unitOfMeasure !== "string" || (b.sku !== undefined && typeof b.sku !== "string")) {
    return res.status(400).json({ error: "Valid stock item fields and Idempotency-Key are required; secrets are rejected.", code: "INVALID_STOCK_ITEM", fieldErrors: bad });
  }
  const category = b.category.trim();
  const name = b.name.trim();
  const unitOfMeasure = b.unitOfMeasure.trim();
  const description = typeof b.description === "string" ? b.description.trim() : null;
  const isSerialized = b.isSerialized === true;
  const manualSku = typeof b.sku === "string" && b.sku.trim() ? b.sku.trim().toUpperCase() : null;

  const requestFingerprint = JSON.stringify({ name, category, unitOfMeasure, description, isSerialized });
  const existing = await prisma.stockItem.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) return res.status(409).json({ error: "Idempotency-Key was already used for different content.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.json(existing);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const sku = manualSku ?? await nextSku(category);
    try {
      const item = await prisma.stockItem.create({ data: { sku, name, category, unitOfMeasure, description, isSerialized, idempotencyKey: key, requestFingerprint } });
      return res.status(201).json(item);
    } catch {
      if (manualSku) return res.status(409).json({ error: "SKU already exists.", code: "DUPLICATE_SKU" });
      // auto-generated SKU collided (concurrent create) — retry with the next sequence number
    }
  }
  return res.status(409).json({ error: "Could not generate a unique SKU, please try again.", code: "SKU_GENERATION_FAILED" });
});
router.get("/items", requirePermission("view_stock"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const where = q ? { active: true, OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : { active: true };
  const [items, total, account] = await prisma.$transaction([
    prisma.stockItem.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
    prisma.stockItem.count({ where }),
    prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }),
  ]);
  const global = account?.role?.name.toLowerCase() === "super_admin";
  const locationScope = global ? { archivedAt: null } : { archivedAt: null, branchId: account?.branchId ?? "" };
  const enriched = await Promise.all(items.map(async (item) => {
    const rows = await prisma.stockLedgerEntry.findMany({ where: { movement: { stockItemId: item.id }, location: locationScope }, select: { quantityDelta: true } });
    return { ...item, balance: rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0) };
  }));
  return res.json({ items: enriched, page, pageSize, total });
});
router.post("/locations", requirePermission("manage_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const b = req.body as Record<string, unknown>; const types = ["room", "cabinet", "vehicle", "employee_custody", "other"]; const bad = unknown(b, ["branchId", "name", "locationType", "description"]); if (bad.length || rejectSecret(b) || typeof b.branchId !== "string" || typeof b.name !== "string" || !types.includes(String(b.locationType))) return res.status(400).json({ error: "Valid location fields are required.", code: "INVALID_STOCK_LOCATION", fieldErrors: bad }); const location = await prisma.stockLocation.create({ data: { branchId: b.branchId, name: b.name.trim(), locationType: b.locationType as never, description: typeof b.description === "string" ? b.description.trim() : null } }); return res.status(201).json(location); });
router.get("/locations", requirePermission("view_stock"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  const global = account?.role?.name.toLowerCase() === "super_admin";
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  if (!global && branchId && branchId !== account?.branchId) return res.status(403).json({ error: "Branch is outside your scope.", code: "STOCK_BRANCH_FORBIDDEN" });
  const scopeBranch = global ? branchId : (account?.branchId ?? "__none__");
  const locations = await prisma.stockLocation.findMany({ where: { archivedAt: null, ...(scopeBranch ? { branchId: scopeBranch } : {}) }, orderBy: { name: "asc" } });
  return res.json({ items: locations, page: 1, pageSize: locations.length, total: locations.length });
});
router.post("/movements", requirePermission("manage_stock"), async (req: AuthRequest, res, next) => {
  if (typeof req.headers["idempotency-key"] !== "string" || !req.headers["idempotency-key"].trim()) return next();
  if (!(await enabled())) return gate(res);
  const b = req.body as Record<string, unknown>;
  const key = req.headers["idempotency-key"].trim();
  const stockItemId = typeof b.stockItemId === "string" ? b.stockItemId : "";
  const locationId = typeof b.locationId === "string" ? b.locationId : "";
  const movementType = typeof b.movementType === "string" ? b.movementType : "";
  const quantity = typeof b.quantity === "number" ? b.quantity : Number(b.quantity);
  const allowedTypes = ["receive", "issue", "adjustment", "count_correction", "consume", "return", "opening"];
  const bad = unknown(b, ["stockItemId", "movementType", "quantity", "locationId", "reason", "idempotencyKey"]);
  if (bad.length || rejectSecret(b) || !stockItemId || !locationId || !allowedTypes.includes(movementType) || !Number.isFinite(quantity) || quantity <= 0 || (b.destinationLocationId !== undefined) || (typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() !== key)) {
    return res.status(400).json({ error: "Valid movement fields are required and Idempotency-Key must be canonical.", code: "INVALID_STOCK_MOVEMENT", fieldErrors: bad });
  }
  if (["adjustment", "count_correction"].includes(movementType) && (typeof b.reason !== "string" || !b.reason.trim())) return res.status(400).json({ error: "A reason is required for adjustments.", code: "MOVEMENT_REASON_REQUIRED" });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.stockMovement.findUnique({ where: { idempotencyKey: key }, include: { entries: true } });
      if (prior) {
        const fingerprint = JSON.stringify({ stockItemId, movementType, quantity, locationId, reason: typeof b.reason === "string" ? b.reason.trim() : null });
        const same = prior.requestFingerprint === fingerprint;
        if (!same) throw new Error("IDEMPOTENCY_KEY_REUSED");
        return prior;
      }
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId }, select: { active: true, archivedAt: true } });
      if (!item || !item.active || item.archivedAt) throw new Error("STOCK_ITEM_ARCHIVED");
      const rows = await tx.stockLedgerEntry.findMany({ where: { locationId, movement: { stockItemId } }, select: { quantityDelta: true } });
      const current = rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0);
      const sign = ["issue", "consume"].includes(movementType) ? -1 : 1;
      if (sign < 0 && current < quantity) throw new Error("NEGATIVE_STOCK");
      const reason = typeof b.reason === "string" ? b.reason.trim() : null;
      const requestFingerprint = JSON.stringify({ stockItemId, movementType, quantity, locationId, reason });
      const movement = await tx.stockMovement.create({ data: { stockItemId, movementType: movementType as never, quantity, reason, idempotencyKey: key, requestFingerprint, performedById: req.user!.id } });
      await tx.stockLedgerEntry.create({ data: { movementId: movement.id, locationId, quantityDelta: sign * quantity } });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "stock_movement_created", entity: "StockMovement", entityId: movement.id, metadata: { source: "stock_manual", movementType, locationId, quantity, idempotencyKey: key } } });
      return movement;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    const movedLocation = await prisma.stockLocation.findUnique({ where: { id: locationId }, select: { branchId: true } });
    broadcastChange({ entity: "StockMovement", action: "stock_movement_created", entityId: result.id, branchId: movedLocation?.branchId ?? null });
    return res.status(201).json({ movement: result, balance: await balance(stockItemId, locationId) });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") return res.status(409).json({ error: "Idempotency-Key was already used for different content.", code: "IDEMPOTENCY_KEY_REUSED" });
    if (error instanceof Error && error.message === "NEGATIVE_STOCK") return res.status(409).json({ error: "Movement would create negative stock.", code: "NEGATIVE_STOCK" });
    if (error instanceof Error && error.message === "STOCK_ITEM_ARCHIVED") return res.status(409).json({ error: "Stock item is missing or archived.", code: "STOCK_ITEM_ARCHIVED" });
    return res.status(409).json({ error: "Stock movement conflict.", code: "STOCK_MOVEMENT_CONFLICT" });
  }
});
router.get("/items/:id", requirePermission("view_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const item = await prisma.stockItem.findUnique({ where: { id: req.params.id }, include: { policies: { include: { location: true } } } }); if (!item) return res.status(404).json({ error: "Stock item not found." }); return res.json(item); });
router.get("/items/:id/movements", requirePermission("view_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const global = account?.role?.name.toLowerCase() === "super_admin"; const items = await prisma.stockLedgerEntry.findMany({ where: { movement: { stockItemId: req.params.id }, ...(global ? {} : { location: { branchId: account?.branchId ?? "" } }) }, include: { movement: true, location: true }, orderBy: { createdAt: "desc" } }); return res.json({ items, page: 1, pageSize: items.length, total: items.length }); });
router.put("/policies/:id", requirePermission("manage_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const b = req.body as Record<string, unknown>; const min = Number(b.minimumQuantity); const reorder = Number(b.reorderQuantity); const expected = typeof b.expectedUpdatedAt === "string" ? new Date(b.expectedUpdatedAt) : null; if (!expected || Number.isNaN(expected.getTime()) || !Number.isFinite(min) || !Number.isFinite(reorder) || min < 0 || reorder < min) return res.status(400).json({ error: "Valid policy quantities and expectedUpdatedAt are required.", code: "INVALID_STOCK_POLICY" }); const current = await prisma.stockLevelPolicy.findUnique({ where: { id: req.params.id }, include: { location: true } }); if (!current) return res.status(404).json({ error: "Policy not found." }); const scope = await scopedLocation(req, current.locationId); if (!scope.allowed) return res.status(403).json({ error: "Policy is outside your scope." }); const saved = await prisma.stockLevelPolicy.updateMany({ where: { id: current.id, updatedAt: expected }, data: { minimumQuantity: min, reorderQuantity: reorder } }); if (saved.count !== 1) return res.status(409).json({ error: "Policy changed since it was loaded.", code: "STALE_WRITE" }); return res.json(await prisma.stockLevelPolicy.findUnique({ where: { id: current.id } })); });
router.get("/count-sessions/:id", requirePermission("view_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id }, include: { location: true, lines: true } }); if (!session) return res.status(404).json({ error: "Count session not found." }); const scope = await scopedLocation(req, session.locationId); if (!scope.allowed) return res.status(403).json({ error: "Count is outside your scope." }); return res.json(session); });
router.post("/count-sessions", requirePermission("manage_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const b = req.body as Record<string, unknown>; const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : ""; const bad = unknown(b, ["locationId"]); if (!key || bad.length || rejectSecret(b) || typeof b.locationId !== "string") return res.status(400).json({ error: "locationId and Idempotency-Key header are required.", code: "INVALID_STOCK_COUNT", fieldErrors: bad }); const scope = await scopedLocation(req, b.locationId); if (!scope.allowed) return res.status(403).json({ error: "Location is outside your scope." }); const existing = await prisma.stockCountSession.findUnique({ where: { idempotencyKey: key } }); if (existing) { if (existing.locationId !== b.locationId || existing.startedById !== req.user!.id) return res.status(409).json({ error: "Idempotency-Key was already used for different content.", code: "IDEMPOTENCY_KEY_REUSED" }); return res.json(existing); } const session = await prisma.stockCountSession.create({ data: { locationId: b.locationId, startedById: req.user!.id, idempotencyKey: key } }); return res.status(201).json(session); });
router.post("/count-sessions/:id/submit", requirePermission("manage_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id }, include: { location: true } }); if (!session) return res.status(404).json({ error: "Count session not found." }); const scope = await scopedLocation(req, session.locationId); if (!scope.allowed) return res.status(403).json({ error: "Count is outside your scope." }); if (session.startedById !== req.user!.id && !req.isSuperAdmin) return res.status(403).json({ error: "Only the count owner can submit." }); const updated = await prisma.stockCountSession.updateMany({ where: { id: session.id, status: "draft", expectedUpdatedAt: session.expectedUpdatedAt }, data: { status: "submitted", submittedAt: new Date() } }); if (updated.count !== 1) return res.status(409).json({ error: "Count changed since it was loaded.", code: "STALE_WRITE" }); return res.json(await prisma.stockCountSession.findUnique({ where: { id: session.id } })); });
router.post("/count-sessions/:id/lines", requirePermission("manage_stock"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const b = req.body as Record<string, unknown>;
  const bad = unknown(b, ["stockItemId", "countedQuantity"]);
  if (bad.length || rejectSecret(b)) return res.status(400).json({ error: "Unknown or secret fields are not accepted.", code: "INVALID_COUNT_LINE", fieldErrors: bad });
  const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id }, include: { location: true } });
  if (!session) return res.status(404).json({ error: "Count session not found." });
  const scope = await scopedLocation(req, session.locationId);
  if (!scope.allowed || session.status !== "draft" || session.startedById !== req.user!.id) return res.status(403).json({ error: "Only the owner may edit a draft in scope." });
  const itemId = typeof b.stockItemId === "string" ? b.stockItemId : "";
  const counted = Number(b.countedQuantity);
  if (!itemId || !Number.isFinite(counted) || counted < 0) return res.status(400).json({ error: "stockItemId and nonnegative countedQuantity are required.", code: "INVALID_COUNT_LINE" });
  const existing = await prisma.stockCountLine.findUnique({ where: { sessionId_stockItemId: { sessionId: session.id, stockItemId: itemId } } });
  const expected = existing ? Number(existing.expectedQuantitySnapshot) : await balance(itemId, session.locationId);
  const line = await prisma.stockCountLine.upsert({ where: { sessionId_stockItemId: { sessionId: session.id, stockItemId: itemId } }, create: { sessionId: session.id, stockItemId: itemId, expectedQuantitySnapshot: expected, countedQuantity: counted, variance: counted - expected }, update: { countedQuantity: counted, variance: counted - expected } });
  return res.status(201).json(line);
});
router.post("/count-sessions/:id/approve", requirePermission("approve_stock_adjustments"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id }, include: { location: true, lines: true } });
  if (!session) return res.status(404).json({ error: "Count session not found." });
  const expected = typeof req.body?.expectedUpdatedAt === "string" ? new Date(req.body.expectedUpdatedAt) : null;
  const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!expected || Number.isNaN(expected.getTime()) || !key || !reason) return res.status(400).json({ error: "expectedUpdatedAt, nonblank reason, and Idempotency-Key header are required.", code: "COUNT_APPROVAL_PRECONDITION" });
  if (session.approvalIdempotencyKey === key) {
    const same = session.approvedById === req.user!.id && session.approvalReason === reason && session.approvalExpectedUpdatedAt?.getTime() === expected.getTime();
    if (!same) return res.status(409).json({ error: "Idempotency-Key was already used for different content.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.json(session);
  }
  if (session.status !== "submitted") return res.status(409).json({ error: "Only submitted counts can be approved.", code: "INVALID_COUNT_STATE" });
  if (session.startedById === req.user!.id && !req.isSuperAdmin) return res.status(403).json({ error: "Count submitter cannot approve their own variance." });
  if (expected.getTime() !== session.expectedUpdatedAt.getTime()) return res.status(409).json({ error: "Count changed since it was loaded.", code: "STALE_WRITE" });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.stockCountSession.findUnique({ where: { approvalIdempotencyKey: key } });
      if (replay && replay.id !== session.id) throw new Error("IDEMPOTENCY_KEY_REUSED");
      if (replay) return replay;
      const updated = await tx.stockCountSession.updateMany({ where: { id: session.id, status: "submitted", expectedUpdatedAt: expected }, data: { status: "approved", approvedById: req.user!.id, approvedAt: new Date(), approvalIdempotencyKey: key, approvalReason: reason, approvalExpectedUpdatedAt: expected } });
      if (updated.count !== 1) throw new Error("STALE_WRITE");
      for (const line of session.lines) {
        if (Number(line.variance) === 0) continue;
        const quantity = Math.abs(Number(line.variance));
        const movement = await tx.stockMovement.create({ data: { stockItemId: line.stockItemId, movementType: "count_correction", quantity, reason, idempotencyKey: `count:${session.id}:${line.id}`, requestFingerprint: JSON.stringify({ source: "count_approval", sessionId: session.id, lineId: line.id, quantity, reason }), performedById: session.startedById, approvedById: req.user!.id, approvedAt: new Date() } });
        await tx.stockLedgerEntry.create({ data: { movementId: movement.id, locationId: session.locationId, quantityDelta: Number(line.variance) } });
      }
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "stock_count_approved", entity: "StockCountSession", entityId: session.id, metadata: { source: "stock_manual", locationId: session.locationId, lineCount: session.lines.length, idempotencyKey: key } } });
      return tx.stockCountSession.findUniqueOrThrow({ where: { id: session.id } });
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    broadcastChange({ entity: "StockCountSession", action: "stock_count_approved", entityId: session.id, branchId: session.location.branchId });
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_WRITE") return res.status(409).json({ error: "Count changed since it was loaded.", code: "STALE_WRITE" });
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") return res.status(409).json({ error: "Idempotency-Key was already used for another count approval.", code: "IDEMPOTENCY_KEY_REUSED" });
    return res.status(409).json({ error: "Count approval conflict.", code: "COUNT_APPROVAL_CONFLICT" });
  }
});
router.post("/movements/transfer", requirePermission("manage_stock"), async (req: AuthRequest, res) => {
  if (!(await enabled())) return gate(res);
  const b = req.body as Record<string, unknown>;
  const stockItemId = typeof b.stockItemId === "string" ? b.stockItemId : "";
  const sourceLocationId = typeof b.sourceLocationId === "string" ? b.sourceLocationId : "";
  const destinationLocationId = typeof b.destinationLocationId === "string" ? b.destinationLocationId : "";
  const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  const quantity = Number(b.quantity);
  const bad = unknown(b, ["stockItemId", "sourceLocationId", "destinationLocationId", "quantity", "reason"]);
  if (bad.length || rejectSecret(b) || !stockItemId || !sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId || !key || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: "Distinct locations, positive quantity, and Idempotency-Key header are required.", code: "INVALID_TRANSFER", fieldErrors: bad });
  const source = await scopedLocation(req, sourceLocationId); const destination = await scopedLocation(req, destinationLocationId);
  if (!source.allowed || !destination.allowed) return res.status(403).json({ error: "Both locations must be active and in your branch scope.", code: "STOCK_LOCATION_FORBIDDEN" });
  const reason = typeof b.reason === "string" ? b.reason.trim() : null;
  const requestFingerprint = JSON.stringify({ stockItemId, sourceLocationId, destinationLocationId, quantity, reason });
  const prior = await prisma.stockMovement.findUnique({ where: { idempotencyKey: key } }); if (prior) { if (prior.requestFingerprint !== requestFingerprint) return res.status(409).json({ error: "Idempotency-Key was already used for different content.", code: "IDEMPOTENCY_KEY_REUSED" }); return res.json(prior); }
  try {
    const movement = await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId }, select: { active: true, archivedAt: true } });
      if (!item || !item.active || item.archivedAt) throw new Error("STOCK_ITEM_ARCHIVED");
      const rows = await tx.stockLedgerEntry.findMany({ where: { movement: { stockItemId }, locationId: sourceLocationId }, select: { quantityDelta: true } });
      const available = rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0); if (available < quantity) throw new Error("NEGATIVE_STOCK");
      const created = await tx.stockMovement.create({ data: { stockItemId, movementType: "transfer", quantity, idempotencyKey: key, requestFingerprint, performedById: req.user!.id, reason } });
      await tx.stockLedgerEntry.createMany({ data: [{ movementId: created.id, locationId: sourceLocationId, quantityDelta: -quantity }, { movementId: created.id, locationId: destinationLocationId, quantityDelta: quantity }] });
      await tx.activityLog.create({ data: { userId: req.user!.id, action: "stock_transfer_created", entity: "StockMovement", entityId: created.id, metadata: { source: "stock_manual", sourceLocationId, destinationLocationId, quantity } } }); return created;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    broadcastChange({ entity: "StockMovement", action: "stock_transfer_created", entityId: movement.id, branchId: source.location?.branchId ?? null });
    if (destination.location?.branchId && destination.location.branchId !== source.location?.branchId) {
      broadcastChange({ entity: "StockMovement", action: "stock_transfer_created", entityId: movement.id, branchId: destination.location.branchId });
    }
    return res.status(201).json({ movement, sourceBalance: await balance(stockItemId, sourceLocationId), destinationBalance: await balance(stockItemId, destinationLocationId) });
  } catch (error) { if (error instanceof Error && error.message === "NEGATIVE_STOCK") return res.status(409).json({ error: "Transfer would create negative stock.", code: "NEGATIVE_STOCK" }); if (error instanceof Error && error.message === "STOCK_ITEM_ARCHIVED") return res.status(409).json({ error: "Stock item is missing or archived.", code: "STOCK_ITEM_ARCHIVED" }); return res.status(409).json({ error: "Transfer conflict.", code: "STOCK_TRANSFER_CONFLICT" }); }
});
router.get("/branches/:branchId/summary", requirePermission("view_stock"), async (req: AuthRequest, res) => { if (!(await enabled())) return gate(res); const locations = await prisma.stockLocation.findMany({ where: { branchId: req.params.branchId, archivedAt: null } }); const items = await prisma.stockItem.findMany({ where: { active: true } }); const locationIds = locations.map((location) => location.id); const balances = await Promise.all(items.map(async (item) => { const rows = await prisma.stockLedgerEntry.findMany({ where: { movement: { stockItemId: item.id }, locationId: { in: locationIds } }, select: { quantityDelta: true } }); return { id: item.id, sku: item.sku, name: item.name, balance: rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0) }; })); return res.json({ branchId: req.params.branchId, locations, items: balances }); });
export default router;
export { rejectSecret, unknown, enabled, gate };
