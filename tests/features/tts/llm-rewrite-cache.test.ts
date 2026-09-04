import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rewriteCacheKey, RewriteCache, MAX_CACHE_ENTRIES } from '../../../src/features/tts/llm-rewrite-cache';

describe('rewriteCacheKey', () => {
  it('filePath|contentLength|profile 形式', () => {
    expect(rewriteCacheKey('a.md', 100, 'boss')).toBe('a.md|100|boss');
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
