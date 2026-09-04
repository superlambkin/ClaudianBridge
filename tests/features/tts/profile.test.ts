// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyProfileTransform, PROFILE_IDS } from '../../../src/features/tts/profile';

describe('applyProfileTransform (v0.36.0)', () => {
  it('PROFILE_IDS は 7 種', () => {
    expect(PROFILE_IDS.length).toBe(7);
    expect(PROFILE_IDS).toContain('original');
    expect(PROFILE_IDS).toContain('workplace');
    expect(PROFILE_IDS).toContain('customer');
    expect(PROFILE_IDS).toContain('family');
    expect(PROFILE_IDS).toContain('classroom');
    expect(PROFILE_IDS).toContain('boss');
    expect(PROFILE_IDS).toContain('dr');
  });

  it('original プロファイルは入力文字列をそのまま返す', () => {
    const out = applyProfileTransform('API を 3 つ使います', 'original', new Map());
    expect(out).toBe('API を 3 つ使います');
  });
});

describe('workplace プロファイル', () => {
  it('略語を 1 文字ずつカタカナ読みに展開', () => {
    const out = applyProfileTransform('API と URL が使えます', 'workplace', new Map());
    expect(out).toBe('エー ピー アイ と ユー アール エル が使えます');
  });

  it('用語辞書の語が優先される', () => {
    const map = new Map([['API', 'アプリケーション・プログラミング・インターフェース']]);
    const out = applyProfileTransform('API を呼ぶ', 'workplace', map);
    expect(out).toBe('アプリケーション・プログラミング・インターフェース を呼ぶ');
  });

  it('元々カタカナの語（エッジタ）はそのまま', () => {
    const out = applyProfileTransform('エッジ で配信', 'workplace', new Map());
    expect(out).toBe('エッジ で配信');
  });
});
