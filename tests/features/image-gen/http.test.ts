import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpPostJson } from '../../../src/features/image-gen/http';

describe('httpPostJson', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Ensure tests use the fetch fallback (no Obsidian runtime here)
    vi.resetModules();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('正常系: fetch を POST + JSON body で呼び出す', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await httpPostJson('https://example.test/api', { Authorization: 'Bearer x' }, { foo: 'bar' });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    const body = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(body.method).toBe('POST');
    expect(body.headers).toMatchObject({ Authorization: 'Bearer x', 'Content-Type': 'application/json' });
    expect(JSON.parse(body.body as string)).toEqual({ foo: 'bar' });
  });

  it('4xx: ok=false を返す', async () => {
    fetchSpy.mockResolvedValue(new Response('Bad Request', { status: 400 }));
    const res = await httpPostJson('https://example.test/api', {}, {});
    expect(res.status).toBe(400);
    expect(res.ok).toBe(false);
  });

  it('5xx: ok=false を返す', async () => {
    fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));
    const res = await httpPostJson('https://example.test/api', {}, {});
    expect(res.status).toBe(500);
    expect(res.ok).toBe(false);
  });

  it('json() でパース済みデータを返す', async () => {
    const data = { data: [{ url: 'http://x.test/a.png' }] };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await httpPostJson('https://example.test/api', {}, { prompt: 'cat' });
    const parsed = await res.json();
    expect(parsed).toEqual(data);
  });

  it('レスポンスが JSON でないとき json() は例外を投げる', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>not json</html>', { status: 200 }));
    const res = await httpPostJson('https://example.test/api', {}, {});
    await expect(res.json()).rejects.toThrow();
  });

  it('AbortController シグナルが伝播する', async () => {
    const controller = new AbortController();
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await httpPostJson('https://example.test/api', {}, { a: 1 }, controller.signal);
    const call = fetchSpy.mock.calls[0]!;
    expect((call[1] as RequestInit).signal).toBe(controller.signal);
  });
});
