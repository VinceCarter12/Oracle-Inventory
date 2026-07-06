import type { ParsedSpecs, SpecField, VolatilityTier } from './types';

/**
 * Field-by-field diff of a new scan against the asset's baseline scan.
 *
 * Volatility tiers drive severity:
 *   hard  → any difference is a mismatch (red)
 *   soft  → any difference is a warning (yellow)
 *   skip  → never compared (free space, last logins, DHCP IPs, ...)
 *
 * Fields present in the baseline but absent from the scan are `missing`
 * (e.g. a removed RAM stick drops its slot keys entirely); fields new in the
 * scan are `added` (e.g. an unrecognized drive). Both escalate by tier.
 */

export type FieldComparisonStatus = 'match' | 'warning' | 'mismatch' | 'missing' | 'added';
export type OverallStatus = 'match' | 'warning' | 'mismatch';

export interface FieldComparison {
  key: string;
  label: string;
  /** Canonical section key, e.g. "memory" */
  section: string;
  tier: Exclude<VolatilityTier, 'skip'>;
  baseline: string | null;
  current: string | null;
  status: FieldComparisonStatus;
}

export interface ComparisonSummary {
  match: number;
  warning: number;
  mismatch: number;
  missing: number;
  added: number;
}

export interface ComparisonResult {
  /** Schema version — bump if the shape changes */
  version: 1;
  overallStatus: OverallStatus;
  summary: ComparisonSummary;
  /** Non-skip fields only; skip-tier data stays in parsedSpecs for display */
  fields: FieldComparison[];
}

interface FlatField {
  section: string;
  field: SpecField;
}

function flatten(specs: ParsedSpecs): Map<string, FlatField> {
  const map = new Map<string, FlatField>();
  for (const section of Object.values(specs.sections)) {
    for (const field of section.fields) {
      if (field.tier === 'skip') continue;
      map.set(field.key, { section: section.key, field });
    }
  }
  return map;
}

/** Severity a field contributes to the overall status. */
function severity(status: FieldComparisonStatus, tier: 'hard' | 'soft'): OverallStatus {
  if (status === 'match') return 'match';
  if (status === 'mismatch') return 'mismatch';
  if (status === 'warning') return 'warning';
  // missing / added — a vanished or unrecognized hard component is the
  // strongest swap/theft signal there is
  return tier === 'hard' ? 'mismatch' : 'warning';
}

const RANK: Record<OverallStatus, number> = { match: 0, warning: 1, mismatch: 2 };

export function compareSpecs(baseline: ParsedSpecs, current: ParsedSpecs): ComparisonResult {
  const bFields = flatten(baseline);
  const cFields = flatten(current);

  const fields: FieldComparison[] = [];

  for (const [key, b] of bFields) {
    const tier = b.field.tier as 'hard' | 'soft';
    const c = cFields.get(key);
    if (!c) {
      fields.push({
        key,
        label: b.field.label,
        section: b.section,
        tier,
        baseline: b.field.value,
        current: null,
        status: 'missing',
      });
      continue;
    }
    const same = b.field.value === c.field.value;
    fields.push({
      key,
      label: b.field.label || c.field.label,
      section: b.section,
      tier,
      baseline: b.field.value,
      current: c.field.value,
      status: same ? 'match' : tier === 'hard' ? 'mismatch' : 'warning',
    });
  }

  for (const [key, c] of cFields) {
    if (bFields.has(key)) continue;
    fields.push({
      key,
      label: c.field.label,
      section: c.section,
      tier: c.field.tier as 'hard' | 'soft',
      baseline: null,
      current: c.field.value,
      status: 'added',
    });
  }

  const summary: ComparisonSummary = { match: 0, warning: 0, mismatch: 0, missing: 0, added: 0 };
  let overall: OverallStatus = 'match';
  for (const f of fields) {
    summary[f.status]++;
    const s = severity(f.status, f.tier);
    if (RANK[s] > RANK[overall]) overall = s;
  }

  return { version: 1, overallStatus: overall, summary, fields };
}
