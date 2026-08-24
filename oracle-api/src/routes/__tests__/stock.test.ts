import express from "express";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory fake data store ────────────────────────────────────────────────
// Mirrors the exact Prisma call shapes used by src/routes/stock.ts and
// src/routes/branches.ts's stock-summary route. This is intentionally not a
// generic query engine: each helper matches only the where/select/include
// shapes those two files actually issue.

type Role = "super_admin" | "admin";
interface FakeUser { id: string; branchId: string; role: Role; }
interface FakeItem { id: string; sku: string; name: string; category: string; unitOfMeasure: string; description: string | null; isSerialized: boolean; active: boolean; archivedAt: Date | null; idempotencyKey: string; requestFingerprint: string; createdAt: Date; updatedAt: Date; }
interface FakeLocation { id: string; branchId: string; name: string; locationType: string; description: string | null; archivedAt: Date | null; }
interface FakeMovement { id: string; stockItemId: string; movementType: string; quantity: number; reason: string | null; idempotencyKey: string; requestFingerprint: string; performedById: string; approvedById: string | null; approvedAt: Date | null; createdAt: Date; }
interface FakeLedgerEntry { id: string; movementId: string; locationId: string; quantityDelta: number; createdAt: Date; }
interface FakeCountSession { id: string; locationId: string; status: "draft" | "submitted" | "approved" | "rejected" | "cancelled"; startedById: string; submittedAt: Date | null; approvedById: string | null; approvedAt: Date | null; expectedUpdatedAt: Date; idempotencyKey: string; approvalIdempotencyKey: string | null; approvalReason: string | null; approvalExpectedUpdatedAt: Date | null; }
interface FakeCountLine { id: string; sessionId: string; stockItemId: string; expectedQuantitySnapshot: number; countedQuantity: number; variance: number; }
interface FakePolicy { id: string; stockItemId: string; locationId: string; minimumQuantity: number; reorderQuantity: number; updatedAt: Date; }

function makeStateHoisted() {
  return {
    tick: 1,
    users: new Map<string, FakeUser>(),
    feature: null as null | { key: string; enabledGlobally: boolean; status: string },
    items: [] as FakeItem[],
    locations: [] as FakeLocation[],
    movements: [] as FakeMovement[],
    ledger: [] as FakeLedgerEntry[],
    countSessions: [] as FakeCountSession[],
    countLines: [] as FakeCountLine[],
    policies: [] as FakePolicy[],
    activity: [] as Array<Record<string, unknown>>,
    lock: Promise.resolve() as Promise<unknown>,
  };
}

const state = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeStateHoisted> }));
state.current = makeStateHoisted();

let idCounter = 0;
function nextId(prefix: string) { idCounter += 1; return `${prefix}-${idCounter}`; }
function tickTime() { state.current.tick += 1; return new Date(2026 + 0, 0, 1, 0, 0, state.current.tick); }

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.current.lock.then(fn, fn) as Promise<T>;
  state.current.lock = run.catch(() => undefined);
  return run;
}

function ledgerMatches(entry: FakeLedgerEntry, where: Record<string, unknown>): boolean {
  if (where.locationId !== undefined) {
    const loc = where.locationId as unknown;
    if (typeof loc === "object" && loc !== null && "in" in (loc as Record<string, unknown>)) {
      const list = (loc as { in: string[] }).in;
      if (!list.includes(entry.locationId)) return false;
    } else if (entry.locationId !== loc) return false;
  }
  if (where.movement) {
    const mv = state.current.movements.find((m) => m.id === entry.movementId);
    if (!mv) return false;
    const mwhere = where.movement as Record<string, unknown>;
    if (mwhere.stockItemId !== undefined && mv.stockItemId !== mwhere.stockItemId) return false;
  }
  if (where.location) {
    const loc = state.current.locations.find((l) => l.id === entry.locationId);
    if (!loc) return false;
    const lwhere = where.location as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(lwhere, "archivedAt") && lwhere.archivedAt === null && loc.archivedAt) return false;
    if (lwhere.branchId !== undefined && loc.branchId !== lwhere.branchId) return false;
  }
  return true;
}

const fakePrisma = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
  featureRollout: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (state.current.feature?.key === where.key ? state.current.feature : null)),
  },
  systemUser: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = state.current.users.get(where.id);
      if (!u) return null;
      return { id: u.id, branchId: u.branchId, role: { name: u.role } };
    }),
  },
  stockItem: {
    findUnique: vi.fn(async ({ where, include }: { where: { id?: string; idempotencyKey?: string }; include?: { policies?: unknown } }) => {
      const found = where.id
        ? state.current.items.find((i) => i.id === where.id)
        : where.idempotencyKey
        ? state.current.items.find((i) => i.idempotencyKey === where.idempotencyKey)
        : undefined;
      if (!found) return null;
      if (include?.policies) {
        return { ...found, policies: state.current.policies.filter((p) => p.stockItemId === found.id).map((p) => ({ ...p, location: state.current.locations.find((l) => l.id === p.locationId) })) };
      }
      return found;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (state.current.items.some((i) => i.sku === data.sku)) throw new Error("Unique constraint failed on sku");
      const item: FakeItem = {
        id: nextId("item"), sku: data.sku as string, name: data.name as string, category: data.category as string,
        unitOfMeasure: data.unitOfMeasure as string, description: (data.description as string | null) ?? null,
        isSerialized: Boolean(data.isSerialized), active: true, archivedAt: null,
        idempotencyKey: data.idempotencyKey as string, requestFingerprint: data.requestFingerprint as string,
        createdAt: new Date(), updatedAt: new Date(),
      };
      state.current.items.push(item);
      return item;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      let rows = state.current.items.slice();
      if (where.active !== undefined) rows = rows.filter((i) => i.active === where.active);
      if (where.OR) {
        const or = where.OR as Array<Record<string, unknown>>;
        rows = rows.filter((i) => or.some((cond) => {
          const [field, matcher] = Object.entries(cond)[0] as [string, { contains: string }];
          const val = (i as unknown as Record<string, string>)[field] ?? "";
          return val.toLowerCase().includes(matcher.contains.toLowerCase());
        }));
      }
      return rows;
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      let rows = state.current.items.slice();
      if (where.active !== undefined) rows = rows.filter((i) => i.active === where.active);
      return rows.length;
    }),
  },
  stockLocation: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.current.locations.find((l) => l.id === where.id) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const loc: FakeLocation = { id: nextId("loc"), branchId: data.branchId as string, name: data.name as string, locationType: data.locationType as string, description: (data.description as string | null) ?? null, archivedAt: null };
      state.current.locations.push(loc);
      return loc;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      let rows = state.current.locations.slice();
      if (where.branchId !== undefined) rows = rows.filter((l) => l.branchId === where.branchId);
      if (Object.prototype.hasOwnProperty.call(where, "archivedAt") && where.archivedAt === null) rows = rows.filter((l) => !l.archivedAt);
      return rows;
    }),
  },
  stockMovement: {
    findUnique: vi.fn(async ({ where }: { where: { idempotencyKey?: string } }) => {
      const mv = state.current.movements.find((m) => m.idempotencyKey === where.idempotencyKey);
      if (!mv) return null;
      return { ...mv, entries: state.current.ledger.filter((e) => e.movementId === mv.id) };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const mv: FakeMovement = {
        id: nextId("mv"), stockItemId: data.stockItemId as string, movementType: data.movementType as string,
        quantity: data.quantity as number, reason: (data.reason as string | null) ?? null,
        idempotencyKey: data.idempotencyKey as string, requestFingerprint: data.requestFingerprint as string,
        performedById: data.performedById as string, approvedById: (data.approvedById as string | null) ?? null,
        approvedAt: (data.approvedAt as Date | null) ?? null, createdAt: new Date(),
      };
      state.current.movements.push(mv);
      return mv;
    }),
  },
  stockLedgerEntry: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.current.ledger.filter((e) => ledgerMatches(e, where))),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.current.ledger.find((e) => ledgerMatches(e, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const entry: FakeLedgerEntry = { id: nextId("led"), movementId: data.movementId as string, locationId: data.locationId as string, quantityDelta: data.quantityDelta as number, createdAt: new Date() };
      state.current.ledger.push(entry);
      return entry;
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const d of data) state.current.ledger.push({ id: nextId("led"), movementId: d.movementId as string, locationId: d.locationId as string, quantityDelta: d.quantityDelta as number, createdAt: new Date() });
      return { count: data.length };
    }),
  },
  stockLevelPolicy: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const p = state.current.policies.find((x) => x.id === where.id);
      if (!p) return null;
      return { ...p, location: state.current.locations.find((l) => l.id === p.locationId) };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
      const p = state.current.policies.find((x) => x.id === where.id);
      if (!p || p.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      p.minimumQuantity = data.minimumQuantity as number;
      p.reorderQuantity = data.reorderQuantity as number;
      p.updatedAt = tickTime();
      return { count: 1 };
    }),
  },
  stockCountSession: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string; approvalIdempotencyKey?: string } }) => {
      const s = where.id
        ? state.current.countSessions.find((x) => x.id === where.id)
        : where.idempotencyKey
        ? state.current.countSessions.find((x) => x.idempotencyKey === where.idempotencyKey)
        : where.approvalIdempotencyKey
        ? state.current.countSessions.find((x) => x.approvalIdempotencyKey === where.approvalIdempotencyKey)
        : undefined;
      if (!s) return null;
      return { ...s, location: state.current.locations.find((l) => l.id === s.locationId), lines: state.current.countLines.filter((l) => l.sessionId === s.id) };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const s = state.current.countSessions.find((x) => x.id === where.id);
      if (!s) throw new Error("missing session");
      return s;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const s: FakeCountSession = {
        id: nextId("count"), locationId: data.locationId as string, status: "draft", startedById: data.startedById as string,
        submittedAt: null, approvedById: null, approvedAt: null, expectedUpdatedAt: tickTime(),
        idempotencyKey: data.idempotencyKey as string, approvalIdempotencyKey: null, approvalReason: null, approvalExpectedUpdatedAt: null,
      };
      state.current.countSessions.push(s);
      return s;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const s = state.current.countSessions.find((x) => x.id === where.id);
      if (!s) return { count: 0 };
      if (where.status !== undefined && s.status !== where.status) return { count: 0 };
      const expected = where.expectedUpdatedAt as Date | undefined;
      if (expected && s.expectedUpdatedAt.getTime() !== expected.getTime()) return { count: 0 };
      Object.assign(s, data);
      s.expectedUpdatedAt = tickTime();
      return { count: 1 };
    }),
  },
  stockCountLine: {
    findUnique: vi.fn(async ({ where }: { where: { sessionId_stockItemId: { sessionId: string; stockItemId: string } } }) => {
      const key = where.sessionId_stockItemId;
      return state.current.countLines.find((l) => l.sessionId === key.sessionId && l.stockItemId === key.stockItemId) ?? null;
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: { sessionId_stockItemId: { sessionId: string; stockItemId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.sessionId_stockItemId;
      const existing = state.current.countLines.find((l) => l.sessionId === key.sessionId && l.stockItemId === key.stockItemId);
      if (existing) { Object.assign(existing, update); return existing; }
      const line: FakeCountLine = { id: nextId("line"), sessionId: create.sessionId as string, stockItemId: create.stockItemId as string, expectedQuantitySnapshot: create.expectedQuantitySnapshot as number, countedQuantity: create.countedQuantity as number, variance: create.variance as number };
      state.current.countLines.push(line);
      return line;
    }),
  },
  activityLog: { create: vi.fn(async ({ data }: { data: { metadata: Record<string, unknown> } & Record<string, unknown> }) => { state.current.activity.push(data); return data; }) },
  };
  db.$transaction = vi.fn(async (arg: unknown) => withLock(async () => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: typeof db) => Promise<unknown>)(db);
  }));
  return db;
});

vi.mock("../../lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    (req as express.Request & { user?: unknown }).user = { id: header.slice(7), email: "t@t.com", name: "t" };
    next();
  },
  requirePermission: (_key: string) => (req: express.Request & { isSuperAdmin?: boolean; user?: { id: string } }, _res: express.Response, next: express.NextFunction) => {
    const u = req.user ? state.current.users.get(req.user.id) : undefined;
    req.isSuperAdmin = u?.role === "super_admin";
    next();
  },
}));

import stockRoutes from "../stock";
import branchesRoutes from "../branches";

async function request(app: express.Express, method: string, path: string, opts: { body?: Record<string, unknown>; user?: string; idempotencyKey?: string } = {}) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const headers: Record<string, string> = {};
    if (opts.user) headers.Authorization = `Bearer ${opts.user}`;
    if (opts.body) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function stockApp() { const app = express(); app.use(express.json()); app.use("/api/stock", stockRoutes); return app; }
function branchesApp() { const app = express(); app.use(express.json()); app.use("/api/branches", branchesRoutes); return app; }

function seedUser(id: string, branchId: string, role: Role = "admin") { state.current.users.set(id, { id, branchId, role }); }
function seedLocation(branchId: string): FakeLocation { const loc: FakeLocation = { id: nextId("loc"), branchId, name: "Loc " + branchId, locationType: "room", description: null, archivedAt: null }; state.current.locations.push(loc); return loc; }
function seedItem(sku: string): FakeItem { const item: FakeItem = { id: nextId("item"), sku, name: sku, category: "cables", unitOfMeasure: "pcs", description: null, isSerialized: false, active: true, archivedAt: null, idempotencyKey: nextId("ik"), requestFingerprint: "seed", createdAt: new Date(), updatedAt: new Date() }; state.current.items.push(item); return item; }

beforeEach(() => {
  state.current = makeStateHoisted();
  process.env.STOCK_TOOLS_ENABLED = "true";
  state.current.feature = { key: "stock.tools.v1", enabledGlobally: true, status: "enabled" };
});
afterEach(() => { delete process.env.STOCK_TOOLS_ENABLED; vi.clearAllMocks(); });

describe("fail-closed gate", () => {
  it("returns 503 STOCK_DISABLED when env var is unset even with an enabled FeatureRollout row", async () => {
    delete process.env.STOCK_TOOLS_ENABLED;
    seedUser("u1", "branch-a");
    const res = await request(stockApp(), "GET", "/api/stock/items", { user: "u1" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("STOCK_DISABLED");
  });
  it("returns 503 STOCK_DISABLED when the FeatureRollout row is missing even with env var set", async () => {
    state.current.feature = null;
    seedUser("u1", "branch-a");
    const res = await request(stockApp(), "GET", "/api/stock/items", { user: "u1" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("STOCK_DISABLED");
  });
  it("gates the new branch stock-summary route the same way", async () => {
    delete process.env.STOCK_TOOLS_ENABLED;
    seedUser("u1", "branch-a");
    const res = await request(branchesApp(), "GET", "/api/branches/branch-a/stock-summary", { user: "u1" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("STOCK_DISABLED");
  });
});

describe("branch isolation", () => {
  it("blocks a branch-scoped user from writing a movement at a location in another branch", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-A");
    const otherLoc = seedLocation("branch-b");
    const res = await request(stockApp(), "POST", "/api/stock/movements", {
      user: "u1", idempotencyKey: "k1",
      body: { stockItemId: item.id, movementType: "receive", quantity: 5, locationId: otherLoc.id },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STOCK_LOCATION_FORBIDDEN");
  });
  it("blocks reading another branch's movement history", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-A");
    const otherLoc = seedLocation("branch-b");
    state.current.movements.push({ id: "mv-seed", stockItemId: item.id, movementType: "receive", quantity: 3, reason: null, idempotencyKey: "seed-ik", requestFingerprint: "x", performedById: "u1", approvedById: null, approvedAt: null, createdAt: new Date() });
    state.current.ledger.push({ id: "led-seed", movementId: "mv-seed", locationId: otherLoc.id, quantityDelta: 3, createdAt: new Date() });
    const res = await request(stockApp(), "GET", `/api/stock/items/${item.id}/movements`, { user: "u1" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STOCK_HISTORY_FORBIDDEN");
  });
  it("blocks a branch-scoped user from reading another branch's stock-summary via the new canonical route", async () => {
    seedUser("u1", "branch-a");
    const res = await request(branchesApp(), "GET", "/api/branches/branch-b/stock-summary", { user: "u1" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STOCK_BRANCH_FORBIDDEN");
  });
  it("allows a super_admin to read any branch's stock-summary via the new canonical route", async () => {
    seedUser("root", "branch-a", "super_admin");
    const loc = seedLocation("branch-b");
    const item = seedItem("SKU-B");
    state.current.movements.push({ id: "mv-b", stockItemId: item.id, movementType: "receive", quantity: 4, reason: null, idempotencyKey: "ik-b", requestFingerprint: "x", performedById: "root", approvedById: null, approvedAt: null, createdAt: new Date() });
    state.current.ledger.push({ id: "led-b", movementId: "mv-b", locationId: loc.id, quantityDelta: 4, createdAt: new Date() });
    const res = await request(branchesApp(), "GET", "/api/branches/branch-b/stock-summary", { user: "root" });
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe("branch-b");
    expect((res.body.items as Array<{ id: string; balance: number }>).find((i) => i.id === item.id)?.balance).toBe(4);
  });
});

describe("idempotency", () => {
  it("replays the same result for a repeated movement with the same key and body", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-C");
    const loc = seedLocation("branch-a");
    const body = { stockItemId: item.id, movementType: "receive", quantity: 10, locationId: loc.id };
    const first = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "same-key", body });
    const second = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "same-key", body });
    // POST /movements always answers 201 (create-or-replay); the invariant under test is that a
    // replay returns the *same* movement and never appends a second ledger entry.
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.movement.id).toBe(first.body.movement.id);
    expect(state.current.ledger.length).toBe(1);
  });
  it("rejects a reused movement key with different content as 409 IDEMPOTENCY_KEY_REUSED", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-D");
    const loc = seedLocation("branch-a");
    const first = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "dup-key", body: { stockItemId: item.id, movementType: "receive", quantity: 10, locationId: loc.id } });
    const second = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "dup-key", body: { stockItemId: item.id, movementType: "receive", quantity: 99, locationId: loc.id } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
  it("replays the same draft count session for a repeated create with the same key", async () => {
    seedUser("u1", "branch-a");
    const loc = seedLocation("branch-a");
    const first = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "u1", idempotencyKey: "count-key", body: { locationId: loc.id } });
    const second = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "u1", idempotencyKey: "count-key", body: { locationId: loc.id } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(state.current.countSessions.length).toBe(1);
  });
  it("rejects a reused count-session key started by a different user as 409 IDEMPOTENCY_KEY_REUSED", async () => {
    seedUser("u1", "branch-a");
    seedUser("u2", "branch-a");
    const loc = seedLocation("branch-a");
    const first = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "u1", idempotencyKey: "shared-key", body: { locationId: loc.id } });
    const second = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "u2", idempotencyKey: "shared-key", body: { locationId: loc.id } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("concurrent issue prevents negative stock", () => {
  it("allows exactly one of two concurrent over-committing issues to succeed", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-E");
    const loc = seedLocation("branch-a");
    // Seed a balance of 5 via a direct receive.
    const seedRes = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "seed-receive", body: { stockItemId: item.id, movementType: "receive", quantity: 5, locationId: loc.id } });
    expect(seedRes.status).toBe(201);

    const app = stockApp();
    const [a, b] = await Promise.all([
      request(app, "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "issue-a", body: { stockItemId: item.id, movementType: "issue", quantity: 3, locationId: loc.id } }),
      request(app, "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "issue-b", body: { stockItemId: item.id, movementType: "issue", quantity: 3, locationId: loc.id } }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expect(failed.body.code).toBe("NEGATIVE_STOCK");

    const remaining = state.current.ledger.filter((e) => e.locationId === loc.id).reduce((sum, e) => sum + e.quantityDelta, 0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBe(2);
  });
});

describe("ledger double-entry invariant", () => {
  it("produces exactly two ledger entries netting to zero for a transfer", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-F");
    const source = seedLocation("branch-a");
    const destination = seedLocation("branch-a");
    await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "seed-f", body: { stockItemId: item.id, movementType: "receive", quantity: 10, locationId: source.id } });
    const transfer = await request(stockApp(), "POST", "/api/stock/movements/transfer", { user: "u1", idempotencyKey: "transfer-f", body: { stockItemId: item.id, sourceLocationId: source.id, destinationLocationId: destination.id, quantity: 4 } });
    expect(transfer.status).toBe(201);
    const entries = state.current.ledger.filter((e) => e.movementId === transfer.body.movement.id);
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, e) => sum + e.quantityDelta, 0)).toBe(0);
    expect(entries.map((e) => e.quantityDelta).sort((x, y) => x - y)).toEqual([-4, 4]);
  });
  it("produces exactly one ledger entry for a single-sided receive", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-G");
    const loc = seedLocation("branch-a");
    const receive = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "receive-g", body: { stockItemId: item.id, movementType: "receive", quantity: 6, locationId: loc.id } });
    expect(receive.status).toBe(201);
    const entries = state.current.ledger.filter((e) => e.movementId === receive.body.movement.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].quantityDelta).toBe(6);
  });
  it("produces exactly one ledger entry for a single-sided issue", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-H");
    const loc = seedLocation("branch-a");
    await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "receive-h", body: { stockItemId: item.id, movementType: "receive", quantity: 6, locationId: loc.id } });
    const issue = await request(stockApp(), "POST", "/api/stock/movements", { user: "u1", idempotencyKey: "issue-h", body: { stockItemId: item.id, movementType: "issue", quantity: 2, locationId: loc.id } });
    expect(issue.status).toBe(201);
    const entries = state.current.ledger.filter((e) => e.movementId === issue.body.movement.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].quantityDelta).toBe(-2);
  });
});

describe("count segregation", () => {
  it("prevents the submitter from approving their own count and allows another approver", async () => {
    seedUser("submitter", "branch-a");
    seedUser("approver", "branch-a");
    const item = seedItem("SKU-I");
    const loc = seedLocation("branch-a");
    await request(stockApp(), "POST", "/api/stock/movements", { user: "submitter", idempotencyKey: "opening-i", body: { stockItemId: item.id, movementType: "receive", quantity: 10, locationId: loc.id } });

    const session = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "submitter", idempotencyKey: "session-i", body: { locationId: loc.id } });
    expect(session.status).toBe(201);
    const sessionId = session.body.id as string;

    const line = await request(stockApp(), "POST", `/api/stock/count-sessions/${sessionId}/lines`, { user: "submitter", body: { stockItemId: item.id, countedQuantity: 7 } });
    expect(line.status).toBe(201);
    expect(line.body.variance).toBe(-3);

    const submitted = await request(stockApp(), "POST", `/api/stock/count-sessions/${sessionId}/submit`, { user: "submitter", body: { expectedUpdatedAt: state.current.countSessions.find((s) => s.id === sessionId)!.expectedUpdatedAt.toISOString() } });
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe("submitted");

    const currentExpected = state.current.countSessions.find((s) => s.id === sessionId)!.expectedUpdatedAt.toISOString();
    const selfApprove = await request(stockApp(), "POST", `/api/stock/count-sessions/${sessionId}/approve`, { user: "submitter", idempotencyKey: "approve-self", body: { expectedUpdatedAt: currentExpected, reason: "self review" } });
    expect(selfApprove.status).toBe(403);
    expect(state.current.countSessions.find((s) => s.id === sessionId)!.status).toBe("submitted");

    const approved = await request(stockApp(), "POST", `/api/stock/count-sessions/${sessionId}/approve`, { user: "approver", idempotencyKey: "approve-other", body: { expectedUpdatedAt: currentExpected, reason: "reviewed variance" } });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");

    const correction = state.current.movements.find((m) => m.movementType === "count_correction" && m.stockItemId === item.id);
    expect(correction).toBeTruthy();
    const correctionEntry = state.current.ledger.find((e) => e.movementId === correction!.id);
    expect(correctionEntry?.quantityDelta).toBe(-3);
  });
});

describe("balance recomputation from the ledger", () => {
  it("derives an item's balance purely by summing StockLedgerEntry rows for its scope, with no separate mutable balance column", async () => {
    seedUser("u1", "branch-a", "super_admin");
    const item = seedItem("SKU-J");
    const loc = seedLocation("branch-a");
    // Insert ledger rows directly (bypassing the movement-creation endpoints entirely).
    const mv1: FakeMovement = { id: "mv-direct-1", stockItemId: item.id, movementType: "receive", quantity: 8, reason: null, idempotencyKey: "direct-1", requestFingerprint: "x", performedById: "u1", approvedById: null, approvedAt: null, createdAt: new Date() };
    const mv2: FakeMovement = { id: "mv-direct-2", stockItemId: item.id, movementType: "issue", quantity: 3, reason: null, idempotencyKey: "direct-2", requestFingerprint: "x", performedById: "u1", approvedById: null, approvedAt: null, createdAt: new Date() };
    state.current.movements.push(mv1, mv2);
    state.current.ledger.push({ id: "led-direct-1", movementId: mv1.id, locationId: loc.id, quantityDelta: 8, createdAt: new Date() });
    state.current.ledger.push({ id: "led-direct-2", movementId: mv2.id, locationId: loc.id, quantityDelta: -3, createdAt: new Date() });

    const expectedBalance = 5;
    const list = await request(stockApp(), "GET", `/api/stock/items?q=${item.sku}`, { user: "u1" });
    expect(list.status).toBe(200);
    const found = (list.body.items as Array<{ id: string; balance: number }>).find((i) => i.id === item.id);
    expect(found?.balance).toBe(expectedBalance);

    const movementsView = await request(stockApp(), "GET", `/api/stock/items/${item.id}/movements`, { user: "u1" });
    expect(movementsView.status).toBe(200);
    const summed = (movementsView.body.items as Array<{ quantityDelta: number }>).reduce((sum, e) => sum + Number(e.quantityDelta), 0);
    expect(summed).toBe(expectedBalance);
  });
});

describe("supporting read endpoints used by the new frontend pages", () => {
  it("returns a single stock item with its policies for the item detail page", async () => {
    seedUser("u1", "branch-a");
    const item = seedItem("SKU-K");
    const loc = seedLocation("branch-a");
    state.current.policies.push({ id: "pol-1", stockItemId: item.id, locationId: loc.id, minimumQuantity: 2, reorderQuantity: 5, updatedAt: new Date() });
    const res = await request(stockApp(), "GET", `/api/stock/items/${item.id}`, { user: "u1" });
    expect(res.status).toBe(200);
    expect(res.body.sku).toBe("SKU-K");
    expect(res.body.policies).toHaveLength(1);
  });
  it("returns 404 for a missing stock item", async () => {
    seedUser("u1", "branch-a");
    const res = await request(stockApp(), "GET", "/api/stock/items/does-not-exist", { user: "u1" });
    expect(res.status).toBe(404);
  });
  it("scopes GET /locations to the caller's branch and blocks a foreign branchId query", async () => {
    seedUser("u1", "branch-a");
    seedLocation("branch-a");
    seedLocation("branch-b");
    const own = await request(stockApp(), "GET", "/api/stock/locations", { user: "u1" });
    expect(own.status).toBe(200);
    expect((own.body.items as Array<{ branchId: string }>).every((l) => l.branchId === "branch-a")).toBe(true);
    const forbidden = await request(stockApp(), "GET", "/api/stock/locations?branchId=branch-b", { user: "u1" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("STOCK_BRANCH_FORBIDDEN");
  });
  it("loads a draft count session with its lines through the new GET /count-sessions/:id route, scoped by branch", async () => {
    seedUser("owner", "branch-a");
    seedUser("outsider", "branch-b");
    const item = seedItem("SKU-L");
    const loc = seedLocation("branch-a");
    const created = await request(stockApp(), "POST", "/api/stock/count-sessions", { user: "owner", idempotencyKey: "count-l", body: { locationId: loc.id } });
    expect(created.status).toBe(201);
    await request(stockApp(), "POST", `/api/stock/count-sessions/${created.body.id}/lines`, { user: "owner", body: { stockItemId: item.id, countedQuantity: 4 } });

    const fetched = await request(stockApp(), "GET", `/api/stock/count-sessions/${created.body.id}`, { user: "owner" });
    expect(fetched.status).toBe(200);
    expect(fetched.body.status).toBe("draft");
    expect(fetched.body.lines).toHaveLength(1);

    const blocked = await request(stockApp(), "GET", `/api/stock/count-sessions/${created.body.id}`, { user: "outsider" });
    expect(blocked.status).toBe(403);
  });
});
