import { describe, it, expect } from 'vitest';
import { WHITELIST_PRESETS } from '../../../src/features/whitelist/presets';

describe('WHITELIST_PRESETS', () => {
  it('5 件のプリセットを持つ', () => {
    expect(WHITELIST_PRESETS).toHaveLength(5);
  });
  it('各プリセットは name / extensions / desc を持つ', () => {
    for (const p of WHITELIST_PRESETS) {
      expect(typeof p.name).toBe('string');
      expect(Array.isArray(p.extensions)).toBe(true);
      expect(typeof p.desc).toBe('string');
    }
  });
  it('「📦 ALL」プリセットは * フラグを含む', () => {
    const all = WHITELIST_PRESETS.find((p) => p.name.includes('ALL'));
    expect(all).toBeDefined();
    expect(all?.extensions).toContain('*');
  });
  it('「📄 Obsidian標準」は md / canvas のみ', () => {
    const obs = WHITELIST_PRESETS.find((p) => p.name.includes('Obsidian標準'));
    expect(obs?.extensions).toEqual(['md', 'canvas']);
  });
});
