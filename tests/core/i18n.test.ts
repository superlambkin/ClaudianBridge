import { describe, it, expect } from 'vitest';
import { getLocaleStrings, getUILanguage, SUPPORTED_LOCALES } from '../../src/core/i18n';

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
  it('全タブのラベル・Notice・エンジン名を 3 言語で持つ', () => {
    const ja = getLocaleStrings('ja');
    const en = getLocaleStrings('en');
    const zh = getLocaleStrings('zh');
    expect(ja.noticeSaved).toContain('保存');
    expect(en.noticeSaved).toContain('Saved');
    expect(zh.noticeSaved).toContain('保存');
    expect(en.generalEnabled).toContain('Enable');
    expect(zh.selectionDelayMs).toContain('延迟');
    expect(ja.ttsEngine).toContain('エンジン');
    expect(en.ttsEngineAuto).toContain('Auto');
    expect(zh.ttsMinimaxHeading).toContain('MiniMax');
    expect(ja.whitelistOptionsHeading).toContain('オプション');
    expect(en.whitelistAllFilesShown).toContain('All files');
  });
  it('getUILanguage はロケール文字列から判定する', () => {
    expect(getUILanguage('ja')).toBe('ja');
    expect(getUILanguage('ja-JP')).toBe('ja');
    expect(getUILanguage('zh-cn')).toBe('zh');
    expect(getUILanguage('zh-TW')).toBe('zh');
    expect(getUILanguage('en')).toBe('en');
    expect(getUILanguage('en-US')).toBe('en');
    expect(getUILanguage(undefined)).toBe('en');
    expect(getUILanguage('fr')).toBe('en');
  });
});
