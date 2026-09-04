import { describe, it, expect, vi } from 'vitest';
import { parseSections, buildRewritePrompt, rewriteSections, splitLongBody } from '../../../src/features/tts/llm-rewrite';

const MD = [
  '---', 'title: t', '---',
  '# 見出し1', '段落1。', '', '段落1b。',
  '## 見出し2', '段落2。',
  '', '```js', 'code', '```', '段落3。',
].join('\n');

describe('parseSections', () => {
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
  it('profile 名と本文を含む', () => {
    const p = buildRewritePrompt({ index: 0, heading: 'H', bodyText: 'B' }, 'boss');
    expect(p).toContain('boss');
    expect(p).toContain('B');
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
