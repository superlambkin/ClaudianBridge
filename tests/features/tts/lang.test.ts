import { describe, it, expect } from 'vitest';
import { pickWebSpeechLang } from '../../../src/features/tts/lang';

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
});
