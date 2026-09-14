// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createZhipuProvider } from '../../../../src/features/quota/providers/zhipu';

function mockFetchOnce(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const ZHIPU_URL = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';

function limitResponse(limits: unknown[]): Response {
  return new Response(JSON.stringify({ code: 200, msg: 'Operation successful', data: { limits, level: 'lite' } }), { status: 200 });
}

describe('createZhipuProvider', () => {
  it('キー未設定 → isConfigured=false', () => {
    const p = createZhipuProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
  });

  it('200 → 5時間窓 (unit 3) の使用率を取得', async () => {
    let calledUrl = '';
    let calledAuth = '';
    let calledLang = '';
    const restore = mockFetchOnce(async (url, init) => {
      calledUrl = url;
      calledAuth = String((init?.headers as Record<string, string>)?.['Authorization'] ?? '');
      calledLang = String((init?.headers as Record<string, string>)?.['Accept-Language'] ?? '');
      return limitResponse([
        { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 2000, currentValue: 309, remaining: 1690, percentage: 15, nextResetTime: 1789404889312 },
        { type: 'CREDIT_LIMIT', unit: 6, number: 1, usage: 10000, currentValue: 6927, remaining: 3072, percentage: 69, nextResetTime: 1789613306979 },
      ]);
    });
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('15%');
    expect(q.pct).toBe(15);
    expect(q.detail).toBe('5h');
    expect(q.remaining).toBe('1,690');
    expect(q.resetAt).toBe(1789404889312);
    expect(calledUrl).toBe(ZHIPU_URL);
    expect(calledAuth).toBe('Bearer raw-key'); // 生キー（JWT 生成不要）をそのまま送る
    expect(calledLang).toBe('en-US,en');
    restore();
  });

  it('window=week → 週間窓 (unit 6) を優先選択', async () => {
    const restore = mockFetchOnce(async () => limitResponse([
      { type: 'CREDIT_LIMIT', unit: 3, percentage: 15, remaining: 1690, nextResetTime: 1789404889312 },
      { type: 'CREDIT_LIMIT', unit: 6, percentage: 69, remaining: 3072, nextResetTime: 1789613306979 },
    ]));
    const p = createZhipuProvider(() => 'raw-key', { getWindow: () => 'week' });
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.pct).toBe(69);
    expect(q.value).toBe('69%');
    expect(q.detail).toBe('week');
    expect(q.remaining).toBe('3,072');
    expect(q.resetAt).toBe(1789613306979);
    restore();
  });

  it('優先窓が無い場合はもう一方の窓にフォールバック', async () => {
    const restore = mockFetchOnce(async () => limitResponse([
      { type: 'CREDIT_LIMIT', unit: 6, percentage: 69, remaining: 3072, nextResetTime: 1789613306979 },
    ]));
    const p = createZhipuProvider(() => 'raw-key'); // window 既定 5h → unit 3 無し
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.pct).toBe(69);
    expect(q.detail).toBe('week'); // フォールバックで取得した unit 6
    restore();
  });

  it('limits が空 → error (limit not found)', async () => {
    const restore = mockFetchOnce(async () => limitResponse([]));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('error');
    expect(q.error).toBe('limit not found');
    restore();
  });

  it('percentage 欠落 → value "--"・pct null', async () => {
    const restore = mockFetchOnce(async () => limitResponse([
      { type: 'CREDIT_LIMIT', unit: 3, remaining: 100 },
    ]));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('--');
    expect(q.pct).toBe(null);
    restore();
  });

  it('401 → expired', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 401 }));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('expired');
    restore();
  });

  it('403 → expired', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 403 }));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('expired');
    restore();
  });

  it('500 → error', async () => {
    const restore = mockFetchOnce(async () => new Response('{}', { status: 500 }));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('error');
    restore();
  });

  it('HTTP 200 でも code != 200 → error', async () => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({ code: 400, msg: 'bad request' }), { status: 200 }));
    const p = createZhipuProvider(() => 'raw-key');
    const q = await p.fetch();
    expect(q.status).toBe('error');
    expect(q.error).toBe('code 400');
    restore();
  });
});
