import * as XLSX from "xlsx";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ParseResult {
  sheets: ParsedSheet[];
  totalRows: number;
}

export interface ParseOptions {
  /**
   * Number of rows to skip before treating the next row as the header row.
   * 0 = first row is the header (default).
   * 1 = skip row 1, treat row 2 as the header.
   * Useful when a sheet has a title row, merged cells, or notes above the data.
   */
  headerRowOffset?: number;
}

export function parseBuffer(buffer: Buffer, filename: string, options: ParseOptions = {}): ParseResult {
  const { headerRowOffset = 0 } = options;
  const ext = filename.split(".").pop()?.toLowerCase();

  let workbook: XLSX.WorkBook;
  if (ext === "csv") {
    workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  } else {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  }

  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: null,
      // range: N treats row N (0-indexed) as the header row, skipping rows 0…N-1
      ...(headerRowOffset > 0 ? { range: headerRowOffset } : {}),
    });

    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0]);
    // Trim all string values; convert empty strings to null
    const cleanRows = rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() || null : v,
        ])
      )
    );

    sheets.push({ name: sheetName, headers, rows: cleanRows });
  }

  const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
  return { sheets, totalRows };
}
