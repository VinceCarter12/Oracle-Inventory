import { describe, expect, it } from "vitest";
import { hasValidEmployeeResolution } from "../department-management";

describe("department employee resolution", () => {
  it("requires exactly one resolution when members exist", () => {
    expect(hasValidEmployeeResolution(undefined, undefined, 2)).toBe(false);
    expect(hasValidEmployeeResolution("clear", undefined, 2)).toBe(true);
    expect(hasValidEmployeeResolution("reassign", "target", 2)).toBe(true);
    expect(hasValidEmployeeResolution("reassign", "", 2)).toBe(false);
  });

  it("allows lifecycle actions with no members", () => {
    expect(hasValidEmployeeResolution(undefined, undefined, 0)).toBe(true);
  });
});
