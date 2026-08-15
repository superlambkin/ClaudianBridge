// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createKimiProvider } from '../../../../src/features/quota/providers/kimi';

function mockFetchOnce(impl: () => Promise<Response>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

describe('createKimiProvider', () => {
  it('キー未設定 → isConfigured=false', () => {
    const p = createKimiProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
  });

  it('200 → 5時間窓の使用率 42% (limits[0] を参照)', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      usage: { limit: '2048', used: '860', remaining: '1188', resetTime: '2099-01-01T00:00:00Z' },
      limits: [{
        window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
        detail: { limit: '100', remaining: '58', resetTime: '2099-01-01T00:00:00Z' },
      }],
    }), { status: 200 }));
    const p = createKimiProvider(() => 'sk-kimi-x');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('42%');
    expect(q.pct).toBe(42);
    expect(q.remaining).toBe('58');
    expect(q.resetAt).toBe('2099-01-01T00:00:00Z');
    restore();
  });

  it('200 → limits が無い場合トップレベル usage を使用', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      usage: { limit: '100', used: '39', remaining: '61', resetTime: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));
    const p = createKimiProvider(() => 'sk-kimi-x');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.pct).toBe(39);
    restore();
  });

  it('401 → expired', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 401 }));
    const p = createKimiProvider(() => 'sk-kimi-x');
    const q = await p.fetch();
    expect(q.status).toBe('expired');
    restore();
  });
});