/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock は hoist され import の前に適用される
vi.mock('child_process', () => {
  const fn = vi.fn();
  return {
    default: { spawn: fn },
    spawn: fn,
  };
});
vi.mock('fs/promises', () => {
  const fn = vi.fn();
  return {
    default: { readFile: fn },
    readFile: fn,
  };
});

import { spawn } from 'child_process';
import * as fsPromises from 'fs/promises';
import { Platform } from 'obsidian';
import { ClaudeQuotaService } from '../../src/features/quota/core';
import { QuotaBarView } from '../../src/features/quota/view';
import { registerClaudeQuota } from '../../src/features/quota/index';
import { normalizeClaudianBridgeSettings } from '../../src/core/settings';
import { mockFetch, resetMocks } from '../mocks/obsidian';
import type { QuotaSnapshot } from '../../src/features/quota/types';

const spawnMock = vi.mocked(spawn);
const readFileMock = vi.mocked(fsPromises.readFile);

function makeSpawnSuccess(token = 'integration-token') {
  return () => {
    const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
    const stdoutHandlers: Array<(chunk: Buffer) => void> = [];
    const child: unknown = {
      stdout: {
        on(ev: string, fn: (...a: unknown[]) => void) {
          if (ev === 'data') stdoutHandlers.push(fn as (chunk: Buffer) => void);
          return this;
        },
      },
      on(ev: string, fn: (...a: unknown[]) => void) {
        (handlers[ev] ??= []).push(fn);
        return this;
      },
      emit(ev: string, ...args: unknown[]) {
        if (ev === 'data' && stdoutHandlers[0]) stdoutHandlers[0](Buffer.from(args[0] as string));
        (handlers[ev] ?? []).forEach((fn) => fn(...args));
      },
    };
    queueMicrotask(() => {
      (child as { emit: (ev: string, ...a: unknown[]) => void }).emit(
        'data',
        JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt: 9999999999 } }),
      );
      (child as { emit: (ev: string, ...a: unknown[]) => void }).emit('close', 0);
    });
    return child;
  };
}

function mockQuotaResponse() {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        five_hour: { utilization: 50, resets_at: '2099-01-01T00:00:00Z' },
        seven_day: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
      }),
      { status: 200 },
    ),
  );
}

function makeAppWithWrapper(wrapper: HTMLElement): unknown {
  return {
    plugins: {
      plugins: {
        realclaudian: {
          getView: () => ({ getInputWrapper: () => wrapper }),
        },
      },
    },
  };
}

describe('Quota Integration', () => {
  beforeEach(() => {
    Platform.isMobile = false;
    resetMocks();
    spawnMock.mockReset();
    readFileMock.mockReset();
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    document.body.innerHTML = '<div class="claudian-input-wrapper"></div>';
  });

  afterEach(() => {
    Platform.isMobile = false;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    document.body.innerHTML = '';
  });

  it('フルライフサイクル: start → emit → render → stop', async () => {
    mockQuotaResponse();
    spawnMock.mockImplementation(makeSpawnSuccess() as never);

    const anchor = document.querySelector('.claudian-input-wrapper') as HTMLElement;
    const view = new QuotaBarView();
    view.mount(anchor);

    const svc = new ClaudeQuotaService({
      app: makeAppWithWrapper(anchor) as never,
      store: { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
      refreshSec: 60,
    });

    const received: string[] = [];
    svc.onUpdate((s: QuotaSnapshot) => {
      received.push(s.status);
      view.render(s);
    });

    await svc.start();
    expect(received).toContain('success');
    expect(view['el']?.getAttribute('data-status')).toBe('success');

    await svc.stop();
    view.unmount();
  });

  it('Settings 変更伝播: quotaEnabled=true で Service が start する', async () => {
    mockQuotaResponse();
    spawnMock.mockImplementation(makeSpawnSuccess() as never);

    const cfg = normalizeClaudianBridgeSettings({});
    cfg.general.quotaEnabled = true;
    cfg.general.quotaRefreshSec = 60;

    const anchor = document.querySelector('.claudian-input-wrapper') as HTMLElement;
    const handle = await registerClaudeQuota(
      makeAppWithWrapper(anchor) as never,
      { load: () => cfg } as never,
    );

    expect(handle).not.toBeNull();
    expect(handle!.service.getSnapshot().status).toBe('success');
    await handle!.dispose();
  });

  it('複数 View が同一 Service からの更新を受信', async () => {
    mockQuotaResponse();
    spawnMock.mockImplementation(makeSpawnSuccess() as never);

    const anchor = document.querySelector('.claudian-input-wrapper') as HTMLElement;
    const view1 = new QuotaBarView();
    const view2 = new QuotaBarView();
    view1.mount(anchor);
    view2.mount(anchor);

    const svc = new ClaudeQuotaService({
      app: {} as never,
      store: {} as never,
      refreshSec: 60,
    });

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    svc.onUpdate(cb1);
    svc.onUpdate(cb2);

    await svc.start();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();

    await svc.stop();
    view1.unmount();
    view2.unmount();
  });

  it('Settings バリデーション: quotaRefreshSec 欠損 → デフォルト 60', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaRefreshSec).toBe(60);
  });
});
