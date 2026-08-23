import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "admin",
  branchId: "branch-a",
  feature: null as null | { id: string; key: string; enabledGlobally: boolean; status: "disabled" | "staged" | "pilot" | "enabled" | "paused"; minimumRole: string | null; configVersion: number; updatedAt: Date; createdAt: Date },
  override: null as null | { id: string; featureKey: string; branchId: string; enabled: boolean; reason: string | null; updatedAt: Date; createdAt: Date },
  audit: [] as Array<Record<string, unknown>>,
}));

const fakePrisma = vi.hoisted(() => {
  const tx = {
    featureRollout: {
      findUnique: vi.fn(async () => state.feature),
      findUniqueOrThrow: vi.fn(async () => { if (!state.feature) throw new Error("missing feature"); return state.feature; }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.feature = { id: "feature-1", key: data.key as string, enabledGlobally: data.enabledGlobally as boolean, status: data.status as "disabled" | "staged" | "pilot" | "enabled" | "paused", minimumRole: (data.minimumRole as string | null | undefined) ?? null, configVersion: 1, updatedAt: new Date("2026-08-24T00:00:01.000Z"), createdAt: new Date("2026-08-24T00:00:01.000Z") };
        return state.feature;
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.feature) return { count: 0 };
        state.feature = { ...state.feature, enabledGlobally: data.enabledGlobally as boolean, status: data.status as typeof state.feature.status, minimumRole: data.minimumRole as string | null, configVersion: state.feature.configVersion + 1, updatedAt: new Date("2026-08-24T00:00:02.000Z") };
        return { count: 1 };
      }),
    },
    featureRolloutBranch: {
      findUnique: vi.fn(async () => state.override),
      findUniqueOrThrow: vi.fn(async () => { if (!state.override) throw new Error("missing override"); return state.override; }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.override = { id: "override-1", featureKey: data.featureKey as string, branchId: data.branchId as string, enabled: data.enabled as boolean, reason: (data.reason as string | undefined) ?? null, updatedAt: new Date("2026-08-24T00:00:03.000Z"), createdAt: new Date("2026-08-24T00:00:03.000Z") };
        return state.override;
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.override) return { count: 0 };
        state.override = { ...state.override, enabled: data.enabled as boolean, reason: data.reason as string | null, updatedAt: new Date("2026-08-24T00:00:04.000Z") };
        return { count: 1 };
      }),
    },
    branch: { findUnique: vi.fn(async () => ({ id: "branch-a", archivedAt: null })) },
    activityLog: { create: vi.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => { state.audit.push(data.metadata); return data; }) },
  };
  return { ...tx, $transaction: vi.fn(async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx)), systemUser: { findUnique: vi.fn(async () => ({ id: "user-1", branchId: state.branchId, role: { name: state.role } })) }, featureRollout: { ...tx.featureRollout, findMany: vi.fn(async () => state.feature ? [{ ...state.feature, branchOverrides: state.override ? [state.override] : [] }] : []) } };
});

vi.mock("../../lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => { (req as express.Request & { user?: unknown }).user = { id: "user-1" }; next(); },
  requireSuperAdmin: (_req: express.Request, res: express.Response, next: express.NextFunction) => state.role === "super_admin" ? next() : res.status(403).json({ error: "Only a Super Admin can perform this action." }),
}));

import operationsRoutes from "../operations";

async function request(method: string, path: string, body?: Record<string, unknown>) {
  const app = express(); app.use(express.json()); app.use("/api/operations", operationsRoutes);
  const server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: "Bearer test", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("Phase 7 authenticated route boundaries", () => {
  afterEach(() => { state.role = "admin"; state.branchId = "branch-a"; state.feature = null; state.override = null; state.audit.length = 0; delete process.env.FEATURE_NETWORK_V1; vi.clearAllMocks(); });

  it("rejects a non-super-admin selecting another branch", async () => {
    const result = await request("GET", "/api/operations/feature-flags?branchId=branch-b");
    expect(result.status).toBe(403);
  });

  it("covers Super Admin create, CAS update, branch override, effective read, and audit redaction", async () => {
    state.role = "super_admin";
    process.env.FEATURE_NETWORK_V1 = "true";
    const created = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "pilot", minimumRole: "admin", reason: "approved pilot" });
    expect(created.status).toBe(200);
    expect(created.body.updatedById).toBeUndefined();
    const createdVersion = created.body.updatedAt as string;
    const updated = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "enabled", enabledGlobally: true, expectedUpdatedAt: createdVersion, reason: "enabled after review" });
    expect(updated.status).toBe(200);
    const override = await request("PUT", "/api/operations/feature-flags/network.v1/branches/branch-a", { enabled: true, reason: "pilot branch" });
    expect(override.status).toBe(200);
    const flags = await request("GET", "/api/operations/feature-flags?branchId=branch-a");
    expect(flags.status).toBe(200);
    expect((flags.body[0] as Record<string, unknown>).effective).toBe(true);
    expect(state.audit).toHaveLength(3);
    expect(state.audit.flatMap((entry) => Object.keys(entry))).not.toContain("password");
    expect(state.audit.flatMap((entry) => Object.values(entry))).not.toContain(expect.stringContaining("postgresql://"));
  });

  it("returns 409 when a Super Admin retries with a stale feature version", async () => {
    state.role = "super_admin";
    const created = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "pilot" });
    const stale = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "enabled", expectedUpdatedAt: "2026-08-23T00:00:00.000Z" });
    expect(created.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_WRITE");
  });

  it("rejects secret-like reasons before persistence", async () => {
    state.role = "super_admin";
    const result = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "pilot", reason: "password=do-not-store" });
    expect(result.status).toBe(400);
    expect(state.feature).toBeNull();
    expect(state.audit).toHaveLength(0);
  });

  it("requires branch CAS, rejects stale branch updates, and records the accepted audit", async () => {
    state.role = "super_admin";
    const created = await request("PUT", "/api/operations/feature-flags/network.v1", { status: "enabled", enabledGlobally: true });
    expect(created.status).toBe(200);
    const firstOverride = await request("PUT", "/api/operations/feature-flags/network.v1/branches/branch-a", { enabled: true, reason: "initial branch enable" });
    expect(firstOverride.status).toBe(200);
    const missingVersion = await request("PUT", "/api/operations/feature-flags/network.v1/branches/branch-a", { enabled: false, reason: "missing version" });
    expect(missingVersion.status).toBe(400);
    const accepted = await request("PUT", "/api/operations/feature-flags/network.v1/branches/branch-a", { enabled: false, expectedUpdatedAt: firstOverride.body.updatedAt as string, reason: "branch paused for review" });
    expect(accepted.status).toBe(200);
    const stale = await request("PUT", "/api/operations/feature-flags/network.v1/branches/branch-a", { enabled: true, expectedUpdatedAt: firstOverride.body.updatedAt as string, reason: "stale retry" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_WRITE");
    expect(state.audit.at(-1)).toMatchObject({ key: "network.v1", branchId: "branch-a", enabled: false, reason: "branch paused for review" });
  });
});
