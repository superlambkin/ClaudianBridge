import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadAssets } from '../../../src/features/self-update/update-downloader';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    async mkdir(_p: string) {},
    async writeBinary(p: string, d: ArrayBuffer) { files.set(p, d); },
  };
}

const ASSETS = ['main.js', 'manifest.json', 'styles.css'].map((name) => ({
  name,
  browser_download_url: `https://example.com/${name}`,
}));

describe('downloadAssets', () => {
  it('3 ファイルを pluginDir へ上書きする', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(`NEW:${url}`).buffer as ArrayBuffer,
    }));
    const ad = makeAdapter();
    await downloadAssets(ASSETS, 'plugin', ad);
    expect(ad.files.size).toBe(3);
    expect(new TextDecoder().decode(ad.files.get('plugin/main.js')!)).toBe('NEW:https://example.com/main.js');
  });

  it('1 ファイルでも失敗したら throw する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('styles.css')) return { ok: false, status: 500 };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    });
    const ad = makeAdapter();
    await expect(downloadAssets(ASSETS, 'plugin', ad)).rejects.toThrow(/styles\.css/);
  });
});
