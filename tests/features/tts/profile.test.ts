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

describe('customer プロファイル', () => {
  it('コードフェンス箇所を「コードブロック省略」に置換', () => {
    const out = applyProfileTransform('ここに\n```python\nprint(1)\n```\nコード', 'customer', new Map());
    expect(out).toContain('コードブロック省略');
    expect(out).not.toContain('print(1)');
  });

  it('丁寧語化（だ → です）', () => {
    const out = applyProfileTransform('これは動くだ。', 'customer', new Map());
    expect(out).toContain('です');
  });
});

describe('family プロファイル', () => {
  it('数字を漢数字に変換', () => {
    const out = applyProfileTransform('3 個の 100 円', 'family', new Map());
    expect(out).toBe('三 個の 百 円');
  });

  it('コードフェンスを除外', () => {
    const out = applyProfileTransform('前\n```\nprint(1)\n```\n後', 'family', new Map());
    expect(out).not.toContain('print(1)');
  });

  it('用語辞書の語を口語置換', () => {
    const map = new Map([['API', 'アプリと会話する仕組み']]);
    const out = applyProfileTransform('API を説明します', 'family', map);
    expect(out).toBe('アプリと会話する仕組み を説明します');
  });
});

describe('classroom プロファイル', () => {
  it('用語辞書の語直後に「とは 〇〇」を付記', () => {
    const map = new Map([['API', 'アプリと会話する仕組み']]);
    const out = applyProfileTransform('API を学ぶ', 'classroom', map);
    expect(out).toContain('API とは アプリと会話する仕組み');
  });
});

describe('boss プロファイル', () => {
  it('チャンク配列で 🎯 結論 を先頭に並び替え（チャンク内の段落レベル判定）', () => {
    // boss プロファイルは呼び出し側でチャンク順序を制御するため、
    // applyProfileTransform 自体は文字列変換に専念し、並び替えは呼び出し側で行う設計とする。
    // ここでは text 内の 🎯 結論 見出し直前にマーカー「結論：」を付与することで並び替えヒントを残す。
    const out = applyProfileTransform('## 🎯 結論\n要点\n## 詳細\n詳細', 'boss', new Map());
    expect(out).toMatch(/結論：[\s\S]*要点[\s\S]*詳細：[\s\S]*詳細/);
  });

  it('数値を漢数字にする', () => {
    const out = applyProfileTransform('売上 150 万円', 'boss', new Map());
    expect(out).toContain('百五十');
  });
});

describe('dr プロファイル', () => {
  it('誤字疑い箇所にビープマーカー（[BEEP]）を挿入', () => {
    const out = applyProfileTransform('原文ママ', 'dr', new Map());
    expect(out).toContain('[BEEP]');
  });

  it('修正提案は TODO: プレフィックスを付与', () => {
    const out = applyProfileTransform('修正：改善', 'dr', new Map());
    expect(out).toContain('TODO:');
  });
});
