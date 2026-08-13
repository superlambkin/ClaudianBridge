/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock は hoist され import の前に適用される
vi.mock('child_process', () => ({
  __esModule: true,
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  __esModule: true,
  default: { readFile: vi.fn() },
  readFile: vi.fn(),
}));
vi.mock('../../../src/features/quota/llm-info', () => ({
  readLlmInfoFromSettings: vi.fn(() => ({ provider: 'claude', model: null, baseUrl: null, authTokenPresent: false })),
}));

import { Platform } from 'obsidian';
import { resetMocks, mockFetch } from '../../mocks/obsidian';
import { registerClaudeQuota, unregisterClaudeQuota } from '../../../src/features/quota/index';
import { readLlmInfoFromSettings } from '../../../src/features/quota/llm-info';

// 環境変数を完全にクリア（CI や開発環境で API キーが設定されている場合に provider が available になるのを防ぐ）
const noEnv = (): string | undefined => undefined;

describe('registerClaudeQuota', () => {
  beforeEach(() => {
    Platform.isMobile = false;
    resetMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Platform.isMobile = false;
    document.body.innerHTML = '';
    void unregisterClaudeQuota();
  });

  it('Mobile のとき null を返す', async () => {
    Platform.isMobile = true;
    const handle = await registerClaudeQuota(
      {} as never,
      {
        load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60, quotaSwitchSec: 30 } }),
        getEnv: noEnv,
      } as never,
    );
    expect(handle).toBeNull();
  });

  it('正常時 ClaudeQuotaHandle を返す', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));
    const handle = await registerClaudeQuota(
      {} as never,
      {
        load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60, quotaSwitchSec: 30 } }),
        getEnv: noEnv,
      } as never,
    );
    expect(handle).not.toBeNull();
    expect(handle?.service).toBeDefined();
    expect(handle?.view).toBeDefined();
    expect(typeof handle?.dispose).toBe('function');
    await handle?.dispose();
  });

  it('quotaEnabled=false のとき Claude プロバイダは available に入らない', async () => {
    const handle = await registerClaudeQuota(
      {} as never,
      {
        load: () => ({ general: { quotaEnabled: false, quotaRefreshSec: 60, quotaSwitchSec: 30 } }),
        getEnv: noEnv,
      } as never,
    );
    expect(handle).not.toBeNull();
    // quotaEnabled=false なので Claude は available に入らず、active は null
    expect(handle!.service.getAvailableIds()).toEqual([]);
    expect(handle!.service.getActive()).toBeNull();
    await handle?.dispose();
  });

  it('dispose で全リソース解放', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));
    const handle = await registerClaudeQuota(
      {} as never,
      {
        load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60, quotaSwitchSec: 30 } }),
        getEnv: noEnv,
      } as never,
    );
    expect(handle).not.toBeNull();
    await handle?.dispose();
    // dispose 後：Claude token 無しのため 'expired' 状態（=リソース解放確認）
    const active = handle?.service.getActive();
    expect(active?.status).toBe('expired');
  });

  it('2 回呼んでも同じ handle を返し DOM に cb-quota-indicator は 1 つのみ（冪等）', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));

    // NewTab ボタンを DOM に用意（v0.4.0 マウント位置）
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'claudian-new-tab-btn';
    nav.appendChild(newTabBtn);
    document.body.appendChild(nav);

    const fakeApp = {
      workspace: { on: () => null, offref: () => {} },
      plugins: { plugins: { realclaudian: { getView: () => ({ containerEl: nav }) } } },
    } as never;
    const store = {
      load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60, quotaSwitchSec: 30 } }),
      getEnv: noEnv,
    } as never;

    const h1 = await registerClaudeQuota(fakeApp, store);
    const h2 = await registerClaudeQuota(fakeApp, store);

    expect(h1).toBe(h2);
    expect(document.querySelectorAll('.cb-quota-indicator').length).toBe(1);
    await h1?.dispose();
  });

  it('NewTab ボタンの左隣に cb-quota-indicator がマウントされる', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));

    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'claudian-new-tab-btn';
    nav.appendChild(newTabBtn);
    document.body.appendChild(nav);

    const fakeApp = {
      workspace: { on: () => null, offref: () => {} },
      plugins: { plugins: { realclaudian: { getView: () => ({ containerEl: nav }) } } },
    } as never;
    const handle = await registerClaudeQuota(fakeApp, {
      load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 0, quotaSwitchSec: 0 } }),
      getEnv: noEnv,
    } as never);

    const bar = nav.querySelector('.cb-quota-indicator');
    expect(bar).not.toBeNull();
    expect(bar!.nextElementSibling).toBe(newTabBtn);
    await handle?.dispose();
  });

  it('データ収集周期（refreshAll）で現在モデルが再読込され表示更新される', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));

    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'claudian-new-tab-btn';
    nav.appendChild(newTabBtn);
    document.body.appendChild(nav);

    const fakeApp = {
      workspace: { on: () => null, offref: () => {} },
      plugins: { plugins: { realclaudian: { getView: () => ({ containerEl: nav }) } } },
    } as never;
    const store = {
      load: () => ({
        general: { quotaEnabled: true, quotaRefreshSec: 0, quotaSwitchSec: 0 },
        quota: { claudeSettingsPath: 'C:\\x\\settings.json' },
      }),
      getEnv: noEnv,
    } as never;

    const readMock = vi.mocked(readLlmInfoFromSettings);
    readMock.mockReturnValue({ provider: 'claude', model: 'claude-opus-4', baseUrl: null, authTokenPresent: true });

    const handle = await registerClaudeQuota(fakeApp, store);
    const modelEl = () => document.querySelector('.cb-quota-indicator__model');
    expect(modelEl()?.textContent).toBe('claude-opus-4');

    // モデル変更 → データ収集周期（refreshAll）で再読込される
    readMock.mockReturnValue({ provider: 'deepseek', model: 'deepseek-v4-flash[1M]', baseUrl: null, authTokenPresent: true });
    await handle!.service.refreshAll();
    expect(modelEl()?.textContent).toBe('deepseek-v4-flash[1M]');

    await handle?.dispose();
  });

  it('settings.json 読込失敗は best-effort（クラッシュせずモデル非表示）', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));

    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'claudian-new-tab-btn';
    nav.appendChild(newTabBtn);
    document.body.appendChild(nav);

    const fakeApp = {
      workspace: { on: () => null, offref: () => {} },
      plugins: { plugins: { realclaudian: { getView: () => ({ containerEl: nav }) } } },
    } as never;
    const store = {
      load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 0, quotaSwitchSec: 0 }, quota: { claudeSettingsPath: 'C:\\x\\settings.json' } }),
      getEnv: noEnv,
    } as never;

    vi.mocked(readLlmInfoFromSettings).mockImplementation(() => { throw new Error('parse error'); });

    const handle = await registerClaudeQuota(fakeApp, store);
    expect(handle).not.toBeNull();
    expect(document.querySelector('.cb-quota-indicator__model')).toBeNull();
    await handle?.dispose();
  });
});
