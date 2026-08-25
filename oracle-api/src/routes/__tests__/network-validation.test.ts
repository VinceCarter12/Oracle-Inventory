import { describe, expect, it } from "vitest";
import { normalizeMac, validIp } from "../network";

describe("network validation", () => {
  it("normalizes valid MAC addresses and rejects malformed values", () => {
    expect(normalizeMac("aa-bb-cc-dd-ee-ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("not-a-mac")).toBeNull();
  });
  it("enforces IPv4 and IPv6 prefix ranges", () => {
    expect(validIp("192.168.1.1", 24)).toBe(true);
    expect(validIp("192.168.1.1", 33)).toBe(false);
    expect(validIp("2001:db8::1", 64)).toBe(true);
    expect(validIp("2001:db8::1", 129)).toBe(false);
  });
});
