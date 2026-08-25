import { describe, expect, it } from 'vitest';
import { decryptBelarcHtml, encryptBelarcHtml, mergeItems, projectParsedSpecs } from '../../../routes/hardware-audit';
import type { ParsedSpecs } from '../types';

const parsed: ParsedSpecs = {
  version: 1,
  meta: { missingSections: [] },
  sections: {
    systemModel: { key: 'systemModel', name: 'System Model', fields: [
      { key: 'systemModel.model', label: 'System Model', value: 'Model X', tier: 'hard' },
      { key: 'systemModel.system_serial_number', label: 'Serial', value: 'SN-1', tier: 'hard' },
      { key: 'systemModel.asset_tag', label: 'Asset tag', value: 'AT-1', tier: 'soft' },
    ] },
    operatingSystem: { key: 'operatingSystem', name: 'OS', fields: [{ key: 'operatingSystem.description', label: 'OS', value: 'Windows 11', tier: 'soft' }] },
    processor: { key: 'processor', name: 'CPU', fields: [{ key: 'processor.name', label: 'CPU', value: 'CPU X', tier: 'hard' }] },
    memory: { key: 'memory', name: 'Memory', fields: [{ key: 'memory.total', label: 'RAM', value: '16 GB', tier: 'hard' }] },
    mainBoard: { key: 'mainBoard', name: 'Board', fields: [{ key: 'mainBoard.board', label: 'Board', value: 'Board X', tier: 'hard' }] },
    communications: { key: 'communications', name: 'Comms', fields: [
      { key: 'communications.adapter0.name', label: 'Adapter', value: 'Ethernet', tier: 'soft' },
      { key: 'communications.adapter0.mac', label: 'MAC', value: 'AA:BB:CC:DD:EE:FF', tier: 'hard' },
    ] },
  },
};

const asset = (value: string | null = null) => ({ name: value ?? '', serialNumber: value, macAddress: value, assetTag: value, metadata: value ? { os: value, processor: value, ram: value, motherboard: value } : null });

describe('Belarc asset merge policy', () => {
  it('encrypts and authenticates limited raw retention', () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptBelarcHtml('<html>safe</html>', key);
    expect(decryptBelarcHtml(encrypted.ciphertext, encrypted.iv, encrypted.tag, key)).toBe('<html>safe</html>');
    expect(() => decryptBelarcHtml(encrypted.ciphertext, encrypted.iv, encrypted.tag, Buffer.alloc(32, 8))).toThrow();
  });
  it('projects unsafe historical sections before API persistence/response', () => {
    const projected = projectParsedSpecs({ ...parsed, sections: { ...parsed.sections, users: { key: 'users', name: 'Users', fields: [{ key: 'users.account', label: 'Account', value: 'secret', tier: 'skip' }] } } });
    expect(projected.specs.sections.users).toBeUndefined();
    expect(projected.omittedUnsafeCount).toBeGreaterThanOrEqual(1);
  });
  it('marks every safe key apply when target fields are blank', () => {
    expect(mergeItems(parsed, asset()).filter((item) => item.state === 'apply').map((item) => item.key)).toEqual([
      'systemModel', 'systemSerial', 'os', 'processor', 'ram', 'motherboard', 'macAddress', 'assetTag',
    ]);
  });

  it('marks equal values verified, including the first MAC', () => {
    const result = mergeItems(parsed, { name: 'Model X', serialNumber: 'SN-1', macAddress: 'AA:BB:CC:DD:EE:FF', assetTag: 'AT-1', metadata: { os: 'Windows 11', processor: 'CPU X', ram: '16 GB', motherboard: 'Board X' } });
    expect(result.every((item) => item.state === 'verified')).toBe(true);
  });

  it('marks all differing nonblank values conflict and never apply', () => {
    const result = mergeItems(parsed, { name: 'Other', serialNumber: 'OTHER', macAddress: '11:22:33:44:55:66', assetTag: 'OTHER', metadata: { os: 'Other', processor: 'Other', ram: 'Other', motherboard: 'Other' } });
    expect(result.every((item) => item.state === 'conflict')).toBe(true);
  });

  it('retains empty official values without overwriting nonblank targets', () => {
    const emptyOfficial = structuredClone(parsed);
    emptyOfficial.sections.systemModel.fields = emptyOfficial.sections.systemModel.fields.map((field) => field.key === 'systemModel.asset_tag' ? { ...field, value: '' } : field);
    const result = mergeItems(emptyOfficial, { ...asset(), assetTag: 'existing-tag' });
    expect(result.find((item) => item.key === 'assetTag')?.state).toBe('conflict');
    expect(mergeItems(emptyOfficial, asset()).find((item) => item.key === 'assetTag')?.state).toBe('verified');
  });
});
