import { describe, it, expect } from 'vitest';
import { getLocaleStrings, getUILanguage, STRINGS, SUPPORTED_LOCALES } from '../../src/core/i18n';

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
    expect(zh.noticeSaved).toContain('已写入');
    expect(en.generalEnabled).toContain('Enable');
    expect(zh.selectionDelayMs).toContain('延迟');
    expect(ja.ttsEngine).toContain('エンジン');
    expect(en.ttsEngineEdge).toContain('edge-TTS');
    expect(zh.ttsEngineWebspeech).toContain('WebSpeech');
    expect(ja.ttsMinimaxRemovalNote).toContain('MiniMax');
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
  it('settingsTitle は全言語で "Claudian Bridge" のみ（タイトル重複なし）', () => {
    expect(getLocaleStrings('ja').settingsTitle).toBe('Claudian Bridge');
    expect(getLocaleStrings('en').settingsTitle).toBe('Claudian Bridge');
    expect(getLocaleStrings('zh').settingsTitle).toBe('Claudian Bridge');
  });
  it('tabGeneral は "🎛️" プレフィックスを持つ（他タブと統一）', () => {
    expect(getLocaleStrings('ja').tabGeneral.startsWith('🎛️')).toBe(true);
    expect(getLocaleStrings('en').tabGeneral.startsWith('🎛️')).toBe(true);
    expect(getLocaleStrings('zh').tabGeneral.startsWith('🎛️')).toBe(true);
  });
  it('zh STRINGS は日本語漢字を含まない', () => {
    const jaChars = ['設定','挿入','読み上げ','追加','削除','エンジン','有効化','拡張子','フォルダ','フォルダ','保存','失敗','テスト','プレースホルダ','リセット','オプション','全て','並び替え','ハイライト'];
    for (const key of Object.keys(STRINGS.zh) as Array<keyof typeof STRINGS.zh>) {
      const v = STRINGS.zh[key];
      if (typeof v !== 'string') continue;
      for (const c of jaChars) expect(v, `${key} contains ${c}`).not.toContain(c);
    }
  });
  it('selectionFolderEnabled は 3 言語で存在し、各言語のフォルダ表現を含む', () => {
    const ja = getLocaleStrings('ja').selectionFolderEnabled;
    const en = getLocaleStrings('en').selectionFolderEnabled;
    const zh = getLocaleStrings('zh').selectionFolderEnabled;
    expect(ja).toContain('フォルダ');
    expect(en.toLowerCase()).toContain('folder');
    expect(zh).toContain('文件夹');
  });
  it('selectionFolderEnabledDesc は 3 言語で存在する', () => {
    expect(getLocaleStrings('ja').selectionFolderEnabledDesc.length).toBeGreaterThan(0);
    expect(getLocaleStrings('en').selectionFolderEnabledDesc.length).toBeGreaterThan(0);
    expect(getLocaleStrings('zh').selectionFolderEnabledDesc.length).toBeGreaterThan(0);
  });
  it('ttsTestButton は 3 言語で存在する', () => {
    expect(getLocaleStrings('ja').ttsTestButton.length).toBeGreaterThan(0);
    expect(getLocaleStrings('en').ttsTestButton.length).toBeGreaterThan(0);
    expect(getLocaleStrings('zh').ttsTestButton.length).toBeGreaterThan(0);
  });
  it('ttsTestSample は UI 言語ごとに固有のサンプル文を持つ', () => {
    expect(getLocaleStrings('ja').ttsTestSample).toContain('今日');
    expect(getLocaleStrings('zh').ttsTestSample).toContain('今天');
    expect(getLocaleStrings('en').ttsTestSample).toContain('weather');
  });
  it('tabChroma は 3 言語で定義され Chroma ブラウザを示す', () => {
    expect(getLocaleStrings('ja').tabChroma).toContain('Chroma');
    expect(getLocaleStrings('en').tabChroma).toContain('Chroma');
    expect(getLocaleStrings('zh').tabChroma).toContain('Chroma');
  });
  it('tabChroma は mojibake (U+FFFD) を含まない', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const v = getLocaleStrings(lang).tabChroma;
      expect(v.includes('�'), `tabChroma[${lang}] contains U+FFFD: ${v}`).toBe(false);
    }
  });
  it('tabChroma は 🗄️ プレフィックスで始まる', () => {
    expect(getLocaleStrings('ja').tabChroma.startsWith('🗄️')).toBe(true);
    expect(getLocaleStrings('en').tabChroma.startsWith('🗄️')).toBe(true);
    expect(getLocaleStrings('zh').tabChroma.startsWith('🗄️')).toBe(true);
  });
  it('tabChroma は en/zh で固定文言と一致する（mojibake 防止）', () => {
    expect(getLocaleStrings('en').tabChroma).toBe('🗄️ Chroma Browser');
    expect(getLocaleStrings('zh').tabChroma).toBe('🗄️ Chroma 浏览器');
  });
  it('chromaEnabled / chromaEnabledDesc / chromaDisabledNotice は 3 言語で存在する', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const v = getLocaleStrings(lang);
      expect(v.chromaEnabled.length, `${lang}.chromaEnabled empty`).toBeGreaterThan(0);
      expect(v.chromaEnabledDesc.length, `${lang}.chromaEnabledDesc empty`).toBeGreaterThan(0);
      expect(v.chromaDisabledNotice.length, `${lang}.chromaDisabledNotice empty`).toBeGreaterThan(0);
    }
  });
  it('chromaChromaPath は 3 言語で ChromaDB パスについて言及', () => {
    expect(getLocaleStrings('ja').chromaChromaPath).toContain('ChromaDB');
    expect(getLocaleStrings('en').chromaChromaPath.toLowerCase()).toContain('chroma');
    expect(getLocaleStrings('zh').chromaChromaPath).toContain('ChromaDB');
  });
  it('chromaTestOk は {n} プレースホルダを含む', () => {
    expect(getLocaleStrings('ja').chromaTestOk).toContain('{n}');
    expect(getLocaleStrings('en').chromaTestOk).toContain('{n}');
    expect(getLocaleStrings('zh').chromaTestOk).toContain('{n}');
  });
  it('chromaResolvedPath は {path} プレースホルダを含む', () => {
    expect(getLocaleStrings('ja').chromaResolvedPath).toContain('{path}');
    expect(getLocaleStrings('en').chromaResolvedPath).toContain('{path}');
    expect(getLocaleStrings('zh').chromaResolvedPath).toContain('{path}');
  });
  it('TC-A08: ttsEnginePlachta / ttsPlachta* キーが 3 言語で非空（v0.8.0）', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const v = getLocaleStrings(lang);
      expect(v.ttsEnginePlachta.length, `${lang}.ttsEnginePlachta empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaPreset.length, `${lang}.ttsPlachtaPreset empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaSpeaker.length, `${lang}.ttsPlachtaSpeaker empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaLanguage.length, `${lang}.ttsPlachtaLanguage empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaSpeed.length, `${lang}.ttsPlachtaSpeed empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaTest.length, `${lang}.ttsPlachtaTest empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaOffline.length, `${lang}.ttsPlachtaOffline empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaTimeout.length, `${lang}.ttsPlachtaTimeout empty`).toBeGreaterThan(0);
      expect(v.ttsPlachtaTooLong.length, `${lang}.ttsPlachtaTooLong empty`).toBeGreaterThan(0);
    }
  });
});