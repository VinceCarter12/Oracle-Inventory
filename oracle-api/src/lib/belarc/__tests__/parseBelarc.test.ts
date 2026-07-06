import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBelarc } from '../parseBelarc';
import { NotABelarcReportError, type SpecField } from '../types';
import { RECORDED_SECTIONS, normalizeHeader } from '../sections';

const fixture = readFileSync(join(__dirname, 'fixtures', 'carter.html'), 'utf-8');

const specs = parseBelarc(fixture);

function fieldsOf(sectionKey: string): SpecField[] {
  return specs.sections[sectionKey]?.fields ?? [];
}

function byKey(sectionKey: string, fieldKey: string): SpecField | undefined {
  return fieldsOf(sectionKey).find((f) => f.key === fieldKey);
}

describe('parseBelarc — real Belarc export (ASUS ROG Strix G513IC)', () => {
  it('detects all 21 recorded sections', () => {
    for (const def of RECORDED_SECTIONS) {
      expect(specs.sections[def.key], `section ${def.key}`).toBeDefined();
    }
    expect(specs.meta.missingSections).toEqual([]);
  });

  it('does not record the volatile sections', () => {
    const keys = Object.keys(specs.sections);
    expect(keys).toHaveLength(RECORDED_SECTIONS.length);
    // Missing Security Updates / Software Versions / Hotfixes / USB Storage Use
    for (const fields of Object.values(specs.sections).map((s) => s.fields)) {
      for (const f of fields) {
        expect(f.value).not.toMatch(/Security Bulletin/);
        expect(f.value).not.toMatch(/KB\d{7}/);
      }
    }
  });

  it('extracts report meta from the header', () => {
    expect(specs.meta.computerName).toBe('Carter (in WORKGROUP)');
    expect(specs.meta.profileDate).toContain('July 6, 2026');
    expect(specs.meta.advisorVersion).toBe('13.1');
  });

  it('extracts system model with hard-tier serials', () => {
    const model = byKey('systemModel', 'systemModel.model');
    expect(model?.value).toContain('ROG Strix G513IC');
    expect(model?.tier).toBe('hard');

    const serial = byKey('systemModel', 'systemModel.system_serial_number');
    expect(serial?.value).toBe('N1NRKD002803016');
    expect(serial?.tier).toBe('hard');
  });

  it('extracts processor name as hard, details as soft', () => {
    const cpu = byKey('processor', 'processor.name');
    expect(cpu?.value).toContain('AMD Ryzen 7 4800H');
    expect(cpu?.tier).toBe('hard');
    expect(fieldsOf('processor').filter((f) => f.tier === 'soft').length).toBeGreaterThan(0);
  });

  it('extracts main board serial as hard and batteries as skip', () => {
    expect(byKey('mainBoard', 'mainBoard.serial')?.value).toBe('A571ZMC002C');
    expect(byKey('mainBoard', 'mainBoard.serial')?.tier).toBe('hard');
    const batteries = fieldsOf('mainBoard').filter((f) => f.key.startsWith('mainBoard.battery'));
    expect(batteries.length).toBeGreaterThan(0);
    for (const b of batteries) expect(b.tier).toBe('skip');
  });

  it('extracts both RAM slots with serials as hard', () => {
    expect(byKey('memory', 'memory.total')?.tier).toBe('hard');
    expect(byKey('memory', 'memory.slot0.serial')?.value).toBe('2753D93E');
    expect(byKey('memory', 'memory.slot1.serial')?.value).toBe('7C701F98');
    expect(byKey('memory', 'memory.slot0.size')?.value).toBe('16 GB');
    for (const key of ['memory.slot0.serial', 'memory.slot1.serial', 'memory.slot0.size']) {
      expect(byKey('memory', key)?.tier).toBe('hard');
    }
  });

  it('extracts internal drive serial as hard, free space and USB drives as skip', () => {
    expect(byKey('localStorage', 'localStorage.drive0.model')?.value).toBe('INTEL SSDPEKNU512GZ');
    expect(byKey('localStorage', 'localStorage.drive0.serial')?.value).toBe('BTKA1481124F512A');
    expect(byKey('localStorage', 'localStorage.drive0.serial')?.tier).toBe('hard');
    expect(byKey('localStorage', 'localStorage.freeSpace')?.tier).toBe('skip');

    const usb = fieldsOf('localStorage').filter((f) => f.key.startsWith('localStorage.usbDrive'));
    expect(usb.length).toBeGreaterThan(0);
    for (const drive of usb) expect(drive.tier).toBe('skip');
  });

  it('extracts storage volumes with free space skipped', () => {
    expect(byKey('storageVolumes', 'storageVolumes.volume0.name')?.value).toBe('c: (NTFS on drive 0)');
    expect(byKey('storageVolumes', 'storageVolumes.volume0.free')?.tier).toBe('skip');
    expect(byKey('storageVolumes', 'storageVolumes.volume0.flags')?.value).toContain('BitLocker');
  });

  it('extracts user accounts as soft with last logon skipped', () => {
    const accounts = fieldsOf('users').filter((f) => /^users\.account\d+$/.test(f.key));
    expect(accounts.some((f) => f.value.includes('vince'))).toBe(true);
    for (const a of accounts) expect(a.tier).toBe('soft');
    const logons = fieldsOf('users').filter((f) => f.key.endsWith('.lastLogon'));
    expect(logons.length).toBeGreaterThan(0);
    for (const l of logons) expect(l.tier).toBe('skip');
  });

  it('extracts display adapters as hard, monitors as soft', () => {
    const adapters = fieldsOf('display').filter((f) => f.key.startsWith('display.adapter'));
    expect(adapters.map((f) => f.value)).toContain('NVIDIA GeForce RTX 3050 Laptop GPU');
    for (const a of adapters) expect(a.tier).toBe('hard');
    const monitors = fieldsOf('display').filter((f) => f.key.startsWith('display.monitor'));
    expect(monitors.length).toBeGreaterThan(0);
    for (const m of monitors) expect(m.tier).toBe('soft');
  });

  it('extracts adapter MACs as hard and drops DHCP/IP churn', () => {
    const macs = fieldsOf('communications').filter((f) => f.key.endsWith('.mac'));
    expect(macs.map((f) => f.value)).toContain('14:13:33:01:E0:80');
    for (const m of macs) expect(m.tier).toBe('hard');
    for (const f of fieldsOf('communications')) {
      expect(f.value).not.toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/); // no IPs recorded
    }
  });

  it('classifies antivirus as soft (expected version drift)', () => {
    const av = byKey('virusProtection', 'virusProtection.product');
    expect(av?.value).toContain('Windows Defender');
    expect(av?.tier).toBe('soft');
  });

  it('extracts software licenses as hard key-value pairs', () => {
    const licenses = fieldsOf('softwareLicenses');
    const asus = licenses.find((f) => f.label === 'ASUS - Config');
    expect(asus?.value).toBe('N1NRKD002803016');
    for (const l of licenses) expect(l.tier).toBe('hard');
  });

  it('treats "None detected" sections as present with no fields', () => {
    for (const key of ['networkStorage', 'controllers', 'groupPolicies', 'hostedVMs']) {
      expect(specs.sections[key]).toBeDefined();
      expect(specs.sections[key].fields).toEqual([]);
    }
  });

  it('marks the whole network map as skip', () => {
    for (const f of fieldsOf('networkMap')) expect(f.tier).toBe('skip');
  });

  it('every field carries a valid tier and non-empty key', () => {
    for (const section of Object.values(specs.sections)) {
      for (const f of section.fields) {
        expect(['hard', 'soft', 'skip']).toContain(f.tier);
        expect(f.key.startsWith(`${section.key}.`)).toBe(true);
        expect(f.value.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('parseBelarc — degraded inputs', () => {
  it('rejects HTML that is not a Belarc report', () => {
    expect(() => parseBelarc('<html><body><h1>Invoice</h1></body></html>')).toThrow(
      NotABelarcReportError,
    );
    expect(() => parseBelarc('plain text, not even html')).toThrow(NotABelarcReportError);
  });

  it('reports removed sections in meta.missingSections', () => {
    // Chop out the Memory section (header + body) from the fixture
    // Header carries footnote markers as <sup> tags: "Memory <sup>c,d</sup>"
    const mutilated = fixture.replace(
      /<h2 class="reportSectionHeader[^"]*">\s*Memory[\s\S]*?<\/h2>\s*<div class="reportSectionBody">[\s\S]*?<\/div>/,
      '',
    );
    const parsed = parseBelarc(mutilated);
    expect(parsed.meta.missingSections).toContain('memory');
    expect(parsed.meta.missingSections).not.toContain('processor');
  });
});

describe('normalizeHeader', () => {
  it('strips Belarc footnote markers', () => {
    expect(normalizeHeader('Processor a')).toBe('Processor');
    expect(normalizeHeader('Memory c,d')).toBe('Memory');
    expect(normalizeHeader('Main Circuit Board b')).toBe('Main Circuit Board');
    expect(normalizeHeader('Operating System')).toBe('Operating System');
  });
});
