import { describe, it, expect, vi } from 'vitest';
import { parseSections, buildRewritePrompt, rewriteSections, splitLongBody } from '../../../src/features/tts/llm-rewrite';

const MD = [
  '---', 'title: t', '---',
  '# 見出し1', '段落1。', '', '段落1b。',
  '## 見出し2', '段落2。',
  '', '```js', 'code', '```', '段落3。',
].join('\n');

describe('parseSections', () => {
  it('見出しのみ（本文空）セクションはスキップ・先頭序文は保持', () => {
    const md = '序文テキスト。\n# A\n## B\n# C\n本文C。';
    const s2 = parseSections(md);
    expect(s2.length).toBe(2); // 序文 + C（B は空のため除外）
    expect(s2[0].heading).toBe('');
    expect(s2[1].heading).toBe('C');
    expect(s2[1].bodyText).toContain('本文C');
  });

  it('frontmatter を除き見出し境界で分割、コードを本文から除去', () => {
    const s = parseSections(MD);
    expect(s.length).toBe(2);
    expect(s[0].heading).toBe('見出し1');
    expect(s[0].bodyText).toContain('段落1');
    expect(s[1].heading).toBe('見出し2');
    expect(s[1].bodyText).not.toContain('code');
    expect(s[1].bodyText).toContain('段落3');
  });
});

describe('splitLongBody', () => {
  it('4096 字超を段落単位で複数に分割', () => {
    const body = Array.from({ length: 20 }, () => 'あ'.repeat(300)).join('\n');
    const parts = splitLongBody(body, 4000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
  });
});

describe('buildRewritePrompt', () => {
  it('profile 名・本文・見出し文脈を含む', () => {
    const p = buildRewritePrompt({ index: 0, heading: 'H', bodyText: 'B' }, 'boss');
    expect(p).toContain('boss');
    expect(p).toContain('B');
    expect(p).toContain('H');
  });

  // v0.37.2 (追加要件): 表は見出し行を含め読み上げない旨を prompt に明示
  it('表を読み上げない指示（ヘッダー行含む）が含まれる', () => {
    const p = buildRewritePrompt({ index: 0, heading: 'H', bodyText: 'B' }, 'boss');
    expect(p).toContain('表');
    expect(p).toContain('読み上げない');
    expect(p).toContain('ヘッダー');
  });

  // v0.37.1 (新要件): 全 profile でです・ます調に統一（回帰防止ロック）
  it('です・ます調統一の指示が全 profile に含まれる', () => {
    for (const profile of ['workplace', 'customer', 'family', 'classroom', 'boss', 'dr'] as const) {
      const p = buildRewritePrompt({ index: 0, heading: 'H', bodyText: 'B' }, profile);
      expect(p, `profile=${profile}`).toContain('です・ます調');
    }
  });
});

describe('rewriteSections', () => {
  it('全 Section を runFn で書き換えて連結', async () => {
    const runFn = vi.fn().mockResolvedValue('rewritten');
    const sections = [{ index: 0, heading: 'H1', bodyText: 'a' }, { index: 1, heading: 'H2', bodyText: 'b' }];
    const r = await rewriteSections(sections, 'boss', runFn);
    expect(r.failed).toBe(false);
    expect(r.rewritten.map((s) => s.bodyText)).toEqual(['rewritten', 'rewritten']);
    expect(runFn).toHaveBeenCalledTimes(2);
  });

  it('runFn が null を返すと failed=true・原文を保持', async () => {
    const runFn = vi.fn().mockResolvedValue(null);
    const r = await rewriteSections([{ index: 0, heading: 'H', bodyText: 'a' }], 'boss', runFn);
    expect(r.failed).toBe(true);
    expect(r.rewritten[0].bodyText).toBe('a');
  });
});

describe('rewriteSections 並列 (v0.37.1)', () => {
  it('遅い先頭セクションでも結果は元順序で並ぶ', async () => {
    const runFn = vi.fn()
      .mockImplementation(async (p: string) => {
        // 先頭（index 0）だけ遅延させる
        if (p.includes('本文A')) await new Promise((r) => setTimeout(r, 30));
        return 'ok';
      });
    const sections = [
      { index: 0, heading: 'A', bodyText: '本文A' },
      { index: 1, heading: 'B', bodyText: '本文B' },
      { index: 2, heading: 'C', bodyText: '本文C' },
    ];
    const t0 = Date.now();
    const r = await rewriteSections(sections, 'boss', runFn, undefined, 3);
    const took = Date.now() - t0;
    expect(r.rewritten.map((s) => s.bodyText)).toEqual(['ok', 'ok', 'ok']);
    expect(took).toBeLessThan(120); // 直列 90ms 相当より速い（並列効果）
  });
});
