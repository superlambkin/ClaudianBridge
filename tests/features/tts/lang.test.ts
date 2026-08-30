import { describe, it, expect } from 'vitest';
import { pickLang, pickWebSpeechLang } from '../../../src/features/tts/lang';

describe('pickWebSpeechLang', () => {
  it('ひらがな主体は ja', () => {
    expect(pickWebSpeechLang('こんにちは、テストです。')).toBe('ja');
  });
  it('漢字主体は zh', () => {
    expect(pickWebSpeechLang('你好，这是一段测试文本。')).toBe('zh');
  });
  it('ラテン主体は en', () => {
    expect(pickWebSpeechLang('Hello, this is a test.')).toBe('en');
  });
  // v0.27.3: かなは中国語で使用されないため、かなを含むテキストは漢字が多くても ja
  it('かなを含む漢字多めの日本語は ja（zh に誤判定しない）', () => {
    expect(pickWebSpeechLang('国立国会図書館の蔵書は膨大だ。')).toBe('ja');
    expect(pickWebSpeechLang('政府は経済対策として新たな予算案を承認した。')).toBe('ja');
  });
  it('カタカナのみでも ja', () => {
    expect(pickWebSpeechLang('コンピューター、スマートフォン。')).toBe('ja');
  });
});

describe('pickLang', () => {
  it('mode=ja は固定で ja（テキスト内容に関わらず）', () => {
    expect(pickLang('Hello world 你好', 'ja')).toBe('ja');
  });

  it('mode=zh は固定で zh', () => {
    expect(pickLang('こんにちは', 'zh')).toBe('zh');
  });

  it('mode=en は固定で en', () => {
    expect(pickLang('你好世界', 'en')).toBe('en');
  });

  it('mode=auto で日本語 → ja', () => {
    expect(pickLang('こんにちは世界', 'auto')).toBe('ja');
  });

  it('mode=auto で中文 → zh', () => {
    expect(pickLang('你好世界', 'auto')).toBe('zh');
  });

  it('mode=auto で英語 → en', () => {
    expect(pickLang('Hello world', 'auto')).toBe('en');
  });

  it('mode=auto は pickWebSpeechLang と同じ結果を返す', () => {
    const samples = ['こんにちは', '你好', 'Hello', 'mixed 混合 texte'];
    for (const s of samples) {
      expect(pickLang(s, 'auto')).toBe(pickWebSpeechLang(s));
    }
  });
});