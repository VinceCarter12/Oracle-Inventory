import { describe, expect, it } from "vitest";
import { submitPayload, validateIntake } from "../computer-intake";

describe("computer intake validation", () => {
  it("rejects non-computer component types and invalid capacities", () => {
    expect(validateIntake({ name: "A", components: [{ type: "network", capacity: "0" }] })).toMatchObject({
      "components.0.type": expect.any(String),
    });
  });
  it("rejects invalid dates and enum values", () => {
    expect(validateIntake({ name: "A", deviceType: "server", purchaseDate: "not-a-date" })).toMatchObject({ deviceType: expect.any(String), purchaseDate: expect.any(String) });
  });
  it("accepts a typed manual computer payload", () => {
    expect(validateIntake({ name: "Finance-LT-014", branchId: "branch-1", deviceType: "laptop", components: [{ type: "ram", capacity: "16" }] })).toEqual({});
  });
  it("strips frontend submit control fields before intake validation/merge", () => {
    expect(submitPayload({ expectedUpdatedAt: "2026-08-24T00:00:00.000Z", ifMatch: "etag", idempotencyKey: "client-key", name: "Finance-01" })).toEqual({ name: "Finance-01" });
    expect(validateIntake(submitPayload({ expectedUpdatedAt: "2026-08-24T00:00:00.000Z", name: "Finance-01" }))).toEqual({});
  });
});
