import { FieldMapping } from "./mapper";

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidatedRow {
  rowIndex: number;
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  isValid: boolean;
  hasWarnings: boolean;
}

// Required field groups per category.
// Each inner array is an OR group — at least one field in the group must be present.
const REQUIRED_BY_CATEGORY: Record<string, string[][]> = {
  "Computers":       [["name"], ["assetTag", "serialNumber", "meta.computerName"]],
  "Laptops":         [["name"], ["assetTag", "serialNumber", "meta.computerName"]],
  "Desktops":        [["name"], ["assetTag", "serialNumber", "meta.computerName"]],
  "Company Phones":  [["name"], ["serialNumber", "meta.imeiNumber", "propertyTag"]],
  "Email Accounts":  [["name", "meta.email"]],
  "Monitors":        [["name"], ["assetTag", "serialNumber"]],
  "Printers":        [["name"], ["assetTag", "serialNumber"]],
  "Network Devices": [["name"], ["assetTag", "serialNumber", "meta.macAddress"]],
  "Peripherals":     [["name"]],
  "Accessories":     [["name"]],
};

const CONDITION_MAP: Record<string, string> = {
  good: "usable", working: "usable", ok: "usable", operational: "usable",
  usable: "usable", serviceable: "usable", functional: "usable",
  "for repair": "for_repair", repair: "for_repair", broken: "for_repair",
  defective: "for_repair", damaged: "for_repair",
  "for disposal": "for_disposal", disposal: "for_disposal", condemned: "for_disposal",
  disposed: "for_disposal", obsolete: "for_disposal",
};

const OWNERSHIP_MAP: Record<string, string> = {
  company: "company", "company-owned": "company", owned: "company",
  personal: "personal", byod: "personal",
};

function getNestedValue(mapped: Record<string, unknown>, path: string): unknown {
  if (path.startsWith("meta.")) {
    const key = path.slice(5);
    return (mapped.metadata as Record<string, unknown> | null)?.[key];
  }
  return mapped[path];
}

export function validateRows(
  rows: Record<string, unknown>[],
  mappings: FieldMapping[],
  category: string,
  ingestUnmappedAsMetadata = false
): ValidatedRow[] {
  const mappedCols = new Set(mappings.map((m) => m.fileColumn));

  return rows.map((raw, i) => {
    const mapped: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};

    // Apply column mappings
    for (const m of mappings) {
      const val = raw[m.fileColumn];
      const isEmpty = val === null || val === "" || val === undefined;
      if (isEmpty) continue; // empty cells → skip (PATCH semantics)

      if (m.isMetadata && m.metadataKey) {
        metadata[m.metadataKey] = val;
      } else {
        mapped[m.systemField] = val;
      }
    }

    // Ingest unmapped columns as metadata with normalized snake_case keys
    if (ingestUnmappedAsMetadata) {
      for (const [col, val] of Object.entries(raw)) {
        if (mappedCols.has(col)) continue;
        if (val === null || val === "" || val === undefined) continue;
        const snakeKey = col
          .toLowerCase()
          .replace(/[\s\-./]+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
          .replace(/^_+|_+$/g, "");
        if (snakeKey && !(snakeKey in metadata)) {
          metadata[snakeKey] = val;
        }
      }
    }

    if (Object.keys(metadata).length > 0) mapped.metadata = metadata;

    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // ── Required fields ─────────────────────────────────────────────────────
    const reqs = REQUIRED_BY_CATEGORY[category] ?? [["name"]];
    for (const group of reqs) {
      const satisfied = group.some((f) => {
        const v = getNestedValue(mapped, f);
        return v !== null && v !== undefined && v !== "";
      });
      if (!satisfied) {
        errors.push({
          field: group.join(" or "),
          message: `Required: ${group.join(" or ")}`,
          severity: "error",
        });
      }
    }

    // ── Date fields ──────────────────────────────────────────────────────────
    for (const field of ["warrantyExpiry", "nextMaintenanceDate"]) {
      if (mapped[field]) {
        const d = new Date(String(mapped[field]));
        if (isNaN(d.getTime())) {
          errors.push({ field, message: `Invalid date: "${mapped[field]}"`, severity: "error" });
          delete mapped[field];
        } else {
          mapped[field] = d.toISOString();
        }
      }
    }

    // ── Condition normalisation ───────────────────────────────────────────────
    if (mapped.condition) {
      const raw_c = String(mapped.condition).toLowerCase().trim();
      const normalised = CONDITION_MAP[raw_c];
      if (normalised) {
        mapped.condition = normalised;
      } else {
        warnings.push({
          field: "condition",
          message: `Unknown condition "${mapped.condition}", defaulting to "usable"`,
          severity: "warning",
        });
        mapped.condition = "usable";
      }
    }

    // ── Ownership normalisation ──────────────────────────────────────────────
    if (mapped.ownership) {
      const raw_o = String(mapped.ownership).toLowerCase().trim();
      mapped.ownership = OWNERSHIP_MAP[raw_o] ?? "company";
    }

    // ── No unique identifier warning ─────────────────────────────────────────
    const hasUniqueId =
      mapped.assetTag ||
      mapped.serialNumber ||
      mapped.propertyTag ||
      (mapped.metadata as Record<string, unknown> | undefined)?.imeiNumber ||
      (mapped.metadata as Record<string, unknown> | undefined)?.computerName;

    if (!hasUniqueId) {
      warnings.push({
        field: "identifier",
        message: "No unique identifier (assetTag, serialNumber, IMEI, propertyTag, computerName). Duplicate detection will be unavailable for this row.",
        severity: "warning",
      });
    }

    return {
      rowIndex: i,
      rawData: raw,
      mappedData: mapped,
      errors,
      warnings,
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
    };
  });
}
