import { describe, it, expect } from "vitest";
import { mapColumns, validateMappingCompleteness } from "../mapper";
import { detectCategoryAndBranch } from "../detector";
import { detectMatrixBranchColumns, unpivotSheet } from "../unpivot";
import { validateRows } from "../validator";
import type { ParsedSheet } from "../parser";

/**
 * Integration test: simulate what the /parse route does when it receives
 * a multi-sheet workbook similar to the OPC inventory workbook.
 *
 * Sheet layout:
 *   Sheet 1 ("Peripherals")   — single-schema: Items | Serial Number | Condition
 *   Sheet 2 ("Stock Count")   — cross-tab:     Items | Cubao | Malolos | Meycauayan | OPC
 */

const peripheralSheet: ParsedSheet = {
  name: "Peripherals",
  headers: ["Items", "Serial Number", "Condition"],
  rows: [
    { Items: "HP LaserJet Printer", "Serial Number": "VNBR203A", Condition: "Good" },
    { Items: "Cisco Switch 24-port", "Serial Number": "FGL2212V0BZ", Condition: "Working" },
    { Items: "Unknown Peripheral", "Serial Number": null, Condition: null },
  ],
};

const stockSheet: ParsedSheet = {
  name: "Stock Count",
  headers: ["Items", "Cubao", "Malolos", "Meycauayan", "OPC"],
  rows: [
    { Items: "Dell Monitor 24\"", Cubao: 5, Malolos: 2, Meycauayan: 0, OPC: 1 },
    { Items: "USB-C Hub",         Cubao: 0, Malolos: 3, Meycauayan: 1, OPC: 0 },
    { Items: "HP Keyboard",       Cubao: 4, Malolos: 4, Meycauayan: 2, OPC: 3 },
  ],
};

describe("Integration: peripheral sheet (single-schema)", () => {
  const detection = detectCategoryAndBranch("Peripherals", peripheralSheet.headers, peripheralSheet.rows.slice(0, 3), []);
  const { mappings, unmapped } = mapColumns(peripheralSheet.headers);
  const mappingErrors = validateMappingCompleteness(mappings);

  it("maps Items → name", () => {
    expect(mappings.some((m) => m.systemField === "name")).toBe(true);
  });

  it("maps Serial Number → serialNumber", () => {
    expect(mappings.some((m) => m.systemField === "serialNumber")).toBe(true);
  });

  it("maps Condition → condition", () => {
    expect(mappings.some((m) => m.systemField === "condition")).toBe(true);
  });

  it("has no unmapped columns", () => {
    expect(unmapped).toHaveLength(0);
  });

  it("has no mapping errors (name is mapped)", () => {
    expect(mappingErrors).toHaveLength(0);
  });

  it("is not a matrix layout", () => {
    expect(detection.isMatrix).toBe(false);
  });

  it("validates rows: valid rows have name", () => {
    const validated = validateRows(peripheralSheet.rows, mappings, "Peripherals");
    // All 3 have Items values
    expect(validated.filter((r) => r.isValid)).toHaveLength(3);
  });

  it("warns about missing identifier on row with no serial", () => {
    const validated = validateRows(peripheralSheet.rows, mappings, "Peripherals");
    const unknownRow = validated[2];
    expect(unknownRow.warnings.some((w) => w.field === "identifier")).toBe(true);
  });
});

describe("Integration: stock sheet (cross-tab / matrix)", () => {
  const detection = detectCategoryAndBranch(
    "Stock Count",
    stockSheet.headers,
    stockSheet.rows.slice(0, 3),
    []
  );
  const branchCols = detectMatrixBranchColumns(stockSheet.headers);

  it("detects matrix layout", () => {
    expect(detection.isMatrix).toBe(true);
  });

  it("detects correct branch columns", () => {
    expect(branchCols).toContain("Cubao");
    expect(branchCols).toContain("Malolos");
    expect(branchCols).toContain("Meycauayan");
    expect(branchCols).toContain("OPC");
  });

  it("name is not mapped before unpivot (Items unmapped → mapping error)", () => {
    // Before unpivot, Items IS in the alias list, so it should map
    const { mappings } = mapColumns(stockSheet.headers);
    expect(mappings.some((m) => m.systemField === "name")).toBe(true);
  });

  describe("after unpivot", () => {
    const unpivoted = unpivotSheet(stockSheet, branchCols);
    const { mappings, unmapped } = mapColumns(unpivoted.headers);
    const mappingErrors = validateMappingCompleteness(mappings);

    it("produces correct row count (drops zero-quantity)", () => {
      // Dell: Cubao+Malolos+OPC = 3 rows (Meycauayan=0 dropped)
      // USB-C Hub: Malolos+Meycauayan = 2 rows (Cubao=0,OPC=0 dropped)
      // HP Keyboard: all 4 non-zero = 4 rows
      expect(unpivoted.rows).toHaveLength(9);
    });

    it("has Branch and Quantity columns", () => {
      expect(unpivoted.headers).toContain("Branch");
      expect(unpivoted.headers).toContain("Quantity");
    });

    it("maps Branch → branchName", () => {
      expect(mappings.some((m) => m.systemField === "branchName")).toBe(true);
    });

    it("has no mapping errors after unpivot", () => {
      expect(mappingErrors).toHaveLength(0);
    });

    it("validates all rows as valid (name is present)", () => {
      const validated = validateRows(unpivoted.rows, mappings, "Peripherals");
      expect(validated.every((r) => r.isValid)).toBe(true);
    });

    it("all rows have a branchName", () => {
      const validated = validateRows(unpivoted.rows, mappings, "Peripherals");
      validated.forEach((r) => {
        expect(r.mappedData.branchName).toBeTruthy();
      });
    });
  });
});
