// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createMiniMaxProvider } from '../../../../src/features/quota/providers/minimax';

function mockFetchOnce(impl: () => Promise<Response>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

describe('createMiniMaxProvider', () => {
  it('キー未設定 → isConfigured=false', () => {
    const p = createMiniMaxProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
  });

  it('200 → general モデルの残量%から使用量 62% を算出', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      model_remains: [
        { model_name: 'general', current_interval_usage_count: 570, current_interval_total_count: 1500, current_interval_remaining_percent: 38 },
        { model_name: 'video', current_interval_remaining_percent: 100 },
      ],
      base_resp: { status_code: 0 },
    }), { status: 200 }));
    const p = createMiniMaxProvider(() => 'sk-mm');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    // 使用量% = 100 - 残量% = 100 - 38 = 62
    expect(q.pct).toBe(62);
    expect(q.value).toBe('62%');
    restore();
  });

  it('200 → remaining_percent 無しの場合 count から算出', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      model_remains: [
        { model_name: 'MiniMax-M2', current_interval_usage_count: 570, current_interval_total_count: 1500 },
      ],
      base_resp: { status_code: 0 },
    }), { status: 200 }));
    const p = createMiniMaxProvider(() => 'sk-mm');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.pct).toBe(38);
    expect(q.value).toBe('38%');
    restore();
  });

  it('base_resp.status_code != 0 → error', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      base_resp: { status_code: 1004 },
    }), { status: 200 }));
    const p = createMiniMaxProvider(() => 'sk-mm');
    const q = await p.fetch();
    expect(q.status).toBe('error');
    restore();
  });
});