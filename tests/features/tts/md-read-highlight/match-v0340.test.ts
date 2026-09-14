// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { normalizeForMatch, anchorPrefix } from '../../../../src/features/tts/md-read-highlight/match';

describe('anchorPrefix / wikilink basename (v0.34.0)', () => {
  it('slice してもサロゲートペアを切断しない', () => {
    const s = '🐍PythonでMCPサーバーを自作する方法🎬视频：Python';
    const a = anchorPrefix(normalizeForMatch(s), 24);
    expect(a.includes('\ud83c') && !a.includes('🎬')).toBe(false);
  });

  it('wikilink はパスではなく表示名（basename）で正規化する', () => {
    expect(normalizeForMatch('模板：[[../../_テンプレート/YouTube_采集模板]]')).toBe('模板：YouTube采集模板');
  });
});
