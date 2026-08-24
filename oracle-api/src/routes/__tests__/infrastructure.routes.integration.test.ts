import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const fakePrisma = vi.hoisted(() => ({
  systemUser: { findUnique: vi.fn(async (): Promise<{ id: string; branchId: string | null; role: { name: string } }> => ({ id: "user-1", branchId: "branch-a", role: { name: "admin" } })) },
}));

vi.mock("../../lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => { (req as express.Request & { user?: unknown }).user = { id: "user-1" }; next(); },
  requirePermission: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireSuperAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import infrastructureRoutes from "../infrastructure";

async function request(method: string, path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/api", infrastructureRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("Phase 5 infrastructure route boundaries", () => {
  afterEach(() => { delete process.env.SERVERS_FIREWALL_ISP_ENABLED; vi.clearAllMocks(); });

  it("fails closed at the route when the feature is disabled", async () => {
    const result = await request("GET", "/api/servers");
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("INFRASTRUCTURE_DISABLED");
  });

  it("rejects unexpected lifecycle fields before any mutation lookup", async () => {
    const result = await request("POST", "/api/isp-circuits/circuit-1/terminate", { expectedUpdatedAt: "2026-08-24T00:00:00.000Z", terminatedAt: "2026-08-25T00:00:00.000Z", password: "never-store" });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("INVALID_LIFECYCLE_FIELDS");
  });

  it("rejects malformed optimistic-lock timestamps at the route boundary", async () => {
    const result = await request("POST", "/api/servers/asset-1/roles/role-1/end", { expectedUpdatedAt: "not-a-date", validTo: "2026-08-25T00:00:00.000Z" });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("INVALID_LIFECYCLE_FIELDS");
  });

  it("denies a branchless non-super-admin at the live route boundary, not just the unit-tested helper", async () => {
    fakePrisma.systemUser.findUnique.mockResolvedValueOnce({ id: "user-1", branchId: null, role: { name: "admin" } });
    const result = await request("GET", "/api/servers");
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("A branch scope is required.");
  });
});
