import { describe, expect, it } from "vitest";
import { branchScoped, crossBranchAllowed, forbiddenValue, hash } from "../infrastructure";

describe("Phase 5 infrastructure security helpers", () => {
  it("fails closed for a branchless non-super-admin", () => {
    expect(branchScoped({ branchId: null, role: { name: "admin" } }, "branch-a")).toBe(false);
    expect(branchScoped({ branchId: null, role: { name: "admin" } }, null)).toBe(false);
  });

  it("allows a SecretReference ID but rejects secret material", () => {
    expect(forbiddenValue({ secretReferenceId: "sec_123" })).toBeNull();
    expect(forbiddenValue({ password: "do-not-store" })).toBe("password");
    expect(forbiddenValue({ endpoint: "postgres://user:password@example.test/db" })).toBe("endpoint");
  });

  it("allows only a Super Admin to use an unscoped shared branch", () => {
    expect(branchScoped({ branchId: null, role: { name: "admin" } }, "branch-b")).toBe(false);
    expect(branchScoped({ branchId: null, role: { name: "super_admin" } }, "branch-b")).toBe(true);
  });

  it("requires shared policy and an explicit reason for cross-branch equipment", () => {
    const admin = { branchId: "branch-a", role: { name: "admin" } };
    const superAdmin = { branchId: null, role: { name: "super_admin" } };
    expect(crossBranchAllowed(admin, "branch-a", "branch-b", true, true, "approved")).toBe(false);
    expect(crossBranchAllowed(superAdmin, "branch-a", "branch-b", false, true, "approved")).toBe(false);
    expect(crossBranchAllowed(superAdmin, "branch-a", "branch-b", true, false, "approved")).toBe(false);
    expect(crossBranchAllowed(superAdmin, "branch-a", "branch-b", true, true, "approved")).toBe(true);
  });

  it("replays the same idempotency fingerprint and rejects changed payloads", () => {
    const first = hash({ assetId: "asset-a", role: "router", sharedServiceApproved: false, sharedServiceReason: null });
    expect(hash({ assetId: "asset-a", role: "router", sharedServiceApproved: false, sharedServiceReason: null })).toBe(first);
    expect(hash({ assetId: "asset-b", role: "router" })).not.toBe(first);
    expect(hash({ assetId: "asset-a", role: "router", sharedServiceApproved: true, sharedServiceReason: "approved" })).not.toBe(first);
  });
});
