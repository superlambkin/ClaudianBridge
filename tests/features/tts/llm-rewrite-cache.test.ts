import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rewriteCacheKey, RewriteCache, MAX_CACHE_ENTRIES } from '../../../src/features/tts/llm-rewrite-cache';

describe('rewriteCacheKey', () => {
  it('filePath|contentLength|hash|profile 形式（内容ハッシュで鮮度を担保）', () => {
    const k1 = rewriteCacheKey('a.md', 'AAA 本文', 'boss');
    const k2 = rewriteCacheKey('a.md', 'BBB 本文', 'boss');
    expect(k1).toContain('a.md');
    expect(k1).toContain('|boss');
    // 同長でなくとも内容が異なればキーも異なる
    expect(k1).not.toBe(k2);
    // 同一内容なら同一キー
    expect(rewriteCacheKey('a.md', 'AAA 本文', 'boss')).toBe(k1);
  });
});

describe('RewriteCache', () => {
  let dir: string;
  let cache: RewriteCache;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-llm-cache-'));
    cache = new RewriteCache(dir);
  });

  it('put→get で同一値が返る', async () => {
    await cache.put('k1', 'rewritten1');
    expect(await cache.get('k1')).toBe('rewritten1');
  });

  it('存在しないキーは null', async () => {
    expect(await cache.get('nope')).toBeNull();
  });

  it('MAX 超で最古が消える', async () => {
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++) await cache.put(`k${i}`, `v${i}`);
    await cache.put('overflow', 'x'); // k0 が追い出される
    expect(await cache.get('k0')).toBeNull();
    expect(await cache.get('k1')).toBe('v1');
    expect(await cache.get('overflow')).toBe('x');
  });

  it('再読み込みでディスクから復元される', async () => {
    await cache.put('persist', 'yes');
    const cache2 = new RewriteCache(dir);
    expect(await cache2.get('persist')).toBe('yes');
  });
});
