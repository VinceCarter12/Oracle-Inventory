import { describe, it, expect } from "vitest";
import { normalizeHeader, mapColumns, validateMappingCompleteness } from "../mapper";

// ── normalizeHeader ───────────────────────────────────────────────────────────

describe("normalizeHeader", () => {
  it("lowercases and trims", () => {
    expect(normalizeHeader("  Name  ")).toBe("name");
  });

  it("collapses spaces and underscores", () => {
    expect(normalizeHeader("Asset_Name")).toBe("asset name");
    expect(normalizeHeader("asset  name")).toBe("asset name");
  });

  it("strips special characters", () => {
    // "/" becomes a space (collapsed by the first replace), then the space is kept
    expect(normalizeHeader("S/N")).toBe("s n");
    expect(normalizeHeader("RAM (GB)")).toBe("ram gb");
    expect(normalizeHeader("MAC Address")).toBe("mac address");
    expect(normalizeHeader("IMEI#")).toBe("imei");
    // Alias comparison still works: normalizeHeader("S/N") === normalizeHeader("S/N") ✓
  });

  it("handles dashes and dots", () => {
    expect(normalizeHeader("Warranty-Expiry")).toBe("warranty expiry");
    expect(normalizeHeader("Serial No.")).toBe("serial no");
  });
});

// ── mapColumns: name aliases ──────────────────────────────────────────────────

describe("mapColumns – name aliases", () => {
  it("maps 'Items' to name", () => {
    const { mappings, unmapped } = mapColumns(["Items"]);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].systemField).toBe("name");
    expect(unmapped).toHaveLength(0);
  });

  it("maps 'Item' to name", () => {
    const { mappings } = mapColumns(["Item"]);
    expect(mappings[0].systemField).toBe("name");
  });

  it("maps 'Asset Name' to name", () => {
    const { mappings } = mapColumns(["Asset Name"]);
    expect(mappings[0].systemField).toBe("name");
  });

  it("maps 'Asset' to name", () => {
    const { mappings } = mapColumns(["Asset"]);
    expect(mappings[0].systemField).toBe("name");
  });

  it("maps case-insensitive 'ITEMS' to name", () => {
    const { mappings } = mapColumns(["ITEMS"]);
    expect(mappings[0].systemField).toBe("name");
  });

  it("maps 'items' (lowercase) to name", () => {
    const { mappings } = mapColumns(["items"]);
    expect(mappings[0].systemField).toBe("name");
  });
});

// ── mapColumns: other aliases ─────────────────────────────────────────────────

describe("mapColumns – other aliases", () => {
  it("maps 'S/N' to serialNumber", () => {
    const { mappings } = mapColumns(["S/N"]);
    expect(mappings[0].systemField).toBe("serialNumber");
  });

  it("maps 'RAM (GB)' to metadata.ram", () => {
    const { mappings } = mapColumns(["RAM (GB)"]);
    expect(mappings[0].isMetadata).toBe(true);
    expect(mappings[0].metadataKey).toBe("ram");
  });

  it("maps 'MAC Address' to metadata.macAddress", () => {
    const { mappings } = mapColumns(["MAC Address"]);
    expect(mappings[0].isMetadata).toBe(true);
    expect(mappings[0].metadataKey).toBe("macAddress");
  });

  it("marks unknown headers as unmapped", () => {
    const { mappings, unmapped } = mapColumns(["FooBarColumn"]);
    expect(mappings).toHaveLength(0);
    expect(unmapped).toContain("FooBarColumn");
  });
});

// ── Full cross-tab header set ─────────────────────────────────────────────────

describe("mapColumns – cross-tab sheet (Items + branch columns)", () => {
  it("maps Items to name; leaves branch columns unmapped", () => {
    const headers = ["Items", "Cubao", "Malolos", "Meycauayan", "OPC"];
    const { mappings, unmapped } = mapColumns(headers);
    expect(mappings.some((m) => m.systemField === "name")).toBe(true);
    // Branch columns are not system fields — they'll be handled by matrix detection
    expect(unmapped).toContain("Cubao");
    expect(unmapped).toContain("Malolos");
    expect(unmapped).toContain("Meycauayan");
    expect(unmapped).toContain("OPC");
  });
});

// ── categoryHint aliases ──────────────────────────────────────────────────────

describe("mapColumns – categoryHint aliases", () => {
  it("maps 'Category' to categoryHint (system field, not metadata)", () => {
    const { mappings, unmapped } = mapColumns(["Category"]);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].systemField).toBe("categoryHint");
    expect(mappings[0].isMetadata).toBe(false);
    expect(unmapped).toHaveLength(0);
  });

  it("maps 'Categories' to categoryHint", () => {
    const { mappings } = mapColumns(["Categories"]);
    expect(mappings[0].systemField).toBe("categoryHint");
  });

  it("maps 'Asset Category' to categoryHint", () => {
    const { mappings } = mapColumns(["Asset Category"]);
    expect(mappings[0].systemField).toBe("categoryHint");
  });
});

// ── employeeId aliases ────────────────────────────────────────────────────────

describe("mapColumns – employeeId aliases", () => {
  it("maps 'Employee ID' to employeeId (system field)", () => {
    const { mappings } = mapColumns(["Employee ID"]);
    expect(mappings[0].systemField).toBe("employeeId");
    expect(mappings[0].isMetadata).toBe(false);
  });

  it("maps 'Employee Number' to employeeId", () => {
    const { mappings } = mapColumns(["Employee Number"]);
    expect(mappings[0].systemField).toBe("employeeId");
  });

  it("maps 'Staff ID' to employeeId", () => {
    const { mappings } = mapColumns(["Staff ID"]);
    expect(mappings[0].systemField).toBe("employeeId");
  });
});

// ── validateMappingCompleteness ───────────────────────────────────────────────

describe("validateMappingCompleteness", () => {
  it("returns no errors when name is mapped", () => {
    const { mappings } = mapColumns(["Items"]);
    expect(validateMappingCompleteness(mappings)).toHaveLength(0);
  });

  it("returns an error when name is not mapped", () => {
    const { mappings } = mapColumns(["Cubao", "Malolos"]);
    const errors = validateMappingCompleteness(mappings);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/name/i);
  });
});
