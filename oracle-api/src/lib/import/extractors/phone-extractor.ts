import type { NormalizedAsset } from "./types";

type Row = Record<string, unknown>;

function str(row: Row, col: string): string | null {
  const v = row[col];
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

function num(row: Row, col: string): number {
  const v = row[col];
  if (v === null || v === undefined || v === "") return 0;
  return parseInt(String(v), 10) || 0;
}

export function extractPhoneAssets(
  rows: Row[],
  branchName: string | null,
  sourceSheet: string
): NormalizedAsset[] {
  const results: NormalizedAsset[] = [];

  rows.forEach((row, rowIndex) => {
    const surname    = str(row, "Surname")     ?? "";
    const firstName  = str(row, "First Name")  ?? "";
    const employeeRef  = str(row, "Assigned User");
    const employeeId   = str(row, "Employee Number");
    const employeeName = [surname, firstName].filter(Boolean).join(", ") || employeeRef;
    const employeePhone =
      str(row, "Mobile Number") ??
      str(row, "Phone Number")  ??
      str(row, "Contact Number") ??
      str(row, "Mobile");
    const employeeDeptName = str(row, "Department");
    const employeePosition =
      str(row, "Position") ??
      str(row, "Job Title") ??
      str(row, "Designation");

    const base = {
      employeeRef,
      employeeId,
      employeeName,
      employeePhone,
      employeeDeptName,
      employeePosition,
      branchName,
      sourceSheet,
      sourceRowIndex: rowIndex,
      ownership: "company" as const,
    };

    const phoneCount = num(row, "Company Phone Count");
    // "Serrial Number" is the actual column name (typo in source)
    const serial  = str(row, "Serrial Number");
    // "IME Number" is the actual column name (typo for IMEI)
    const imei    = str(row, "IME Number");
    const brand   = str(row, "Brand");
    const model   = str(row, "Model");
    const propTag = str(row, "CP Property tag");
    const sim     = str(row, "Company SIM");

    // Only extract if there's evidence of an actual phone
    if (phoneCount > 0 || brand || model || serial || imei) {
      const meta: Record<string, unknown> = {};
      if (sim) meta.sim = sim;

      const phone: NormalizedAsset = {
        ...base,
        name:           [brand, model].filter(Boolean).join(" ") || "Company Phone",
        serialNumber:   serial,
        assetTag:       null,
        computerName:   null,
        imeiNumber:     imei,
        propertyTag:    propTag,
        macAddress:     null,
        brand,
        model,
        deviceType:     "Company Phone",
        condition:      "usable",
        warrantyExpiry: null,
        purchaseDate:   null,
        description:    null,
        metadata:       Object.keys(meta).length ? meta : null,
        categoryHint:   "Company Phones",
      };
      results.push(phone);
    }
    // BYOD phones (Brand2/3) are personal — skip intentionally
  });

  return results;
}
