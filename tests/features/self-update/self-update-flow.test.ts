import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSelfUpdate } from '../../../src/features/self-update';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: Object.assign(() => {}, { locale: () => 'en' }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// quota/http は obsidian requestUrl 解決に失敗すると fetch へ落ちるため、fetch で API も DL も制御する
function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function makeApp() {
  return {
    plugins: {
      disablePlugin: vi.fn(async () => {}),
      enablePlugin: vi.fn(async () => {}),
    },
  } as unknown as import('obsidian').App;
}

function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  const enc = (t: string) => new TextEncoder().encode(t).buffer as ArrayBuffer;
  files.set('plugin/main.js', enc('OLD'));
  files.set('plugin/manifest.json', enc('{}'));
  files.set('plugin/styles.css', enc(''));
  return {
    files,
    async exists(p: string) {
      if (files.has(p)) return true;
      for (const k of files.keys()) if (k.startsWith(`${p}/`)) return true;
      return false;
    },
    async mkdir(_p: string) {},
    async readBinary(p: string) {
      const b = files.get(p);
      if (!b) throw new Error(`not found: ${p}`);
      return b;
    },
    async writeBinary(p: string, d: ArrayBuffer) { files.set(p, d); },
  };
}

const RELEASE = {
  tag_name: 'v9.0.0',
  assets: ['main.js', 'manifest.json', 'styles.css'].map((name) => ({
    name,
    browser_download_url: `https://example.com/${name}`,
  })),
};

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('api.github.com')) return jsonResponse(RELEASE);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('NEW').buffer as ArrayBuffer };
  });
});
afterEach(() => fetchMock.mockReset());

describe('runSelfUpdate', () => {
  it('更新あり: バックアップ -> DL -> リロードまで実行される', async () => {
    const ad = makeAdapter();
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '0.32.9', 'plugin', ad, (m) => messages.push(m));
    expect(new TextDecoder().decode(ad.files.get('plugin/main.js')!)).toBe('NEW');
    expect(messages.some((m) => m.includes('v9.0.0'))).toBe(true);
  });

  it('最新版なら何もしない', async () => {
    const ad = makeAdapter();
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '9.0.0', 'plugin', ad, (m) => messages.push(m));
    // 「確認中」+「最新版」の 2 通知のみ（ロケール非依存に確認）
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatch(/✅/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // DL が走らない
  });

  it('チェック失敗時はエラー Notice で中断する', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '0.32.9', 'plugin', makeAdapter(), (m) => messages.push(m));
    expect(messages.some((m) => m.startsWith('❌'))).toBe(true);
  });
});
