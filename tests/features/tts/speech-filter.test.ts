import { describe, it, expect } from 'vitest';
import { filterSpeechText } from '../../../src/features/tts/speech-filter';
import type { SpeechFilterOptions } from '../../../src/core/settings';

const ALL_TRUE: SpeechFilterOptions = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true };

describe('filterSpeechText (v0.17 チェック=読む)', () => {
  it('全 true（読む）ならテキストをそのまま返す', () => {
    expect(filterSpeechText('📢 完了 :tada: (^_^) :)', ALL_TRUE)).toBe('📢 完了 :tada: (^_^) :)');
  });

  it('emoji=false なら絵文字を除去する', () => {
    const f = { ...ALL_TRUE, emoji: false };
    expect(filterSpeechText('📢 完了', f)).not.toContain('📢');
  });

  it('kaomoji=false なら顔文字を除去する', () => {
    const f = { ...ALL_TRUE, kaomoji: false };
    expect(filterSpeechText('OK (^_^)', f)).toBe('OK');
  });

  it('ascii_emoticon=false なら ASCII 表情を除去する', () => {
    const f = { ...ALL_TRUE, ascii_emoticon: false };
    expect(filterSpeechText('great :)', f)).toBe('great');
  });

  it('emoji_shortcode=false なら短コードを除去する', () => {
    const f = { ...ALL_TRUE, emoji_shortcode: false };
    expect(filterSpeechText(':tada:', f)).toBe('');
  });

  it('空になった括弧対を除去する', () => {
    const f = { ...ALL_TRUE, kaomoji: false };
    expect(filterSpeechText('abc（　）', f)).toBe('abc');
  });
});
