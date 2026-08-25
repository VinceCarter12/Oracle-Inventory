import { describe, expect, it } from "vitest";
import { parseBranchCoordinates } from "../branch-coordinates";

describe("parseBranchCoordinates", () => {
  it("accepts a valid coordinate pair", () => {
    expect(parseBranchCoordinates("14.5995", "120.9842")).toEqual({ latitude: 14.5995, longitude: 120.9842 });
  });

  it("allows an intentional clear", () => {
    expect(parseBranchCoordinates(null, null)).toEqual({ latitude: null, longitude: null });
  });

  it("rejects an incomplete or out-of-range location", () => {
    expect(() => parseBranchCoordinates(14, null)).toThrow("together");
    expect(() => parseBranchCoordinates(91, 121)).toThrow("between -90 and 90");
  });
});
