// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyHighlightColor } from '../../../../src/features/tts/md-read-highlight/highlight-style';

const VAR_NAME = '--cb-md-read-highlight';

describe('applyHighlightColor (F-028)', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(VAR_NAME);
  });

  it('有効な 6 桁 hex (#aabbcc) → rgba(170, 187, 204, 0.35) をセット', () => {
    applyHighlightColor('#aabbcc');
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe(
      'rgba(170, 187, 204, 0.35)',
    );
  });

  it('有効な 3 桁 hex (#abc) → rgba(170, 187, 204, 0.35) に展開', () => {
    applyHighlightColor('#abc');
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe(
      'rgba(170, 187, 204, 0.35)',
    );
  });

  it('有効な hex は大小文字どちらでも受け付ける（#AABBCC）', () => {
    applyHighlightColor('#AABBCC');
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe(
      'rgba(170, 187, 204, 0.35)',
    );
  });

  it('空文字 → CSS 変数を除去（フォールバック色を尊重）', () => {
    document.documentElement.style.setProperty(VAR_NAME, 'rgba(0,0,0,0.5)');
    applyHighlightColor('');
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe('');
  });

  it('無効な hex (#zzz) → 既存の CSS 変数を除去（フォールバック尊重）', () => {
    document.documentElement.style.setProperty(VAR_NAME, 'rgba(0,0,0,0.5)');
    applyHighlightColor('#zzz');
    // CSS のフォールバック色（rgba(100, 180, 255, 0.35)）に戻すため property を除去
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe('');
  });

  it('hex 形式でない文字列（"red"）→ no-op', () => {
    applyHighlightColor('red');
    expect(document.documentElement.style.getPropertyValue(VAR_NAME)).toBe('');
  });
});
