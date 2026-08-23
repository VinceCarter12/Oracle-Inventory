import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "admin", permission: true, draft: { id: "draft-1", createdById: "user-1", status: "draft", branchId: "branch-a", updatedAt: new Date("2026-08-24T00:00:00.000Z"), data: { name: "Finance-01", branchId: "branch-a", computerName: "FIN-01" } } }));
const fakePrisma = vi.hoisted(() => ({
  systemUser: { findUnique: vi.fn(async () => ({ id: "user-1", branchId: "branch-a", role: { name: state.role } })) },
  featureRollout: { findUnique: vi.fn(async () => ({ key: "computer.manual-intake.v1", enabledGlobally: true, status: "enabled", minimumRole: "admin", branchOverrides: [] })) },
  computerIntakeDraft: { findFirst: vi.fn(async ({ where }: { where: { id?: string; createdById?: string } }) => where.id && where.id !== state.draft.id ? null : state.draft), updateMany: vi.fn(async () => ({ count: 0 })) },
  branch: { findUnique: vi.fn(async () => ({ id: "branch-a", archivedAt: null })) },
  asset: { findFirst: vi.fn(async () => null) },
  $transaction: vi.fn(async () => state.draft),
}));
vi.mock("../../lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("../operations", () => ({ effective: vi.fn(async () => true) }));
vi.mock("../../middleware/auth", () => ({ requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => { (req as express.Request & { user?: unknown }).user = { id: "user-1", name: "Admin", email: "admin@example.test" }; next(); }, requirePermission: () => (_req: express.Request, res: express.Response, next: express.NextFunction) => state.permission ? next() : res.status(403).json({ error: "Forbidden" }) }));
import computerIntakeRoutes from "../computer-intake";

async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const app = express(); app.use(express.json()); app.use("/api/computer-intake", computerIntakeRoutes);
  const server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address() as { port: number };
  try { const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: "Bearer test", "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> }; } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("authenticated Phase 1 computer intake boundaries", () => {
  afterEach(() => { state.role = "admin"; state.permission = true; delete process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1; vi.clearAllMocks(); });
  it("denies non-admin roles at the route boundary", async () => { process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1 = "true"; state.role = "staff"; expect((await request("GET", "/api/computer-intake/drafts")).status).toBe(403); });
  it("does not expose another user's draft (IDOR)", async () => { process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1 = "true"; expect((await request("GET", "/api/computer-intake/drafts/other-draft")).status).toBe(404); });
  it("requires the draft CAS version on update", async () => { process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1 = "true"; const result = await request("PUT", "/api/computer-intake/drafts/draft-1", { name: "Finance-02", branchId: "branch-a" }); expect(result.status).toBe(409); expect(result.body.code).toBe("STALE_WRITE"); });
  it("requires idempotency key before official submit", async () => { process.env.FEATURE_COMPUTER_MANUAL_INTAKE_V1 = "true"; const result = await request("POST", "/api/computer-intake/drafts/draft-1/submit", { expectedUpdatedAt: "2026-08-24T00:00:00.000Z" }); expect(result.status).toBe(400); expect(String(result.body.error)).toContain("Idempotency-Key"); });
  it("rejects personal/BYOD ownership in the input contract", async () => { const { validateIntake } = await import("../computer-intake"); expect(validateIntake({ name: "X", ownership: "personal" }).ownership).toBeTruthy(); });
});
