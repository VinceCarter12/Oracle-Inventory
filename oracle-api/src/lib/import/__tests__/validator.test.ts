import { describe, it, expect } from "vitest";
import { validateRows } from "../validator";
import type { FieldMapping } from "../mapper";

const BASE_MAPPINGS: FieldMapping[] = [
  { fileColumn: "Asset Name", systemField: "name", isMetadata: false },
  { fileColumn: "Serial Number", systemField: "serialNumber", isMetadata: false },
];

// ── ingestUnmappedAsMetadata ──────────────────────────────────────────────────

describe("validateRows – ingestUnmappedAsMetadata", () => {
  const rows = [
    {
      "Asset Name": "Laptop A",
      "Serial Number": "SN123",
      "Purchase Order": "PO-999",
      "Custom Field": "some value",
    },
  ];

  it("excludes unmapped columns by default (flag off)", () => {
    const validated = validateRows(rows, BASE_MAPPINGS, "Peripherals", false);
    const meta = validated[0].mappedData.metadata as Record<string, unknown> | undefined;
    expect(meta?.purchase_order).toBeUndefined();
    expect(meta?.custom_field).toBeUndefined();
  });

  it("ingests unmapped columns as snake_case metadata keys when flag is on", () => {
    const validated = validateRows(rows, BASE_MAPPINGS, "Peripherals", true);
    const meta = validated[0].mappedData.metadata as Record<string, unknown>;
    expect(meta.purchase_order).toBe("PO-999");
    expect(meta.custom_field).toBe("some value");
  });

  it("does not overwrite already-mapped metadata keys", () => {
    const mappingsWithMeta: FieldMapping[] = [
      ...BASE_MAPPINGS,
      { fileColumn: "MAC Address", systemField: "metadata", isMetadata: true, metadataKey: "macAddress" },
    ];
    const rowsWithMac = [{ "Asset Name": "PC", "Serial Number": "SN1", "MAC Address": "AA:BB:CC:DD:EE:FF", "Extra": "val" }];
    const validated = validateRows(rowsWithMac, mappingsWithMeta, "Computers", true);
    const meta = validated[0].mappedData.metadata as Record<string, unknown>;
    // MAC was explicitly mapped; unmapped "Extra" should appear as "extra"
    expect(meta.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    expect(meta.extra).toBe("val");
  });

  it("skips empty unmapped cells", () => {
    const rowsWithEmpty = [{ "Asset Name": "Laptop", "Serial Number": "SN2", "Empty Col": "" }];
    const validated = validateRows(rowsWithEmpty, BASE_MAPPINGS, "Peripherals", true);
    const meta = validated[0].mappedData.metadata as Record<string, unknown> | undefined;
    expect(meta?.empty_col).toBeUndefined();
  });

  it("normalises column names to snake_case keys", () => {
    const rowsSpecial = [{ "Asset Name": "X", "Serial Number": "SN3", "Foo-Bar/Baz Col": "test" }];
    const validated = validateRows(rowsSpecial, BASE_MAPPINGS, "Peripherals", true);
    const meta = validated[0].mappedData.metadata as Record<string, unknown>;
    expect(meta.foo_bar_baz_col).toBe("test");
  });
});

// ── MAC duplicate detection (unit-only: no DB) ────────────────────────────────
// Full duplicate detection needs a DB; these just verify the shape of ValidatedRow
// so downstream logic can read metadata.macAddress correctly.

describe("validateRows – macAddress in metadata", () => {
  it("stores MAC address under metadata.macAddress when mapped", () => {
    const mappings: FieldMapping[] = [
      { fileColumn: "Name", systemField: "name", isMetadata: false },
      { fileColumn: "MAC", systemField: "metadata", isMetadata: true, metadataKey: "macAddress" },
    ];
    const rows = [{ Name: "Switch", MAC: "00:11:22:33:44:55" }];
    const validated = validateRows(rows, mappings, "Network Devices");
    const meta = validated[0].mappedData.metadata as Record<string, unknown>;
    expect(meta.macAddress).toBe("00:11:22:33:44:55");
  });
});

// ── categoryHint and employeeId pass-through ──────────────────────────────────

describe("validateRows – categoryHint and employeeId pass-through", () => {
  it("stores categoryHint as a top-level mapped field", () => {
    const mappings: FieldMapping[] = [
      { fileColumn: "Name",     systemField: "name",        isMetadata: false },
      { fileColumn: "Category", systemField: "categoryHint",isMetadata: false },
    ];
    const rows = [{ Name: "Laptop", Category: "Computers" }];
    const validated = validateRows(rows, mappings, "Peripherals");
    expect(validated[0].mappedData.categoryHint).toBe("Computers");
  });

  it("stores employeeId as a top-level mapped field", () => {
    const mappings: FieldMapping[] = [
      { fileColumn: "Name",        systemField: "name",      isMetadata: false },
      { fileColumn: "Employee ID", systemField: "employeeId",isMetadata: false },
    ];
    const rows = [{ Name: "Laptop", "Employee ID": "EMP-001" }];
    const validated = validateRows(rows, mappings, "Peripherals");
    expect(validated[0].mappedData.employeeId).toBe("EMP-001");
  });
});
