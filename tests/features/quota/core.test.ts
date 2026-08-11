import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock は import の前に置く必要がある（hoisted）
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { spawn } from 'child_process';
import * as fsPromises from 'fs/promises';
import { ClaudeQuotaService } from '../../../src/features/quota/core';
import { Platform } from 'obsidian';
import { resetMocks, mockFetch } from '../../mocks/obsidian';
import type { QuotaSnapshot } from '../../../src/features/quota/types';

const spawnMock = vi.mocked(spawn);
const readFileMock = vi.mocked(fsPromises.readFile);

describe('ClaudeQuotaService.readToken', () => {
  let svc: ClaudeQuotaService;

  beforeEach(() => {
    Platform.isMobile = false;
    spawnMock.mockReset();
    readFileMock.mockReset();
    // デフォルト: macOS 環境
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    svc = new ClaudeQuotaService({
      app: {} as never,
      store: { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
      refreshSec: 60,
    });
  });

  afterEach(() => {
    Platform.isMobile = false;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  it('Mobile のとき readToken は null を返す', async () => {
    Platform.isMobile = true;
    const token = await svc.readToken();
    expect(token).toBeNull();
  });

  it('macOS で Keychain から accessToken を取得', async () => {
    spawnMock.mockImplementation((() => {
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
      // 非同期で stdout data → close を発火
      queueMicrotask(() => {
        (child as { emit: (ev: string, ...a: unknown[]) => void }).emit('data', '{"claudeAiOauth":{"accessToken":"keychain-token","expiresAt":9999999999}}');
        (child as { emit: (ev: string, ...a: unknown[]) => void }).emit('close', 0);
      });
      return child;
    }) as never);
    const token = await svc.readToken();
    expect(token).toBe('keychain-token');
  });

  it('Keychain 失敗時はファイルから fallback', async () => {
    spawnMock.mockImplementation((() => {
      const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
      const child: unknown = {
        stdout: { on() { return this; } },
        on(ev: string, fn: (...a: unknown[]) => void) {
          (handlers[ev] ??= []).push(fn);
          return this;
        },
        emit(ev: string, ...args: unknown[]) {
          (handlers[ev] ?? []).forEach((fn) => fn(...args));
        },
      };
      queueMicrotask(() => {
        (child as { emit: (ev: string, ...a: unknown[]) => void }).emit('error', new Error('spawn ENOENT security'));
      });
      return child;
    }) as never);
    readFileMock.mockResolvedValue('{"claudeAiOauth":{"accessToken":"file-token","expiresAt":9999999999}}' as never);
    const token = await svc.readToken();
    expect(token).toBe('file-token');
  });

  it('両方失敗で null を返す', async () => {
    spawnMock.mockImplementation((() => {
      const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
      const child: unknown = {
        stdout: { on() { return this; } },
        on(ev: string, fn: (...a: unknown[]) => void) {
          (handlers[ev] ??= []).push(fn);
          return this;
        },
        emit(ev: string, ...args: unknown[]) {
          (handlers[ev] ?? []).forEach((fn) => fn(...args));
        },
      };
      queueMicrotask(() => {
        (child as { emit: (ev: string, ...a: unknown[]) => void }).emit('error', new Error('spawn ENOENT security'));
      });
      return child;
    }) as never);
    readFileMock.mockRejectedValue(new Error('ENOENT .credentials.json'));
    const token = await svc.readToken();
    expect(token).toBeNull();
  });
});

describe('ClaudeQuotaService.fetchQuota', () => {
  let svc: ClaudeQuotaService;

  beforeEach(() => {
    Platform.isMobile = false;
    spawnMock.mockReset();
    readFileMock.mockReset();
    svc = new ClaudeQuotaService({
      app: {} as never,
      store: { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never,
      refreshSec: 60,
    });
  });

  afterEach(() => {
    resetMocks();
  });

  it('200 OK → success 状態の QuotaSnapshot を返す', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 62, resets_at: '2026-08-11T19:30:00Z' },
      seven_day: { utilization: 23, resets_at: '2026-08-14T11:00:00Z' },
    }), { status: 200 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('success');
    expect(snap.windows.fiveHour.utilization).toBe(62);
    expect(snap.windows.sevenDay.utilization).toBe(23);
  });

  it('401 → expired 状態を返す', async () => {
    mockFetch(async () => new Response('Unauthorized', { status: 401 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('expired');
  });

  it('500 → error 状態を返す', async () => {
    mockFetch(async () => new Response('Server Error', { status: 500 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('error');
    expect(snap.error).toContain('500');
  });

  it('JSON 解析失敗 → error 状態を返す', async () => {
    mockFetch(async () => new Response('<html>error</html>', { status: 200 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('error');
  });

  it('Authorization ヘッダーに Bearer トークンが含まれる', async () => {
    let capturedAuth: string | null = null;
    mockFetch(async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? null;
      return new Response('{}', { status: 200 });
    });
    await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('my-token');
    expect(capturedAuth).toBe('Bearer my-token');
  });

  it('anthropic-beta: oauth-2025-04-20 ヘッダーが含まれる', async () => {
    let capturedBeta: string | null = null;
    mockFetch(async (_url, init) => {
      capturedBeta = (init?.headers as Record<string, string>)?.['anthropic-beta'] ?? null;
      return new Response('{}', { status: 200 });
    });
    await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('t');
    expect(capturedBeta).toBe('oauth-2025-04-20');
  });
});
