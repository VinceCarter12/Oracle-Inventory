import { describe, expect, it } from 'vitest';
import { classifyExitCheck, isExitCheckBlocked, exitCheckMessage } from '../exitCheck';

describe('classifyExitCheck', () => {
  it('is not_required for assets without a baseline, regardless of scans', () => {
    expect(classifyExitCheck(false, null)).toBe('not_required');
    expect(classifyExitCheck(false, 'pending')).toBe('not_required');
    expect(classifyExitCheck(false, 'reviewed')).toBe('not_required');
    expect(classifyExitCheck(false, 'flagged')).toBe('not_required');
  });

  it('is missing when enrolled but no scan has been submitted', () => {
    expect(classifyExitCheck(true, null)).toBe('missing');
  });

  it('mirrors the latest scan status when enrolled', () => {
    expect(classifyExitCheck(true, 'pending')).toBe('pending');
    expect(classifyExitCheck(true, 'flagged')).toBe('flagged');
    expect(classifyExitCheck(true, 'reviewed')).toBe('cleared');
  });
});

describe('isExitCheckBlocked', () => {
  it('blocks missing, pending, and flagged', () => {
    expect(isExitCheckBlocked('missing')).toBe(true);
    expect(isExitCheckBlocked('pending')).toBe(true);
    expect(isExitCheckBlocked('flagged')).toBe(true);
  });

  it('allows cleared and not_required', () => {
    expect(isExitCheckBlocked('cleared')).toBe(false);
    expect(isExitCheckBlocked('not_required')).toBe(false);
  });
});

describe('exitCheckMessage', () => {
  it('names the asset and the required action for blocked states', () => {
    expect(exitCheckMessage('HP EliteBook', 'missing')).toContain('HP EliteBook');
    expect(exitCheckMessage('HP EliteBook', 'missing')).toContain('exit scan');
    expect(exitCheckMessage('HP EliteBook', 'pending')).toContain('awaiting admin review');
    expect(exitCheckMessage('HP EliteBook', 'flagged')).toContain('flagged');
  });

  it('is empty for non-blocked states', () => {
    expect(exitCheckMessage('HP EliteBook', 'cleared')).toBe('');
    expect(exitCheckMessage('HP EliteBook', 'not_required')).toBe('');
  });
});
