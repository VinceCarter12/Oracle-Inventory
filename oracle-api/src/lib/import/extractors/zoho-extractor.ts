import type { NormalizedAsset } from "./types";

type Row = Record<string, unknown>;

function str(row: Row, ...cols: string[]): string | null {
  for (const col of cols) {
    const v = row[col];
    if (v !== null && v !== undefined && v !== "") return String(v).trim() || null;
  }
  return null;
}

export function extractZohoAssets(
  rows: Row[],
  branchName: string | null,
  sourceSheet: string
): NormalizedAsset[] {
  const results: NormalizedAsset[] = [];

  rows.forEach((row, rowIndex) => {
    // Resolve email address — try common column names from Zoho exports
    const email =
      str(row, "Email Address", "Email", "Zoho Mail", "Work Email", "Corporate Email") ??
      str(row, "Username");

    // Skip rows with no email — they are headers or empty rows
    if (!email || !email.includes("@")) return;

    // Resolve display name
    const surname   = str(row, "Surname", "Last Name")    ?? "";
    const firstName = str(row, "First Name", "Given Name") ?? "";
    const displayName =
      str(row, "Display Name", "Name", "Full Name") ??
      [surname, firstName].filter(Boolean).join(", ") ??
      email.split("@")[0];

    // Employee reference
    const employeeRef  = str(row, "Assigned User", "Display Name", "Name", "Full Name") ?? displayName;
    const employeeId   = str(row, "Employee Number", "Employee ID", "Employee No");
    const employeePhone =
      str(row, "Mobile Number", "Phone Number", "Contact Number", "Mobile");
    const employeeDeptName = str(row, "Department");

    // Storage
    const storage =
      str(row, "Storage", "Storage Quota", "Storage Used", "Mailbox Size");

    const meta: Record<string, unknown> = { email };
    if (storage) meta.storage = storage;
    const plan = str(row, "Plan", "License", "Account Type");
    if (plan) meta.plan = plan;

    const asset: NormalizedAsset = {
      name:             `${displayName} — Email Account`,
      serialNumber:     null,
      assetTag:         null,
      computerName:     null,
      imeiNumber:       null,
      propertyTag:      null,
      macAddress:       null,
      brand:            "Zoho",
      model:            null,
      deviceType:       "Email Account",
      condition:        "usable",
      ownership:        "company",
      warrantyExpiry:   null,
      purchaseDate:     null,
      description:      null,
      metadata:         meta,
      employeeRef,
      employeeId,
      employeeName:     displayName,
      employeePhone,
      employeeDeptName,
      employeePosition: null,
      branchName,
      categoryHint:     "Email Accounts",
      sourceSheet,
      sourceRowIndex:   rowIndex,
    };

    results.push(asset);
  });

  return results;
}
