export interface FieldMapping {
  fileColumn: string;
  systemField: string;  // e.g. "name", "serialNumber", "branchName", "employeeRef", "metadata"
  isMetadata: boolean;
  metadataKey?: string; // key inside metadata JSON, e.g. "ram", "os", "imeiNumber"
  /** How the mapping was resolved: "alias" | "fuzzy" | "content" */
  matchMethod?: "alias" | "fuzzy" | "content";
  /** 0–1 confidence for this mapping (alias=1.0, fuzzy=score, content=0.75) */
  confidence?: number;
}

export interface MappingResult {
  mappings: FieldMapping[];
  unmapped: string[];
}

export interface EnhancedMappingResult extends MappingResult {
  /** Per-column confidence scores (0–1). */
  columnConfidences: Record<string, number>;
  /** Weighted average of all column confidences, 0–100. */
  autoConfidence: number;
  /** True when autoConfidence <90 or required field "name" is missing. */
  requiresManualMapping: boolean;
  /** Human-readable descriptions of content-inference decisions. */
  contentSignals: string[];
}

// ── Canonical system fields ───────────────────────────────────────────────────
const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    // cross-tab / quantity sheets
    "Items", "Item",
    // standard naming
    "Asset Name", "Device Name", "Item Name", "Name", "Asset",
    "Description of Item", "Item Description",
    "Product Name", "Product", "Device", "Hardware", "Equipment",
  ],
  serialNumber:  ["Serial Number", "S/N", "Serial No", "Serial No.", "Serial", "S/N Number", "SN"],
  assetTag:      ["Asset Tag", "Asset Tag Number", "Tag No", "Tag #", "Asset ID", "Tag Number", "Asset Tag No"],
  propertyTag:   ["Property Tag", "Property Number", "PT No", "PT #", "Property Tag Number", "Property Tag No"],
  warrantyExpiry:["Warranty Expiry", "Warranty End", "Warranty Date", "Expiry Date", "Warranty", "Warranty Until"],
  condition:     ["Condition", "Status", "Asset Status", "Asset Condition", "Item Condition"],
  ownership:     ["Ownership", "Owner", "Ownership Type", "Company/Personal"],
  branchName:    ["Branch", "Location", "Site", "Office", "Branch Name", "Branch/Location", "Area", "Department Location", "Work Location"],
  employeeRef:   [
    "Assigned User", "Assigned To", "Employee", "User", "Property Of", "Assigned Employee",
    "User Assigned", "Assigned To Employee", "User Name", "Employee Assigned", "Assignee",
    "Holder", "Responsible Person", "Owner Name",
  ],
  employeeId:       ["Employee ID", "Employee Number", "Staff ID", "Employee No", "Emp ID", "Staff No"],
  employeeDeptName: ["Department", "Dept", "Division", "Employee Department", "Staff Department", "Work Group"],
  employeePhone:    ["Mobile Number", "Mobile", "Phone Number", "Phone", "Contact Number", "Employee Phone", "Staff Phone", "Cell"],
  employeePosition: ["Position", "Job Title", "Title", "Designation", "Role", "Employee Position", "Job Position"],
  categoryHint:  ["Category", "Categories", "Asset Category", "Type", "Item Type", "Asset Type", "Device Category"],
  description:   ["Notes", "Remarks", "Comments", "Description", "Additional Notes", "Details"],
};

// ── Metadata fields ───────────────────────────────────────────────────────────
const METADATA_ALIASES: Record<string, string[]> = {
  computerName: ["Computer Name", "PC Name", "Hostname", "Machine Name", "Computer/Hostname", "Host Name"],
  macAddress:   ["MAC Address", "MAC", "Physical Address", "MAC Add", "MAC Addr", "Ethernet Address"],
  os:           ["Operating System", "OS", "OS Version", "Operating System Version", "OS Installed"],
  ram:          ["RAM", "Memory", "RAM Size", "Memory (GB)", "RAM (GB)", "Memory Size"],
  storage:      ["Storage", "HDD", "SSD", "Disk Size", "Storage (GB)", "Storage Capacity", "Hard Drive", "Hard Drive Size"],
  deviceType:   ["Device Type", "Form Factor", "Type", "Device Form Factor"],
  brand:        ["Brand", "Manufacturer", "Make", "Vendor", "Brand/Make"],
  model:        ["Model", "Model Name", "Model Number", "Device Model"],
  imeiNumber:   ["IMEI", "IMEI Number", "IMEI No", "IMEI No.", "IMEI#"],
  simInfo:      ["SIM", "SIM Info", "SIM Number", "SIM Details", "SIM Card", "SIM Card Number"],
  email:        ["Email Address", "Email", "Account Email", "Email Account", "Zoho Email", "Work Email", "Company Email"],
  mailboxSize:  ["Mailbox Size", "Storage Quota", "Storage Limit"],
};

/**
 * Normalize a header string for alias matching:
 * - Lowercase
 * - Collapse whitespace / underscores / dashes / dots / slashes → single space
 * - Strip remaining non-alphanumeric characters (e.g. "#", "(", ")")
 *
 * Examples: "S/N" → "s n", "MAC Address" → "mac address", "RAM (GB)" → "ram gb"
 */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[\s_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ── Levenshtein similarity (0–1) ─────────────────────────────────────────────
export function stringSimilarity(a: string, b: string): number {
  a = normalizeHeader(a); b = normalizeHeader(b);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const la = a.length, lb = b.length;
  const dp = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++)
    for (let j = 1; j <= lb; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[la][lb] / Math.max(la, lb);
}

// ── Fuzzy alias match (≥0.8 similarity) ─────────────────────────────────────
function fuzzyMatchField(header: string): {
  field: string; isMetadata: boolean; metadataKey?: string; score: number;
} | null {
  let best: { field: string; isMetadata: boolean; metadataKey?: string; score: number } | null = null;

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const score = stringSimilarity(header, alias);
      if (score >= 0.8 && (!best || score > best.score)) {
        best = { field, isMetadata: false, score };
      }
    }
  }

  for (const [key, aliases] of Object.entries(METADATA_ALIASES)) {
    for (const alias of aliases) {
      const score = stringSimilarity(header, alias);
      if (score >= 0.8 && (!best || score > best.score)) {
        best = { field: "metadata", isMetadata: true, metadataKey: key, score };
      }
    }
  }

  return best;
}

// ── Content inference from cell values ───────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPID_RE = /^\d{4,8}$|^[A-Z]{1,3}\d{3,6}$/i;
const CATEGORY_TOKENS = ["monitor", "cellphone", "laptop", "printer", "network", "accessories", "desktop", "peripheral", "computer", "phone", "tablet"];

interface InferredField {
  systemField: string;
  isMetadata: boolean;
  metadataKey?: string;
  confidence: number;
  signal: string;
}

export function inferColumnFromValues(
  header: string,
  values: unknown[],
  branches: { name: string }[] = []
): InferredField | null {
  const nonEmpty = values
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v).trim());
  if (nonEmpty.length === 0) return null;

  // Email detection (≥50% of values match email pattern)
  const emailCount = nonEmpty.filter((v) => EMAIL_RE.test(v)).length;
  if (emailCount / nonEmpty.length >= 0.5) {
    return {
      systemField: "metadata", isMetadata: true, metadataKey: "email",
      confidence: 0.75,
      signal: `"${header}" contains email addresses → metadata.email`,
    };
  }

  // Employee ID detection (≥60% match numeric/alpha-num employee code patterns)
  const empIdCount = nonEmpty.filter((v) => EMPID_RE.test(v)).length;
  if (empIdCount / nonEmpty.length >= 0.6) {
    return {
      systemField: "employeeId", isMetadata: false,
      confidence: 0.75,
      signal: `"${header}" contains employee IDs → employeeId`,
    };
  }

  // Branch detection (≥70% of values fuzzy-match a known branch at ≥0.85)
  if (branches.length > 0) {
    const branchCount = nonEmpty.filter((v) =>
      branches.some((b) => stringSimilarity(v, b.name) >= 0.85)
    ).length;
    if (branchCount / nonEmpty.length >= 0.7) {
      return {
        systemField: "branchName", isMetadata: false,
        confidence: 0.75,
        signal: `"${header}" contains branch names → branchName`,
      };
    }
  }

  // Category token detection (≥50% of values contain a category keyword)
  const catCount = nonEmpty.filter((v) =>
    CATEGORY_TOKENS.some((t) => v.toLowerCase().includes(t))
  ).length;
  if (catCount / nonEmpty.length >= 0.5) {
    return {
      systemField: "categoryHint", isMetadata: false,
      confidence: 0.70,
      signal: `"${header}" contains category tokens → categoryHint`,
    };
  }

  return null;
}

// ── mapColumns (existing, backward-compatible) ────────────────────────────────
export function mapColumns(headers: string[]): MappingResult {
  const mappings: FieldMapping[] = [];
  const unmapped: string[] = [];

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let matched = false;

    // Check system fields
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        mappings.push({ fileColumn: header, systemField: field, isMetadata: false });
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Check metadata fields
      for (const [key, aliases] of Object.entries(METADATA_ALIASES)) {
        if (aliases.some((a) => normalizeHeader(a) === norm)) {
          mappings.push({ fileColumn: header, systemField: "metadata", isMetadata: true, metadataKey: key });
          matched = true;
          break;
        }
      }
    }

    if (!matched) unmapped.push(header);
  }

  return { mappings, unmapped };
}

/**
 * Enhanced mapping with fuzzy header matching + content inference + confidence scores.
 *
 * Resolution order per column:
 *   1. Exact alias match     → confidence 1.0
 *   2. Fuzzy alias match ≥0.8 → confidence = similarity score
 *   3. Content inference      → confidence 0.70–0.75
 *   4. Unmapped               → confidence 0.0
 *
 * requiresManualMapping = true when autoConfidence < 90 OR "name" field not mapped.
 */
export function mapColumnsEnhanced(
  headers: string[],
  sampleRows: Record<string, unknown>[] = [],
  branches: { name: string }[] = []
): EnhancedMappingResult {
  const mappings: FieldMapping[] = [];
  const unmapped: string[] = [];
  const columnConfidences: Record<string, number> = {};
  const contentSignals: string[] = [];

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let matched = false;
    let confidence = 0;

    // 1. Exact alias match
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        mappings.push({ fileColumn: header, systemField: field, isMetadata: false, matchMethod: "alias", confidence: 1.0 });
        confidence = 1.0;
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const [key, aliases] of Object.entries(METADATA_ALIASES)) {
        if (aliases.some((a) => normalizeHeader(a) === norm)) {
          mappings.push({ fileColumn: header, systemField: "metadata", isMetadata: true, metadataKey: key, matchMethod: "alias", confidence: 1.0 });
          confidence = 1.0;
          matched = true;
          break;
        }
      }
    }

    // 2. Fuzzy alias match (≥0.8)
    if (!matched) {
      const fuzzy = fuzzyMatchField(header);
      if (fuzzy) {
        mappings.push({
          fileColumn: header,
          systemField: fuzzy.field,
          isMetadata: fuzzy.isMetadata,
          ...(fuzzy.metadataKey ? { metadataKey: fuzzy.metadataKey } : {}),
          matchMethod: "fuzzy",
          confidence: fuzzy.score,
        });
        confidence = fuzzy.score;
        matched = true;
      }
    }

    // 3. Content inference from sample rows
    if (!matched && sampleRows.length > 0) {
      const values = sampleRows.map((r) => r[header]);
      const inferred = inferColumnFromValues(header, values, branches);
      if (inferred) {
        mappings.push({
          fileColumn: header,
          systemField: inferred.systemField,
          isMetadata: inferred.isMetadata,
          ...(inferred.metadataKey ? { metadataKey: inferred.metadataKey } : {}),
          matchMethod: "content",
          confidence: inferred.confidence,
        });
        confidence = inferred.confidence;
        matched = true;
        contentSignals.push(inferred.signal);
      }
    }

    if (!matched) unmapped.push(header);
    columnConfidences[header] = confidence;
  }

  const total = headers.length;
  const avgConf = total > 0
    ? Object.values(columnConfidences).reduce((s, c) => s + c, 0) / total
    : 0;
  const autoConfidence = Math.round(avgConf * 100);
  const hasName = mappings.some((m) => !m.isMetadata && m.systemField === "name");
  const requiresManualMapping = autoConfidence < 90 || !hasName;

  return { mappings, unmapped, columnConfidences, autoConfidence, requiresManualMapping, contentSignals };
}

/**
 * Validate that required mappings are present before row-level validation.
 * Returns an array of user-facing error strings (empty = all good).
 * Currently enforces: name must be mapped.
 */
export function validateMappingCompleteness(mappings: FieldMapping[]): string[] {
  const errors: string[] = [];
  const hasName = mappings.some((m) => !m.isMetadata && m.systemField === "name");
  if (!hasName) {
    errors.push(
      "The 'name' column is not mapped — import cannot proceed. " +
      "Map a column like 'Items', 'Asset Name', or 'Name' to the Name field."
    );
  }
  return errors;
}

/** Apply a saved preset mapping, overriding auto-detected mappings. */
export function applyPreset(
  headers: string[],
  preset: Record<string, string>  // { fileColumn → systemField|metadata.key }
): MappingResult {
  const mappings: FieldMapping[] = [];
  const unmapped: string[] = [];

  for (const header of headers) {
    const target = preset[header];
    if (!target) { unmapped.push(header); continue; }

    if (target.startsWith("metadata.")) {
      mappings.push({ fileColumn: header, systemField: "metadata", isMetadata: true, metadataKey: target.slice(9) });
    } else {
      mappings.push({ fileColumn: header, systemField: target, isMetadata: false });
    }
  }
  return { mappings, unmapped };
}
