// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// httpGet は obsidian モジュールの requestUrl を require で解決する。
// テスト環境では obsidian が解決できないため fetch フォールバックを使う。
describe('httpGet (fetch fallback)', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
    // require cache をリセットして requestUrl 解決を再試行させる
    try {
      delete require.cache[require.resolve('../../../src/features/quota/http')];
    } catch { /* 無視 */ }
  });

  it('fetch フォールバックで JSON を返す', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ hello: 'world' }),
    });
    const { httpGet } = await import('../../../src/features/quota/http');
    const res = await httpGet('https://example.com', { 'Authorization': 'Bearer x' });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('非OKステータスを ok=false で返す', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({}),
    });
    const { httpGet } = await import('../../../src/features/quota/http');
    const res = await httpGet('https://example.com', {});
    expect(res.status).toBe(500);
    expect(res.ok).toBe(false);
  });
});
