import { describe, expect, it } from "vitest";
import { validateIntake } from "../computer-intake";

describe("computer intake runtime validation", () => {
  it("rejects malformed scalars, enums, and components", () => {
    const errors = validateIntake({ name: 4, branchId: null, condition: "broken", components: [{ type: "disk", capacity: "0" }] });
    expect(errors.name).toBeTruthy();
    expect(errors.branchId).toBeTruthy();
    expect(errors.condition).toBeTruthy();
    expect(errors["components.0.type"]).toBeTruthy();
    expect(errors["components.0.capacity"]).toBeTruthy();
  });

  it("accepts a valid manual computer payload", () => {
    expect(validateIntake({ name: "Finance-01", branchId: "branch-1", deviceType: "laptop", components: [{ type: "storage", capacity: "512", storageKind: "ssd" }] })).toEqual({});
  });
});
