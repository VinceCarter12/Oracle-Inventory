import { beforeEach, describe, expect, it } from "vitest";
import { effective, isIsoTimestamp, isStaleWrite, redact, safeKey } from "../operations";

describe("Phase 7 rollout safety", () => {
  beforeEach(() => { delete process.env.FEATURE_NETWORK_V1; });
  it("accepts only bounded lowercase feature keys", () => {
    expect(safeKey("network.v1")).toBe(true);
    expect(safeKey("FEATURE_DATABASE_URL")).toBe(false);
    expect(safeKey("bad key")).toBe(false);
  });
  it("requires canonical ISO timestamps and detects stale writes", () => {
    const stamp = "2026-08-22T12:00:00.000Z";
    expect(isIsoTimestamp(stamp)).toBe(true);
    expect(isIsoTimestamp("2026-08-22")).toBe(false);
    expect(isStaleWrite(new Date(stamp), stamp)).toBe(false);
    expect(isStaleWrite(new Date(stamp), undefined)).toBe(true);
  });
  it("redacts secret-like values recursively", () => {
    expect(redact({ reason: "postgresql://postgres:pw@db.example.com", password: "hidden", nested: { token: "hidden" } })).toEqual({ reason: "[REDACTED]", password: "[REDACTED]", nested: { token: "[REDACTED]" } });
  });
  it("fails closed when the feature env flag is absent", async () => {
    await expect(effective({ key: "network.v1", enabledGlobally: true, status: "enabled", minimumRole: null }, undefined, "super_admin")).resolves.toBe(false);
  });
  it("honors role minimum and does not allow a branch override through pause", async () => {
    process.env.FEATURE_NETWORK_V1 = "true";
    const feature = { key: "network.v1", enabledGlobally: false, status: "paused", minimumRole: "admin", branchOverrides: [{ branchId: "branch-1", enabled: true }] };
    await expect(effective(feature, "branch-1", "admin")).resolves.toBe(false);
    await expect(effective({ ...feature, status: "pilot" }, "branch-1", "staff")).resolves.toBe(false);
    await expect(effective({ ...feature, status: "pilot" }, "branch-1", "admin")).resolves.toBe(true);
  });
});
