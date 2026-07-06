import type { VolatilityTier } from './types';

/**
 * Registry of the 21 recorded sections from a Belarc "Computer Profile".
 *
 * `header` is the section's <h2 class="reportSectionHeader"> text after
 * footnote markers are stripped ("Processor a" → "Processor").
 *
 * `defaultTier` applies to generically-extracted fields; sections with a
 * custom extractor in parseBelarc.ts assign tiers per field.
 *
 * Sections present in Belarc exports but deliberately NOT recorded (too
 * volatile — would flood comparisons with noise): Missing Security Updates,
 * Software Versions and Usage, Installed Microsoft Hotfixes, USB Storage Use.
 */
export interface SectionDef {
  key: string;
  header: string;
  defaultTier: VolatilityTier;
}

export const RECORDED_SECTIONS: SectionDef[] = [
  { key: 'operatingSystem', header: 'Operating System', defaultTier: 'soft' },
  { key: 'systemModel', header: 'System Model', defaultTier: 'hard' },
  { key: 'processor', header: 'Processor', defaultTier: 'hard' },
  { key: 'mainBoard', header: 'Main Circuit Board', defaultTier: 'hard' },
  { key: 'localStorage', header: 'Local Storage', defaultTier: 'hard' },
  { key: 'memory', header: 'Memory', defaultTier: 'hard' },
  { key: 'storageVolumes', header: 'Local Storage Volumes', defaultTier: 'soft' },
  { key: 'networkStorage', header: 'Network Storage Volumes', defaultTier: 'soft' },
  { key: 'users', header: 'Users', defaultTier: 'soft' },
  { key: 'printers', header: 'Printers', defaultTier: 'soft' },
  { key: 'display', header: 'Display', defaultTier: 'hard' },
  { key: 'multimedia', header: 'Multimedia', defaultTier: 'soft' },
  { key: 'controllers', header: 'Controllers', defaultTier: 'soft' },
  { key: 'busAdapters', header: 'Bus Adapters', defaultTier: 'soft' },
  { key: 'virusProtection', header: 'Virus Protection', defaultTier: 'soft' },
  { key: 'groupPolicies', header: 'Group Policies', defaultTier: 'soft' },
  { key: 'communications', header: 'Communications', defaultTier: 'soft' },
  { key: 'otherDevices', header: 'Other Devices', defaultTier: 'soft' },
  { key: 'hostedVMs', header: 'Hosted Virtual Machines', defaultTier: 'soft' },
  { key: 'networkMap', header: 'Network Map', defaultTier: 'skip' },
  { key: 'softwareLicenses', header: 'Software Licenses', defaultTier: 'hard' },
];

const byHeader = new Map(RECORDED_SECTIONS.map((s) => [s.header.toLowerCase(), s]));

/** Strip Belarc footnote markers: "Processor a" → "Processor", "Memory c,d" → "Memory" */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+[a-z](,\s*[a-z])*$/, '');
}

export function findSectionDef(rawHeader: string): SectionDef | undefined {
  return byHeader.get(normalizeHeader(rawHeader).toLowerCase());
}
