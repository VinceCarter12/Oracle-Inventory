import { describe, it, expect } from "vitest";
import { detectMatrixBranchColumns, unpivotSheet } from "../unpivot";
import type { ParsedSheet } from "../parser";

// ── detectMatrixBranchColumns ─────────────────────────────────────────────────

describe("detectMatrixBranchColumns", () => {
  it("detects OPC branch columns from locked list", () => {
    const headers = ["Items", "Cubao", "Malolos", "Meycauayan", "OPC"];
    const cols = detectMatrixBranchColumns(headers);
    expect(cols).toContain("Cubao");
    expect(cols).toContain("Malolos");
    expect(cols).toContain("Meycauayan");
    expect(cols).toContain("OPC");
    expect(cols).not.toContain("Items");
  });

  it("is case-insensitive", () => {
    const cols = detectMatrixBranchColumns(["cubao", "MALOLOS", "Items"]);
    expect(cols).toContain("cubao");
    expect(cols).toContain("MALOLOS");
    expect(cols).not.toContain("Items");
  });

  it("returns empty array when no branch columns present", () => {
    const cols = detectMatrixBranchColumns(["Asset Name", "Serial Number", "Condition"]);
    expect(cols).toHaveLength(0);
  });
});

// ── unpivotSheet ──────────────────────────────────────────────────────────────

const makeSheet = (headers: string[], rows: Record<string, unknown>[]): ParsedSheet => ({
  name: "Sheet1",
  headers,
  rows,
});

describe("unpivotSheet", () => {
  const headers = ["Items", "Cubao", "Malolos", "Meycauayan", "OPC"];
  const branchCols = ["Cubao", "Malolos", "Meycauayan", "OPC"];

  const rows = [
    { Items: "Dell Monitor 24\"", Cubao: 5, Malolos: 2, Meycauayan: 0, OPC: 1 },
    { Items: "HP Keyboard",       Cubao: 0, Malolos: 0, Meycauayan: 0, OPC: 0 },
    { Items: "Logitech Mouse",    Cubao: 3, Malolos: null, Meycauayan: "", OPC: 2 },
  ];

  const sheet = makeSheet(headers, rows);
  const result = unpivotSheet(sheet, branchCols);

  it("produces correct long-format headers", () => {
    expect(result.headers).toContain("Items");
    expect(result.headers).toContain("Branch");
    expect(result.headers).toContain("Quantity");
    expect(result.headers).not.toContain("Cubao");
  });

  it("drops zero-quantity rows", () => {
    // Dell Monitor: Meycauayan=0 dropped → 3 rows
    // HP Keyboard: all zeros → 0 rows
    // Logitech Mouse: Malolos=null, Meycauayan="" dropped → 2 rows
    expect(result.rows).toHaveLength(5);
  });

  it("correctly sets Branch and Quantity", () => {
    const dellCubao = result.rows.find(
      (r) => r["Items"] === "Dell Monitor 24\"" && r["Branch"] === "Cubao"
    );
    expect(dellCubao).toBeDefined();
    expect(dellCubao!["Quantity"]).toBe(5);
  });

  it("copies non-branch columns to every output row", () => {
    const mouseRows = result.rows.filter((r) => r["Items"] === "Logitech Mouse");
    expect(mouseRows).toHaveLength(2);
    mouseRows.forEach((r) => {
      expect(r).toHaveProperty("Items", "Logitech Mouse");
    });
  });

  it("handles string quantity values with commas", () => {
    const sheet2 = makeSheet(
      ["Items", "Cubao"],
      [{ Items: "Desk", Cubao: "1,200" }]
    );
    const out = unpivotSheet(sheet2, ["Cubao"]);
    expect(out.rows[0]["Quantity"]).toBe(1200);
  });

  it("returns empty rows when all quantities are zero", () => {
    const out = unpivotSheet(makeSheet(headers, rows.slice(1, 2)), branchCols);
    expect(out.rows).toHaveLength(0);
  });
});
