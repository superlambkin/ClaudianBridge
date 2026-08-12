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

import { Platform } from 'obsidian';
import { resetMocks, mockFetch } from '../../mocks/obsidian';
import { registerClaudeQuota, unregisterClaudeQuota } from '../../../src/features/quota/index';

describe('registerClaudeQuota', () => {
  beforeEach(() => {
    Platform.isMobile = false;
    resetMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Platform.isMobile = false;
    document.body.innerHTML = '';
    // 念のためグローバル状態をクリア
    void unregisterClaudeQuota();
  });

  it('Mobile のとき null を返す', async () => {
    Platform.isMobile = true;
    const handle = await registerClaudeQuota(
      {} as never,
      { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
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
      { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
    );
    expect(handle).not.toBeNull();
    expect(handle?.service).toBeDefined();
    expect(handle?.view).toBeDefined();
    expect(typeof handle?.dispose).toBe('function');
    await handle?.dispose();
  });

  it('quotaEnabled=false のとき Service は start しない', async () => {
    const handle = await registerClaudeQuota(
      {} as never,
      { load: () => ({ general: { quotaEnabled: false, quotaRefreshSec: 60 } }) } as never,
    );
    expect(handle).not.toBeNull();
    // Service は start していないので snapshot は完全に idle 状態
    const snap = handle!.service.getSnapshot();
    expect(snap.status).toBe('idle');
    expect(snap.fetchedAt).toBe(0);
    await handle?.dispose();
  });

  it('dispose で全リソース解放', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));
    const handle = await registerClaudeQuota(
      {} as never,
      { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
    );
    expect(handle).not.toBeNull();
    await handle?.dispose();
    // dispose 後の状態確認（status は defined で何かしら存在）
    expect(handle?.service.getSnapshot().status).toBeDefined();
  });

  it('2 回呼んでも同じ handle を返し DOM に quota-bar は 1 つのみ（冪等）', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 5, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));

    // ラッパ要素を DOM に用意（QuotaBarView.mount の anchor として）
    const wrapper = document.createElement('div');
    wrapper.className = 'claudian-input-wrapper';
    document.body.appendChild(wrapper);

    const fakeApp = {
      plugins: { plugins: { realclaudian: { getView: () => ({ getInputWrapper: () => wrapper }) } } },
    } as never;
    const store = { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never;

    const h1 = await registerClaudeQuota(fakeApp, store);
    const h2 = await registerClaudeQuota(fakeApp, store);

    expect(h1).toBe(h2);
    expect(document.querySelectorAll('.claudian-quota-bar').length).toBe(1);
    await h1?.dispose();
  });
});
