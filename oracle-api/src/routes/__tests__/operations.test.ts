import { describe, expect, it } from "vitest";
import { isStaleWrite, redact, safeKey } from "../operations";

describe("Phase 7 rollout safety helpers", () => {
  it("accepts bounded feature keys only", () => {
    expect(safeKey("network.v1")).toBe(true);
    expect(safeKey("FEATURE_DATABASE_URL")).toBe(false);
    expect(safeKey("bad key")).toBe(false);
  });
  it("uses the branch row version and allows first-create semantics", () => {
    const updatedAt = new Date("2026-08-22T12:00:00.000Z");
    expect(isStaleWrite(undefined, undefined)).toBe(false);
    expect(isStaleWrite(updatedAt, updatedAt.toISOString())).toBe(false);
    expect(isStaleWrite(updatedAt, new Date("2026-08-22T12:01:00.000Z").toISOString())).toBe(true);
    expect(isStaleWrite(updatedAt, undefined)).toBe(true);
  });
  it("redacts secret-like values and keys recursively", () => {
    expect(redact({ featureKey: "network.v1", reason: "postgresql://postgres:pw@db.example.com", password: "hidden", nested: { token: "hidden", url: "https://user:pw@provider.example" } })).toEqual({ featureKey: "network.v1", reason: "[REDACTED]", password: "[REDACTED]", nested: { token: "[REDACTED]", url: "[REDACTED]" } });
  });
});
