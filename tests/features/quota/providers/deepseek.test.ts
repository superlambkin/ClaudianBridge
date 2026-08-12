// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDeepSeekProvider } from '../../../../src/features/quota/providers/deepseek';

function mockFetchOnce(impl: () => Promise<Response>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

describe('createDeepSeekProvider', () => {
  it('キー未設定 → isConfigured=false', () => {
    const p = createDeepSeekProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
  });

  it('200 → 残高 ¥110.00', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '110.00' }],
    }), { status: 200 }));
    const p = createDeepSeekProvider((k) => (k === 'DEEPSEEK_API_KEY' ? 'sk-test' : undefined));
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('¥110.00');
    restore();
  });

  it('401 → expired', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 401 }));
    const p = createDeepSeekProvider(() => 'sk-test');
    const q = await p.fetch();
    expect(q.status).toBe('expired');
    restore();
  });

  it('500 → error', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 500 }));
    const p = createDeepSeekProvider(() => 'sk-test');
    const q = await p.fetch();
    expect(q.status).toBe('error');
    restore();
  });
});