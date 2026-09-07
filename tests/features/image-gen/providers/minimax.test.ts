import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMiniMaxImageProvider } from '../../../../src/features/image-gen/providers/minimax';

describe('MiniMax image provider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const provider = createMiniMaxImageProvider(() => 'test-key');

  it('id / label / envKeys', () => {
    expect(provider.id).toBe('minimax');
    expect(provider.label).toContain('MiniMax');
    expect(provider.envKeys).toEqual(['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY']);
    expect(provider.isConfigured()).toBe(true);
  });

  it('正常系: base64 レスポンス', async () => {
    // 'aGVsbG8=' = 'hello'
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { image_base64: ['aGVsbG8='] } }), { status: 200 }),
    );
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.bytes.length).toBe(5);
      expect(result.result.ext).toBe('jpg');
    }
    // Verify the URL & method
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.minimaxi.com/v1/image_generation',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('正常系: image_urls レスポンス → 2 次 fetch', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { image_urls: ['https://cdn.test/img.jpg'] } }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 }));
    const result = await provider.fetch({ prompt: 'dog', aspectRatio: '16:9' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.bytes.length).toBe(4);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('401: expired', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('expired');
      expect(result.error.httpStatus).toBe(401);
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

  it('base_resp.status_code != 0: error', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ base_resp: { status_code: 1008, status_msg: 'quota exceeded' } }), { status: 200 }),
    );
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.message).toContain('quota');
    }
  });

  it('データなし: error', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const result = await provider.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('error');
      expect(result.error.message).toContain('No image data');
    }
  });

  it('no_key', async () => {
    const p = createMiniMaxImageProvider(() => undefined);
    expect(p.isConfigured()).toBe(false);
    const result = await p.fetch({ prompt: 'cat', aspectRatio: '1:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no_key');
    }
  });
});
