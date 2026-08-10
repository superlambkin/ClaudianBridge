import { describe, it, expect } from 'vitest';
import { getLocaleStrings, SUPPORTED_LOCALES } from '../../src/core/i18n';

describe('i18n', () => {
  it('3 言語すべてサポート', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ja', 'zh', 'en']);
  });
  it('ja は「一般」を含む', () => {
    expect(getLocaleStrings('ja').tabGeneral).toContain('一般');
  });
  it('en は "General" を含む', () => {
    expect(getLocaleStrings('en').tabGeneral).toContain('General');
  });
  it('zh は「一般」を含む', () => {
    expect(getLocaleStrings('zh').tabGeneral).toContain('一般');
  });
  it('office ラベルを 3 言語で持つ', () => {
    expect(getLocaleStrings('ja').officeEnabled).toContain('機能');
    expect(getLocaleStrings('en').officeEnabled).toContain('Enable');
    expect(getLocaleStrings('zh').officeEnabled).toContain('启用');
  });
  it('whitelist ラベルを 3 言語で持つ', () => {
    expect(getLocaleStrings('ja').whitelistEnabled).toContain('有効');
    expect(getLocaleStrings('en').whitelistEnabled).toContain('Enable');
    expect(getLocaleStrings('zh').whitelistEnabled).toContain('启用');
  });
});
