import { describe, it, expect } from 'vitest';
import { nextHeadingIndex } from '../../../../src/features/tts/md-read-highlight/heading-skip';
import type { MdReadChunkAnchor } from '../../../../src/features/tts/md-read-highlight/types';

function chunk(idx: number, level: 0 | 1 | 2 | 3): MdReadChunkAnchor {
  return { index: idx, startLine: idx, anchor: '', text: '', headingLevel: level };
}

describe('nextHeadingIndex', () => {
  it('H2 → H1 を探して返す（より小さいレベルへの境界）', () => {
    const cs = [chunk(0, 1), chunk(1, 2), chunk(2, 2), chunk(3, 1)];
    expect(nextHeadingIndex(cs, 1)).toBe(3);
  });

  it('末尾到達（次見出しなし）→ current を返す', () => {
    const cs = [chunk(0, 1), chunk(1, 2)];
    expect(nextHeadingIndex(cs, 0)).toBe(0);
  });

  it('同じ H2 が出現してもスキップしない', () => {
    const cs = [chunk(0, 1), chunk(1, 2), chunk(2, 2)];
    // idx=0（H1）から次の H1/H2 を探す → chunk(2) は H2 だが、これは含まれるべき（同レベル）
    // → 仕様: 「現在のレベル以下で 0 より大きい」を返す → chunk(2) を返す
    expect(nextHeadingIndex(cs, 0)).toBe(2);
  });
});
