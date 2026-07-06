import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBelarc } from '../parseBelarc';
import { compareSpecs } from '../compare';
import type { ParsedSpecs } from '../types';

const fixture = readFileSync(join(__dirname, 'fixtures', 'carter.html'), 'utf-8');
const real = parseBelarc(fixture);

/** Deep-clone so mutations never leak between tests */
function clone(specs: ParsedSpecs): ParsedSpecs {
  return JSON.parse(JSON.stringify(specs)) as ParsedSpecs;
}

function setValue(specs: ParsedSpecs, section: string, key: string, value: string) {
  const field = specs.sections[section].fields.find((f) => f.key === key);
  if (!field) throw new Error(`no field ${key}`);
  field.value = value;
}

function removeField(specs: ParsedSpecs, section: string, keyPrefix: string) {
  const s = specs.sections[section];
  s.fields = s.fields.filter((f) => !f.key.startsWith(keyPrefix));
}

describe('compareSpecs — identical scans', () => {
  const result = compareSpecs(real, clone(real));

  it('is an overall match with no differences', () => {
    expect(result.overallStatus).toBe('match');
    expect(result.summary.mismatch).toBe(0);
    expect(result.summary.warning).toBe(0);
    expect(result.summary.missing).toBe(0);
    expect(result.summary.added).toBe(0);
    expect(result.summary.match).toBeGreaterThan(20);
  });

  it('never includes skip-tier fields', () => {
    for (const f of result.fields) {
      expect(['hard', 'soft']).toContain(f.tier);
    }
    expect(result.fields.some((f) => f.key === 'localStorage.freeSpace')).toBe(false);
    expect(result.fields.some((f) => f.key.endsWith('.lastLogon'))).toBe(false);
  });
});

describe('compareSpecs — hard-tier differences', () => {
  it('flags a changed drive serial as mismatch', () => {
    const scan = clone(real);
    setValue(scan, 'localStorage', 'localStorage.drive0.serial', 'SWAPPED000000');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('mismatch');
    const f = result.fields.find((x) => x.key === 'localStorage.drive0.serial');
    expect(f?.status).toBe('mismatch');
    expect(f?.baseline).toBe('BTKA1481124F512A');
    expect(f?.current).toBe('SWAPPED000000');
  });

  it('flags a changed RAM slot serial as mismatch', () => {
    const scan = clone(real);
    setValue(scan, 'memory', 'memory.slot1.serial', 'DEADBEEF');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('mismatch');
    expect(result.fields.find((x) => x.key === 'memory.slot1.serial')?.status).toBe('mismatch');
  });

  it('treats a removed RAM stick (missing hard fields) as mismatch', () => {
    const scan = clone(real);
    removeField(scan, 'memory', 'memory.slot1');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('mismatch');
    const missing = result.fields.filter((x) => x.key.startsWith('memory.slot1'));
    expect(missing.length).toBeGreaterThan(0);
    for (const f of missing) {
      expect(f.status).toBe('missing');
      expect(f.current).toBeNull();
    }
  });

  it('treats an unrecognized hard component (added) as mismatch', () => {
    const scan = clone(real);
    scan.sections.localStorage.fields.push({
      key: 'localStorage.drive1.serial',
      label: 'Drive 1 serial',
      value: 'NEWDRIVE123',
      tier: 'hard',
    });
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('mismatch');
    const f = result.fields.find((x) => x.key === 'localStorage.drive1.serial');
    expect(f?.status).toBe('added');
    expect(f?.baseline).toBeNull();
  });
});

describe('compareSpecs — soft-tier differences', () => {
  it('flags an OS version change as warning, not mismatch', () => {
    const scan = clone(real);
    setValue(scan, 'operatingSystem', 'operatingSystem.description',
      'Windows 11 Home Single Language (x64) Version 26H1 (build 27000.1)');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('warning');
    expect(result.fields.find((x) => x.key === 'operatingSystem.description')?.status).toBe('warning');
    expect(result.summary.mismatch).toBe(0);
  });

  it('flags an antivirus version change as warning (expected drift)', () => {
    const scan = clone(real);
    setValue(scan, 'virusProtection', 'virusProtection.product', 'Windows Defender Version 5.0.1.1');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('warning');
  });

  it('treats a removed soft field (unplugged monitor) as warning', () => {
    const scan = clone(real);
    removeField(scan, 'display', 'display.monitor1');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('warning');
    expect(result.fields.find((x) => x.key.startsWith('display.monitor1'))?.status).toBe('missing');
  });
});

describe('compareSpecs — skip-tier changes are ignored', () => {
  it('ignores free space, battery health, and last logon churn', () => {
    const scan = clone(real);
    setValue(scan, 'localStorage', 'localStorage.freeSpace', '1.02 Gigabytes Local Storage Free Space');
    const battery = scan.sections.mainBoard.fields.find((f) => f.key.startsWith('mainBoard.battery'));
    if (battery) battery.value = 'G513-3 | 6AS3GWZC3KC086878 | 42%';
    const logon = scan.sections.users.fields.find((f) => f.key.endsWith('.lastLogon'));
    if (logon) logon.value = '7/6/2026 9:00:00 AM';
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('match');
  });
});

describe('compareSpecs — mixed severity', () => {
  it('overall status is the worst across all fields', () => {
    const scan = clone(real);
    setValue(scan, 'operatingSystem', 'operatingSystem.description', 'Windows 12');
    setValue(scan, 'systemModel', 'systemModel.system_serial_number', 'FAKE-SERIAL');
    const result = compareSpecs(real, scan);
    expect(result.overallStatus).toBe('mismatch');
    expect(result.summary.warning).toBe(1);
    expect(result.summary.mismatch).toBe(1);
  });

  it('summary counts add up to total compared fields', () => {
    const scan = clone(real);
    setValue(scan, 'processor', 'processor.name', 'Intel Celeron');
    const result = compareSpecs(real, scan);
    const { match, warning, mismatch, missing, added } = result.summary;
    expect(match + warning + mismatch + missing + added).toBe(result.fields.length);
  });
});
