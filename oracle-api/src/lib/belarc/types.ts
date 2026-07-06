/**
 * Belarc Advisor HTML report parsing — shared types.
 *
 * The ParsedSpecs JSON shape is stored on HardwareScan.parsedSpecs (Phase B)
 * and diffed field-by-field by the comparison engine (Phase C). Field keys
 * must therefore be stable across scans of the same machine.
 */

/** Drives comparison behavior (Phase C):
 *  hard  → difference is a mismatch (red)
 *  soft  → difference is a warning (yellow)
 *  skip  → parsed for display, never compared
 */
export type VolatilityTier = 'hard' | 'soft' | 'skip';

export interface SpecField {
  /** Stable comparison key, e.g. "memory.slot0.serial" */
  key: string;
  /** Human-readable label, e.g. "DIMM 0 serial" */
  label: string;
  value: string;
  tier: VolatilityTier;
}

export interface ParsedSection {
  /** Canonical section key, e.g. "memory" */
  key: string;
  /** Belarc header text (footnote markers stripped), e.g. "Memory" */
  name: string;
  /** Empty when Belarc reports "None detected" */
  fields: SpecField[];
}

export interface ParsedSpecsMeta {
  computerName?: string;
  profileDate?: string;
  advisorVersion?: string;
  /** Canonical keys of recorded sections expected but absent from this export */
  missingSections: string[];
}

export interface ParsedSpecs {
  /** Schema version — bump if the field-key scheme changes */
  version: 1;
  sections: Record<string, ParsedSection>;
  meta: ParsedSpecsMeta;
}

/** Thrown when the input HTML has no Belarc .reportSection structure at all. */
export class NotABelarcReportError extends Error {
  constructor(message = 'File does not look like a Belarc Advisor report') {
    super(message);
    this.name = 'NotABelarcReportError';
  }
}
