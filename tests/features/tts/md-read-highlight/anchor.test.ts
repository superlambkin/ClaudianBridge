import { describe, it, expect } from 'vitest';
import { buildChunks } from '../../../../src/features/tts/md-read-highlight/anchor';

describe('buildChunks', () => {
  it('短いテキストは単一チャンク', () => {
    const raw = 'Hello world.\nThis is a test.';
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].anchor).toBe('Hello world.');
    expect(chunks[0].headingLevel).toBe(0);
  });

  it('長いテキストは chunkMaxChars で分割', () => {
    const raw = 'a'.repeat(1200);
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 500);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text.length).toBeLessThanOrEqual(500);
  });

  it('見出しレベルを H1/H2/H3 で判定', () => {
    const raw = '前置き\n# Title 1\n本文\n## Sub 2\n本文2\n### Sub Sub 3\n本文3';
    const filtered = '前置き\nTitle 1\n本文\nSub 2\n本文2\nSub Sub 3\n本文3';
    const chunks = buildChunks(raw, filtered, 500);
    // chunk 0: プレアンブル
    expect(chunks.find((c) => c.text.includes('前置き'))?.headingLevel).toBe(0);
    // chunk 1: H1
    expect(chunks.find((c) => c.text.includes('Title 1'))?.headingLevel).toBe(1);
    // chunk 2: H2
    expect(chunks.find((c) => c.text.includes('Sub 2'))?.headingLevel).toBe(2);
    // chunk 3: H3
    expect(chunks.find((c) => c.text.includes('Sub Sub 3'))?.headingLevel).toBe(3);
  });

  it('anchor は各チャンク先頭 12-20 文字', () => {
    const raw = 'abcdefghijklmnopqrstuvwxyz';
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 10);
    for (const c of chunks) {
      expect(c.anchor.length).toBeGreaterThanOrEqual(Math.min(12, c.text.length));
      expect(c.anchor.length).toBeLessThanOrEqual(20);
      expect(c.text.startsWith(c.anchor)).toBe(true);
    }
  });
});
