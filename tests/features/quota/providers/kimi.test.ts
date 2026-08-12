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

  it('200 → 使用率 42%', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      limit: 2048, used: 860, remaining: 1188, resetTime: '2099-01-01T00:00:00Z',
    }), { status: 200 }));
    const p = createKimiProvider((k) => (k === 'KIMI_CODING_API_KEY' ? 'sk-kimi-x' : undefined));
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('42%');
    expect(q.pct).toBe(42);
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