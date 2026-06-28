import type { NormalizedAsset } from "./types";
import { isEmptyAsset } from "./types";

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

function buildComputerMeta(row: Row): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  const proc = str(row, "Processor");
  if (proc) meta.processor = proc;

  // RAM — concatenate non-null slots
  const ramSlots: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const size = str(row, `RAM${i} Size`);
    if (size) ramSlots.push(size);
  }
  if (ramSlots.length) meta.ram = ramSlots.join(" + ");

  // Storage — concatenate non-null slots (handle "Storatge" typo)
  const storageSlots: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const type = str(row, `Storatge${i} Type`) ?? str(row, `Storage${i} Type`);
    const brand = str(row, `Storage${i} Brand`);
    const cap = str(row, `Storage${i} Capacity`);
    const parts = [type, brand, cap].filter(Boolean);
    if (parts.length) storageSlots.push(parts.join(" "));
  }
  if (storageSlots.length) meta.storage = storageSlots.join(", ");

  const os = str(row, "Operating System");
  if (os) meta.os = os;

  const osVer = str(row, "OS Version");
  if (osVer) meta.osVersion = osVer;

  const ip = str(row, "IP Address");
  if (ip) meta.ipAddress = ip;

  const gpu = str(row, "Graphics Adapter");
  if (gpu) meta.gpu = gpu;

  const battery = str(row, "Battery Health");
  if (battery) meta.batteryHealth = battery;

  const location = str(row, "Physical Location");
  if (location) meta.physicalLocation = location;

  return meta;
}

function employeeFields(row: Row) {
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
  return { employeeRef, employeeId, employeeName, employeePhone, employeeDeptName, employeePosition };
}

export function extractComputerAssets(
  rows: Row[],
  branchName: string | null,
  sourceSheet: string
): NormalizedAsset[] {
  const results: NormalizedAsset[] = [];

  rows.forEach((row, rowIndex) => {
    // Skip section-header / label rows: no employee AND no core computer fields.
    // These are formatting rows (e.g. "Computer Information" in the Asset Tag column)
    // that appear at the bottom of each branch sheet.
    const isLabelRow =
      !str(row, "Assigned User") &&
      !str(row, "Brand") &&
      !str(row, "Model") &&
      !str(row, "Serial Number") &&
      !str(row, "Computer Name") &&
      !str(row, "MAC Address");
    if (isLabelRow) return;

    const emp = employeeFields(row);
    const base = {
      employeeRef:      emp.employeeRef,
      employeeId:       emp.employeeId,
      employeeName:     emp.employeeName,
      employeePhone:    emp.employeePhone,
      employeeDeptName: emp.employeeDeptName,
      employeePosition: emp.employeePosition,
      branchName,
      sourceSheet,
      sourceRowIndex: rowIndex,
      ownership: "company",
    };

    // ── 1. Main computer ──────────────────────────────────────────────────────
    const brand     = str(row, "Brand");
    const model     = str(row, "Model");
    const serial    = str(row, "Serial Number");
    const assetTag  = str(row, "Asset Tag Number");
    const compName  = str(row, "Computer Name");
    const mac       = str(row, "MAC Address");
    const devType   = str(row, "Device Type");
    const devStatus = str(row, "Device Status");
    const warranty  = str(row, "Warranty Expiry");
    const purchase  = str(row, "Purchase Date");

    const computerAsset: NormalizedAsset = {
      ...base,
      name:          [brand, model].filter(Boolean).join(" ") || compName || "Computer",
      serialNumber:  serial,
      assetTag,
      computerName:  compName,
      imeiNumber:    null,
      propertyTag:   null,
      macAddress:    mac,
      brand,
      model,
      deviceType:    devType,
      condition:     devStatus ? mapCondition(devStatus) : "usable",
      warrantyExpiry: warranty,
      purchaseDate:   purchase,
      description:   null,
      metadata:      buildComputerMeta(row),
      categoryHint:  "Computers",
    };

    // Require at least one real computer field.
    // assetTag alone is NOT sufficient — section-header rows like
    // "Computer Information" in the Asset Tag column pass isEmptyAsset
    // but are not actual assets.
    const hasRealComputerData = !!(brand || model || serial || compName || mac);
    if (hasRealComputerData) {
      results.push(computerAsset);
    }

    // ── 2. Monitor 1 ──────────────────────────────────────────────────────────
    const mon1Brand  = str(row, "Monitor1 Brand");
    const mon1Model  = str(row, "Monitor1 Model");
    const mon1Serial = str(row, "Monitor1 Serial Number");
    const mon1Tag    = str(row, "Monitor1 Property Tag");

    if (mon1Brand || mon1Serial) { // tag alone is not enough (can be a section label)
      const mon1: NormalizedAsset = {
        ...base,
        name:          ["Monitor", mon1Brand, mon1Model].filter(Boolean).join(" "),
        serialNumber:  mon1Serial,
        assetTag:      null,
        computerName:  null,
        imeiNumber:    null,
        propertyTag:   mon1Tag,
        macAddress:    null,
        brand:         mon1Brand,
        model:         mon1Model,
        deviceType:    "Monitor",
        condition:     "usable",
        warrantyExpiry: null,
        purchaseDate:   null,
        description:   null,
        metadata:      null,
        categoryHint:  "Monitors",
        sourceRowIndex: rowIndex,
      };
      results.push(mon1);
    }

    // ── 3. Monitor 2 ──────────────────────────────────────────────────────────
    const mon2Brand  = str(row, "Monitor2 Brand");
    const mon2Model  = str(row, "Monitor2 Model");
    const mon2Serial = str(row, "Monitor2 Serial Number");
    const mon2Tag    = str(row, "Monitor2 Property Tag");

    if (mon2Brand || mon2Serial) { // tag alone is not enough
      const mon2: NormalizedAsset = {
        ...base,
        name:          ["Monitor", mon2Brand, mon2Model].filter(Boolean).join(" "),
        serialNumber:  mon2Serial,
        assetTag:      null,
        computerName:  null,
        imeiNumber:    null,
        propertyTag:   mon2Tag,
        macAddress:    null,
        brand:         mon2Brand,
        model:         mon2Model,
        deviceType:    "Monitor",
        condition:     "usable",
        warrantyExpiry: null,
        purchaseDate:   null,
        description:   null,
        metadata:      null,
        categoryHint:  "Monitors",
        sourceRowIndex: rowIndex,
      };
      results.push(mon2);
    }

    // ── 4. Keyboard ────────────────────────────────────────────────────────────
    const kbCount  = num(row, "Keyboard Count");
    const kbBrand  = str(row, "Keyboard Brand");
    const kbModel  = str(row, "Keyboard Model");
    const kbSerial = str(row, "Keyboard Serial Number");
    const kbTag    = str(row, "Keyboard Property Tag");

    if (kbCount > 0 || kbBrand || kbSerial) {
      const kb: NormalizedAsset = {
        ...base,
        name:          ["Keyboard", kbBrand, kbModel].filter(Boolean).join(" ") || "Keyboard",
        serialNumber:  kbSerial,
        assetTag:      null,
        computerName:  null,
        imeiNumber:    null,
        propertyTag:   kbTag,
        macAddress:    null,
        brand:         kbBrand,
        model:         kbModel,
        deviceType:    "Keyboard",
        condition:     "usable",
        warrantyExpiry: null,
        purchaseDate:   null,
        description:   null,
        metadata:      null,
        categoryHint:  "Peripherals",
        sourceRowIndex: rowIndex,
      };
      results.push(kb);
    }

    // ── 5. Mouse ───────────────────────────────────────────────────────────────
    const msCount  = num(row, "Mouse Count");
    const msBrand  = str(row, "Mouse Brand");
    const msModel  = str(row, "Mouse Model");
    const msSerial = str(row, "Mouse Serial Number");
    const msTag    = str(row, "Mouse Property Tag");

    if (msCount > 0 || msBrand || msSerial) {
      const ms: NormalizedAsset = {
        ...base,
        name:          ["Mouse", msBrand, msModel].filter(Boolean).join(" ") || "Mouse",
        serialNumber:  msSerial,
        assetTag:      null,
        computerName:  null,
        imeiNumber:    null,
        propertyTag:   msTag,
        macAddress:    null,
        brand:         msBrand,
        model:         msModel,
        deviceType:    "Mouse",
        condition:     "usable",
        warrantyExpiry: null,
        purchaseDate:   null,
        description:   null,
        metadata:      null,
        categoryHint:  "Peripherals",
        sourceRowIndex: rowIndex,
      };
      results.push(ms);
    }
  });

  return results;
}

function mapCondition(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["good", "working", "ok", "usable", "functional", "operational"].includes(v)) return "usable";
  if (["for repair", "repair", "broken", "defective", "damaged"].includes(v)) return "for_repair";
  if (["for disposal", "disposal", "condemned", "disposed", "obsolete"].includes(v)) return "for_disposal";
  return "usable";
}
