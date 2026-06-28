/** A single asset record normalized from any sheet type */
export interface NormalizedAsset {
  // Asset identity
  name: string;
  serialNumber: string | null;
  assetTag: string | null;
  computerName: string | null;
  imeiNumber: string | null;
  propertyTag: string | null;
  macAddress: string | null;
  brand: string | null;
  model: string | null;
  deviceType: string | null;
  condition: string;
  ownership: string;
  warrantyExpiry: string | null;
  purchaseDate: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;

  // Employee linkage
  employeeRef: string | null;      // "Assigned User" — used to match DB employee
  employeeId: string | null;       // "Employee Number" — numeric ID
  employeeName: string | null;     // Surname + First Name composite
  employeePhone: string | null;     // Mobile/phone number from workbook
  employeeDeptName: string | null;  // Department name from workbook
  employeePosition: string | null;  // Job title/position from workbook

  // Sheet context
  branchName: string | null;
  categoryHint: string;         // "Computers" | "Company Phones" | "Monitors" | "Peripherals"
  sourceSheet: string;
  sourceRowIndex: number;
}

export function isEmptyAsset(a: NormalizedAsset): boolean {
  return (
    !a.serialNumber &&
    !a.assetTag &&
    !a.computerName &&
    !a.imeiNumber &&
    !a.propertyTag &&
    !a.macAddress &&
    !a.brand &&
    !a.model
  );
}
