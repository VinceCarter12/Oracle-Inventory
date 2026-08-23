import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "admin" }));
const fakePrisma = vi.hoisted(() => ({
  systemUser: { findUnique: vi.fn(async () => ({ id: "user-1", role: { name: state.role } })) },
}));

vi.mock("../../lib/prisma", () => ({ prisma: fakePrisma }));

// This imports the production middleware; only its user lookup is mocked.
import { requireSuperAdmin } from "../../middleware/auth";

async function checkRole() {
  const app = express();
  app.get("/check", (req, _res, next) => { (req as express.Request & { user?: unknown }).user = { id: "user-1" }; next(); }, requireSuperAdmin, (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/check`);
    return response.status;
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("production Super Admin middleware", () => {
  afterEach(() => { state.role = "admin"; vi.clearAllMocks(); });
  it("denies Admin and accepts SuperAdmin from the database role", async () => {
    state.role = "admin";
    expect(await checkRole()).toBe(403);
    state.role = "super_admin";
    expect(await checkRole()).toBe(200);
    expect(fakePrisma.systemUser.findUnique).toHaveBeenCalledTimes(2);
  });
});
