// Classifies sheets in an uploaded workbook

export type SheetType = "computer" | "phone" | "zoho" | "summary" | "generic";

export interface SheetClassification {
  name: string;
  type: SheetType;
  branchName: string | null;
  skip: boolean;
  skipReason: string | null;
}

const BRANCH_NAMES = ["Cubao", "Malolos", "Meycauayan"];

function extractBranch(sheetName: string): string | null {
  const lower = sheetName.toLowerCase();
  for (const b of BRANCH_NAMES) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  return null;
}

export function classifyWorkbook(sheetNames: string[]): SheetClassification[] {
  return sheetNames.map((name) => {
    const lower = name.toLowerCase().trim();
    const branchName = extractBranch(name);

    if (lower === "opc") {
      return { name, type: "summary", branchName: null, skip: true, skipReason: "Summary/dashboard sheet" };
    }
    if (lower.startsWith("computer")) {
      return { name, type: "computer", branchName, skip: false, skipReason: null };
    }
    if (lower.startsWith("cp ") || lower === "cp") {
      return { name, type: "phone", branchName, skip: false, skipReason: null };
    }
    if (lower.startsWith("zoho")) {
      return { name, type: "zoho", branchName, skip: false, skipReason: null };
    }
    return { name, type: "generic", branchName, skip: false, skipReason: null };
  });
}

/** Returns true if the workbook has at least one OPC-style typed sheet (computer/phone/zoho) */
export function isOpcWorkbook(classifications: SheetClassification[]): boolean {
  return classifications.some((c) => c.type === "computer" || c.type === "phone" || c.type === "zoho");
}
