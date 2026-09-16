import { describe, it, expect } from 'vitest';
import {
  LINK_NAME_REGEX,
  validateLinkName,
  validateExternalPath,
  validateVaultSubpath,
} from './validation';
import type { FolderMapping } from './types';

const VAULT = 'C:\\Users\\me\\Vault';

const baseMapping = (overrides: Partial<FolderMapping> = {}): FolderMapping => ({
  id: 'id-1',
  linkName: 'ExternalDocs',
  externalPath: 'D:\\projects\\docs',
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('LINK_NAME_REGEX', () => {
  it('accepts ASCII', () => {
    expect(LINK_NAME_REGEX.test('ExternalDocs')).toBe(true);
  });
  it('accepts CJK', () => {
    expect(LINK_NAME_REGEX.test('外部資料')).toBe(true);
  });
  it('rejects empty', () => {
    expect(LINK_NAME_REGEX.test('')).toBe(false);
  });
  it('rejects slash', () => {
    expect(LINK_NAME_REGEX.test('foo/bar')).toBe(false);
  });
  it('rejects backslash', () => {
    expect(LINK_NAME_REGEX.test('foo\\bar')).toBe(false);
  });
  it('rejects 65 chars', () => {
    expect(LINK_NAME_REGEX.test('a'.repeat(65))).toBe(false);
  });
  it('accepts 64 chars', () => {
    expect(LINK_NAME_REGEX.test('a'.repeat(64))).toBe(true);
  });
});

describe('validateLinkName', () => {
  it('returns ok for unique valid name', () => {
    expect(validateLinkName('NewName', [])).toEqual({ ok: true });
  });
  it('rejects empty', () => {
    const r = validateLinkName('', []);
    expect(r.ok).toBe(false);
  });
  it('rejects duplicate', () => {
    const r = validateLinkName('ExternalDocs', [baseMapping()]);
    expect(r).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('validateExternalPath', () => {
  it('accepts absolute Windows path', () => {
    expect(validateExternalPath('D:\\projects\\docs', VAULT)).toEqual({ ok: true });
  });
  it('rejects empty', () => {
    expect(validateExternalPath('', VAULT)).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects relative', () => {
    expect(validateExternalPath('foo\\bar', VAULT)).toEqual({ ok: false, reason: 'not_absolute' });
  });
  it('rejects null byte', () => {
    expect(validateExternalPath('D:\\foo\0bar', VAULT)).toEqual({ ok: false, reason: 'null_byte' });
  });
  it('rejects vault itself', () => {
    expect(validateExternalPath(VAULT, VAULT)).toEqual({ ok: false, reason: 'circular' });
  });
  it('rejects vault ancestor', () => {
    expect(validateExternalPath('C:\\Users\\me', VAULT)).toEqual({ ok: false, reason: 'circular' });
  });
  it('rejects C:\\Windows', () => {
    expect(validateExternalPath('C:\\Windows\\System32', VAULT)).toEqual({ ok: false, reason: 'forbidden_path' });
  });
  it('rejects C:\\Program Files', () => {
    expect(validateExternalPath('C:\\Program Files\\app', VAULT)).toEqual({ ok: false, reason: 'forbidden_path' });
  });
});
describe('validateVaultSubpath', () => {
  it('accepts 10_Input and normalizes backslashes', () => {
    expect(validateVaultSubpath('10_Input')).toEqual({ ok: true, normalized: '10_Input' });
  });
  it('accepts nested a\\b\\c (forward-slash normalized)', () => {
    expect(validateVaultSubpath('a\\b\\c')).toEqual({ ok: true, normalized: 'a/b/c' });
  });
  it('rejects empty', () => {
    expect(validateVaultSubpath('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateVaultSubpath('/')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects .. traversal', () => {
    expect(validateVaultSubpath('a/../b')).toEqual({ ok: false, reason: 'not_relative' });
  });
  it('rejects absolute path', () => {
    expect(validateVaultSubpath('C:\\Temp')).toEqual({ ok: false, reason: 'not_relative' });
    expect(validateVaultSubpath('/tmp')).toEqual({ ok: false, reason: 'not_relative' });
  });
  it('rejects dot folder', () => {
    expect(validateVaultSubpath('.obsidian')).toEqual({ ok: false, reason: 'dot_folder' });
  });
  it('rejects @ prefix', () => {
    expect(validateVaultSubpath('@10_Input')).toEqual({ ok: false, reason: 'forbidden_prefix' });
  });
  it('rejects invalid segment chars', () => {
    expect(validateVaultSubpath('a:b')).toEqual({ ok: false, reason: 'invalid_segment' });
  });
});
