import { describe, it, expect, vi, afterEach } from 'vitest';
import { compareSemver, stripVPrefix, checkForUpdate } from '../../../src/features/self-update/update-checker';

// httpGet をモック（quota/http の fetch フォールバックに依存しない）
const httpGetMock = vi.fn();
vi.mock('../../../src/features/quota/http', () => ({
  httpGet: (...args: unknown[]) => httpGetMock(...args),
}));

afterEach(() => httpGetMock.mockReset());

describe('compareSemver', () => {
  it.each([
    ['0.32.9', '0.32.10', -1],
    ['0.32.10', '0.32.9', 1],
    ['0.32.9', '0.32.9', 0],
    ['1.0.0', '0.9.9', 1],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
  });
});

describe('stripVPrefix', () => {
  it('v プレフィックスを除去する', () => {
    expect(stripVPrefix('v0.32.10')).toBe('0.32.10');
    expect(stripVPrefix('0.32.10')).toBe('0.32.10');
  });
});

describe('checkForUpdate', () => {
  const apiResponse = {
    tag_name: 'v0.32.10',
    assets: [
      { name: 'main.js', browser_download_url: 'https://example.com/main.js' },
      { name: 'manifest.json', browser_download_url: 'https://example.com/manifest.json' },
      { name: 'styles.css', browser_download_url: 'https://example.com/styles.css' },
    ],
  };

  it('リモートが新しければ updateAvailable=true', async () => {
    httpGetMock.mockResolvedValue({ status: 200, ok: true, json: async () => apiResponse });
    const r = await checkForUpdate('0.32.9');
    expect(r).toEqual({ updateAvailable: true, tagName: 'v0.32.10', assets: apiResponse.assets });
  });

  it('リモートが同じか古ければ updateAvailable=false', async () => {
    httpGetMock.mockResolvedValue({ status: 200, ok: true, json: async () => apiResponse });
    expect((await checkForUpdate('0.32.10')).updateAvailable).toBe(false);
    expect((await checkForUpdate('1.0.0')).updateAvailable).toBe(false);
  });

  it('requestUrl が 404 でも fetch フォールバックで取得できる', async () => {
    httpGetMock.mockResolvedValue({ status: 404, ok: false, json: async () => ({}) });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiResponse,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await checkForUpdate('0.32.9');
    expect(r.updateAvailable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('フォールバックも 404 ならレスポンス本文付きで例外を投げる', async () => {
    httpGetMock.mockResolvedValue({ status: 404, ok: false, json: async () => ({}) });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not Found' }),
      text: async () => '{"message":"Not Found"}',
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkForUpdate('0.32.9')).rejects.toThrow(/Not Found/);
    vi.unstubAllGlobals();
  });

  it('403（レート制限）で例外を投げる', async () => {
    httpGetMock.mockResolvedValue({ status: 403, ok: false, json: async () => ({}) });
    // フォールバック fetch も 403 を返すよう固定（実ネットワークを叩かない）
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'rate limit' }),
      text: async () => '',
    }));
    await expect(checkForUpdate('0.32.9')).rejects.toThrow(/403/);
    vi.unstubAllGlobals();
  });
});
