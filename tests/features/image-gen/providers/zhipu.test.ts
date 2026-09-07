import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createZhipuImageProvider } from '../../../../src/features/image-gen/providers/zhipu';

describe('Zhipu image provider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const provider = createZhipuImageProvider(() => 'test-key');

  it('id / label / envKeys', () => {
    expect(provider.id).toBe('zhipu');
    expect(provider.label).toContain('Zhipu');
    expect(provider.envKeys).toEqual(['ZHIPU_API_KEY', 'ZAI_API_KEY']);
    expect(provider.isConfigured()).toBe(true);
  });

  it('正常系: url レスポンス → 2 次 fetch', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/zhipu.png' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([10, 20, 30]).buffer, { status: 200 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.bytes.length).toBe(3);
      expect(result.result.ext).toBe('png');
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // 1st call: POST https://api.z.ai/api/paas/v4/images/generations
    const firstCall = fetchSpy.mock.calls[0]!;
    expect(firstCall[0]).toContain('api.z.ai');
    const body = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(body.model).toBe('glm-image');
    expect(body.quality).toBe('hd');
    expect(body.size).toBe('1024x1024'); // 1:1
  });

  it('aspect → size マップ 4 種すべて', async () => {
    const sizes = new Map<string, string>();
    fetchSpy.mockImplementation(async (url) => {
      const body = (url as string);
      // Mock POST → returns URL; then 2nd fetch returns bytes
      // First call will have its body parsed below
      return new Response(JSON.stringify({ data: [{ url: 'https://x.test/img.png' }] }), { status: 200 });
    });
    // For each aspect, capture size sent
    for (const aspect of ['1:1', '16:9', '9:16', '4:3'] as const) {
      fetchSpy.mockClear();
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [{ url: 'https://x.test/img.png' }] }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(new Uint8Array([1]).buffer, { status: 200 }));
      await provider.fetch({ prompt: 'x', aspectRatio: aspect });
      const sent = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
      sizes.set(aspect, sent.size);
    }
    expect(sizes.get('1:1')).toBe('1024x1024');
    expect(sizes.get('16:9')).toBe('1280x720');
    expect(sizes.get('9:16')).toBe('720x1280');
    expect(sizes.get('4:3')).toBe('1152x864');
  });

  it('401: expired', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('expired');
    }
  });

  it('500: error', async () => {
    fetchSpy.mockResolvedValue(new Response('Boom', { status: 500 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.httpStatus).toBe(500);
    }
  });

  it('Zhipu エラーフィールド: error', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 200 }),
    );
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.message).toBe('invalid key');
    }
  });

  it('URL なし: error', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.message).toContain('No image URL');
    }
  });

  it('2 次 fetch 失敗: error', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/x.png' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 404 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.message).toContain('HTTP 404');
    }
  });

  it('no_key', async () => {
    const p = createZhipuImageProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
    const result = await p.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no_key');
    }
  });
});
