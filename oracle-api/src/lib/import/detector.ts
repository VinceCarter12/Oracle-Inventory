export interface DetectionResult {
  category: string | null;
  branchId: string | null;
  branchName: string | null;
  confidence: number; // 0–100
  signals: string[];
  /** True when ≥2 headers match LOCKED_BRANCHES and no dedicated branch column exists. */
  isMatrix: boolean;
  /** The header names that matched LOCKED_BRANCHES (populated when isMatrix=true). */
  branchColumns: string[];
}

/**
 * Locked branch name list used for cross-tab (matrix) detection.
 * Detection is case-insensitive. Extend this list as new branches are created.
 */
export const LOCKED_BRANCHES = [
  "Cubao", "Malolos", "Meycauayan", "OPC",
  "Head Office", "HQ", "Makati", "BGC",
  "Quezon City", "QC", "Pasig", "Mandaluyong",
  "Alabang", "Cebu", "Davao",
];

interface BranchRef {
  id: string;
  name: string;
}

const CATEGORY_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /\bcp\b|company[\s_-]?phone|mobile[\s_-]?phone|cellphone/i, category: "Company Phones" },
  { pattern: /\bzoho\b|email[\s_-]?account|mail[\s_-]?account/i,         category: "Email Accounts" },
  { pattern: /\blaptop\b/i,                                               category: "Laptops" },
  { pattern: /\bdesktop\b/i,                                              category: "Desktops" },
  { pattern: /\bmonitor\b/i,                                              category: "Monitors" },
  { pattern: /\bprinter\b/i,                                              category: "Printers" },
  { pattern: /\bnetwork\b|\bswitch\b|\brouter\b|\bap\b|\baccess[\s_-]?point\b/i, category: "Network Devices" },
  { pattern: /\bperipheral\b|\baccessor/i,                                category: "Peripherals" },
  { pattern: /\bcomputer\b|\b\bpc\b/i,                                    category: "Computers" },
];

const HEADER_CATEGORY_SIGNALS: { pattern: RegExp; category: string; weight: number }[] = [
  { pattern: /\bimei\b/i,                             category: "Company Phones", weight: 35 },
  { pattern: /sim[\s_-]?info|sim[\s_-]?number/i,     category: "Company Phones", weight: 25 },
  { pattern: /mac[\s_-]?address|hostname|computer[\s_-]?name/i, category: "Computers", weight: 30 },
  { pattern: /ram|memory/i,                           category: "Computers",      weight: 15 },
  { pattern: /operating[\s_-]?system|\bos\b/i,        category: "Computers",      weight: 15 },
  { pattern: /email[\s_-]?address/i,                  category: "Email Accounts", weight: 30 },
];

function escapeBranchName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fuzzyMatch(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

export function detectCategoryAndBranch(
  sheetName: string,
  headers: string[],
  sampleRows: Record<string, unknown>[],
  existingBranches: BranchRef[]
): DetectionResult {
  const signals: string[] = [];
  let category: string | null = null;
  let branchId: string | null = null;
  let branchName: string | null = null;
  let confidence = 0;

  // ── Category: sheet name ──────────────────────────────────────────────────
  for (const p of CATEGORY_PATTERNS) {
    if (p.pattern.test(sheetName)) {
      category = p.category;
      signals.push(`Sheet name matches "${p.category}"`);
      confidence += 50;
      break;
    }
  }

  // ── Category: headers ─────────────────────────────────────────────────────
  for (const h of headers) {
    for (const s of HEADER_CATEGORY_SIGNALS) {
      if (s.pattern.test(h)) {
        if (!category) {
          category = s.category;
          signals.push(`Header "${h}" signals "${s.category}"`);
        }
        confidence += s.weight;
        break;
      }
    }
  }

  // ── Branch: sheet name word-match ─────────────────────────────────────────
  for (const b of existingBranches) {
    const re = new RegExp(`\\b${escapeBranchName(b.name)}\\b`, "i");
    if (re.test(sheetName)) {
      branchId = b.id;
      branchName = b.name;
      signals.push(`Branch "${b.name}" found in sheet name`);
      confidence += 20;
      break;
    }
    // Partial: first word of branch name
    const firstWord = b.name.split(/\s+/)[0];
    if (firstWord.length > 3 && new RegExp(`\\b${escapeBranchName(firstWord)}\\b`, "i").test(sheetName)) {
      branchId = b.id;
      branchName = b.name;
      signals.push(`Branch partial "${firstWord}" found in sheet name`);
      confidence += 10;
      break;
    }
  }

  // ── Branch: dedicated column in sample data ────────────────────────────────
  if (!branchId) {
    const branchHeader = headers.find((h) => /^\s*(branch|location|site|office)\s*$/i.test(h));
    if (branchHeader && sampleRows.length > 0) {
      const sampleVal = String(sampleRows[0][branchHeader] ?? "");
      const matched = existingBranches.find((b) => fuzzyMatch(b.name, sampleVal));
      if (matched) {
        branchId = matched.id;
        branchName = matched.name;
        signals.push(`Branch column value "${sampleVal}" matched`);
        confidence += 15;
      }
    }
  }

  // ── Matrix (cross-tab) detection ─────────────────────────────────────────
  // A matrix sheet has branch-name columns (e.g. Cubao, Malolos) used as
  // quantity pivots instead of a single "Branch" text column.
  const hasBranchColumn = headers.some((h) => /^\s*(branch|location|site|office)\s*$/i.test(h));
  const matchedBranchCols = headers.filter((h) =>
    LOCKED_BRANCHES.some((b) => b.toLowerCase() === h.trim().toLowerCase())
  );
  const isMatrix = !hasBranchColumn && matchedBranchCols.length >= 2;
  if (isMatrix) {
    signals.push(
      `Cross-tab layout detected: ${matchedBranchCols.join(", ")} — enable "Unpivot branch columns" to import`
    );
  }

  return {
    category,
    branchId,
    branchName,
    confidence: Math.min(confidence, 100),
    signals,
    isMatrix,
    branchColumns: matchedBranchCols,
  };
}
