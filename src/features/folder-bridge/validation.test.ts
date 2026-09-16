import { describe, it, expect } from 'vitest';
import nodePath from 'path';
import {
  validateExternalPath,
  validateExcludePatterns,
  validateShadowPath,
  computeDefaultShadowPath,
} from './validation';

describe('validateExternalPath', () => {
  it('accepts UNC path', () => {
    expect(validateExternalPath('\\\\NAS\\share\\OCR')).toEqual({
      ok: true,
      normalized: '\\\\NAS\\share\\OCR',
    });
  });
  it('accepts absolute Windows path', () => {
    expect(validateExternalPath('C:\\projects\\docs')).toEqual({
      ok: true,
      normalized: 'C:\\projects\\docs',
    });
  });
  it('rejects empty', () => {
    expect(validateExternalPath('')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects relative path', () => {
    expect(validateExternalPath('foo\\bar')).toEqual({ ok: false, reason: 'not_absolute' });
  });
  it('trims whitespace', () => {
    expect(validateExternalPath('  C:\\foo  ')).toEqual({ ok: true, normalized: 'C:\\foo' });
  });
});

describe('validateExcludePatterns', () => {
  it('accepts empty array', () => {
    expect(validateExcludePatterns([])).toEqual({ ok: true, normalized: [] });
  });
  it('accepts glob patterns', () => {
    expect(validateExcludePatterns(['*.tmp', '.DS_Store'])).toEqual({
      ok: true,
      normalized: ['*.tmp', '.DS_Store'],
    });
  });
  it('rejects non-array', () => {
    expect(validateExcludePatterns('*.tmp' as any)).toEqual({ ok: false, reason: 'not_array' });
  });
  it('rejects pattern with null byte', () => {
    expect(validateExcludePatterns(['foo\u0000bar'])).toEqual({ ok: false, reason: 'invalid_glob' });
  });
  it('trims patterns', () => {
    expect(validateExcludePatterns(['  *.tmp  '])).toEqual({
      ok: true,
      normalized: ['*.tmp'],
    });
  });
});

describe('validateShadowPath', () => {
  it('accepts default shadow path', () => {
    const r = validateShadowPath('.obsidian/cache/folder-bridge/abc', 'C:\\Vault');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.replace(/\\/g, '/')).toBe('.obsidian/cache/folder-bridge/abc');
  });
  it('rejects absolute outside vault', () => {
    expect(validateShadowPath('C:\\other\\path', 'C:\\Vault')).toEqual({
      ok: false,
      reason: 'absolute_outside_vault',
    });
  });
  it('rejects empty', () => {
    expect(validateShadowPath('', 'C:\\Vault')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects .. traversal', () => {
    expect(validateShadowPath('../../etc', 'C:\\Vault')).toEqual({
      ok: false,
      reason: 'not_relative',
    });
  });
});

describe('computeDefaultShadowPath', () => {
  it('produces path under .obsidian/cache', () => {
    const r = computeDefaultShadowPath('C:\\Vault', 'bridge-123');
    expect(r.replace(/\\/g, '/')).toBe('C:/Vault/.obsidian/cache/folder-bridge/bridge-123');
  });
});
