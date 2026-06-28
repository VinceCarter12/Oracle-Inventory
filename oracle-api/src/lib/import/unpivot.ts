import type { ParsedSheet } from "./parser";
import { LOCKED_BRANCHES } from "./detector";

/**
 * Returns which headers from the given list match the locked branch name list
 * (case-insensitive, trimmed).
 */
export function detectMatrixBranchColumns(headers: string[]): string[] {
  return headers.filter((h) =>
    LOCKED_BRANCHES.some((b) => b.toLowerCase() === h.trim().toLowerCase())
  );
}

/**
 * Transform a wide cross-tab sheet into long (tidy) format.
 *
 * Input row example:
 *   { Items: "Dell Monitor", Cubao: 5, Malolos: 0, Meycauayan: 2, OPC: 1 }
 *
 * Output rows (zero-quantity branches dropped):
 *   { Items: "Dell Monitor", Branch: "Cubao",      Quantity: 5 }
 *   { Items: "Dell Monitor", Branch: "Meycauayan", Quantity: 2 }
 *   { Items: "Dell Monitor", Branch: "OPC",        Quantity: 1 }
 *
 * Non-branch columns are copied verbatim to every output row.
 * The resulting sheet has "Branch" and "Quantity" appended as new columns.
 */
export function unpivotSheet(sheet: ParsedSheet, branchColumns: string[]): ParsedSheet {
  const branchSet = new Set(branchColumns);
  const otherCols = sheet.headers.filter((h) => !branchSet.has(h));
  const longRows: Record<string, unknown>[] = [];

  for (const row of sheet.rows) {
    for (const branchCol of branchColumns) {
      const raw = row[branchCol];
      // Skip blank / null / zero
      if (raw === null || raw === undefined || raw === "") continue;
      const qty =
        typeof raw === "number"
          ? raw
          : Number(String(raw).replace(/,/g, "").trim());
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const newRow: Record<string, unknown> = {};
      for (const col of otherCols) newRow[col] = row[col];
      newRow["Branch"] = branchCol;
      newRow["Quantity"] = qty;
      longRows.push(newRow);
    }
  }

  return {
    name: sheet.name,
    headers: [...otherCols, "Branch", "Quantity"],
    rows: longRows,
  };
}
