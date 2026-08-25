import { describe, expect, it } from "vitest";
import { hasSecret } from "../secret-reference";

describe("secret-reference contract", () => {
  it("rejects credential-shaped metadata without exposing the value", () => {
    expect(hasSecret({ password: "hidden" })).toBe(true);
    expect(hasSecret({ referenceId: "vault/cctv/branch-a" })).toBe(false);
    expect(hasSecret({ system: "rtsp://user:pass@example/cam" })).toBe(true);
  });
});
