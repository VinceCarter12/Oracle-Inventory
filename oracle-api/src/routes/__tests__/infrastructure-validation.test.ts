import { describe, expect, it } from "vitest";
import { forbiddenValue, hash, oneOf, categoryMatches, intervalsOverlap } from "../infrastructure";

describe("Phase 5 infrastructure validation", () => {
  it("rejects credential-like server, firewall, and ISP values", () => {
    expect(forbiddenValue({ pppoePassword: "hidden" })).toBe("pppoePassword");
    expect(forbiddenValue({ configurationArtifactRef: "vault://infra/firewall-a" })).toBeNull();
    expect(forbiddenValue({ configurationArtifactRef: "https://raw.example/config" })).toBe("configurationArtifactRef");
    expect(forbiddenValue({ notes: "https://admin:password@example" })).toBe("notes");
  });

  it("keeps idempotency hashes deterministic and content-sensitive", () => {
    expect(hash({ branchId: "b1", downloadMbps: 100 })).toBe(hash({ branchId: "b1", downloadMbps: 100 }));
    expect(hash({ branchId: "b1", downloadMbps: 100 })).not.toBe(hash({ branchId: "b1", downloadMbps: 200 }));
  });

  it("keeps Phase 5 enums and asset categories allowlisted", () => {
    expect(oneOf("router", ["router", "modem"])).toBe(true);
    expect(oneOf("switch", ["router", "modem"])).toBe(false);
    expect(categoryMatches("Firewall Appliance", "firewall")).toBe(true);
    expect(categoryMatches("Laptop", "server")).toBe(false);
  });

  it("detects bounded and open-ended address interval overlap", () => {
    expect(intervalsOverlap(new Date("2026-01-01"), new Date("2026-02-01"), new Date("2026-01-15"), new Date("2026-03-01"))).toBe(true);
    expect(intervalsOverlap(new Date("2026-01-01"), new Date("2026-02-01"), new Date("2026-02-01"), null)).toBe(false);
  });
});
