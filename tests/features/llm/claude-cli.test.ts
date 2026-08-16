import { describe, it, expect, vi, beforeEach } from 'vitest';

// child_process をモック（spawn 相当のフェイクを返す）
const spawnMock = vi.fn();
vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('child_process')>();
  return { ...orig, spawn: (...a: unknown[]) => spawnMock(...a) };
});

import { runClaudePrompt, polishInstruction, buildPolishPrompt } from '../../../src/features/llm/claude-cli';

/**
 * フェイク child。autoClose=true なら close リスナー登録後に code で自動発火
 * （手動 _emit 系テストでは autoClose=false にする）。
 */
function fakeChild(stdout: string, code = 0, autoClose = true) {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  return {
    pid: 1234,
    on: (ev: string, fn: (...a: unknown[]) => void) => {
      (listeners[ev] ??= []).push(fn);
      if (ev === 'close' && autoClose) {
        setTimeout(() => (listeners.close ?? []).forEach((f) => f(code)), 0);
      }
    },
    stdout: { on: (ev: string, fn: (d: Buffer) => void) => { if (ev === 'data' && stdout) fn(Buffer.from(stdout)); } },
    stderr: { on: () => { /* noop */ } },
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
    _emit: (ev: string, ...a: unknown[]) => (listeners[ev] ?? []).forEach((fn) => fn(...a)),
  };
}

describe('buildPolishPrompt', () => {
  it('同一言語維持・整形文のみ出力の指示と入力文を含む', () => {
    const p = buildPolishPrompt('あれやっといて');
    expect(p).toContain('あれやっといて');
    expect(p).toContain('同じ言語');
  });
});

describe('runClaudePrompt', () => {
  beforeEach(() => { spawnMock.mockReset(); });

  it('成功時は trim 済み stdout を返す', async () => {
    spawnMock.mockReturnValue(fakeChild('  整形文です  \n'));
    const r = await runClaudePrompt('test', { timeoutMs: 5000 });
    expect(r).toBe('整形文です');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('prompt を stdin に書き込み -p フラグで起動する', async () => {
    const child = fakeChild('ok');
    spawnMock.mockReturnValue(child);
    await runClaudePrompt('プロンプト', { timeoutMs: 5000 });
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(String(cmd)).toMatch(/claude/i);
    expect(args).toContain('-p');
    expect(child.stdin.write).toHaveBeenCalledWith('プロンプト');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('空応答は null を返す', async () => {
    spawnMock.mockReturnValue(fakeChild('   \n'));
    expect(await runClaudePrompt('t', { timeoutMs: 5000 })).toBeNull();
  });

  it('spawn error は null を返す（例外を投げない）', async () => {
    const child = fakeChild('ok', 0, false);
    spawnMock.mockReturnValue(child);
    const p = runClaudePrompt('t', { timeoutMs: 5000 });
    child._emit('error', new Error('ENOENT'));
    expect(await p).toBeNull();
  });

  it('exit code != 0 は null を返す', async () => {
    spawnMock.mockReturnValue(fakeChild('out', 1)); // autoClose で exit 1
    expect(await runClaudePrompt('t', { timeoutMs: 5000 })).toBeNull();
  });

  it('タイムアウトで kill して null を返す', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild('', 0, false); // close を発火させない
      spawnMock.mockReturnValue(child);
      const p = runClaudePrompt('t', { timeoutMs: 100 });
      vi.advanceTimersByTime(200);
      expect(child.kill).toHaveBeenCalled();
      child._emit('close', null);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('polishInstruction', () => {
  beforeEach(() => { spawnMock.mockReset(); });

  it('buildPolishPrompt の結果を stdin に渡し応答を返す', async () => {
    spawnMock.mockReturnValue(fakeChild('それをやっておいてください。'));
    const r = await polishInstruction('あれやっといて', { timeoutMs: 5000 });
    expect(r).toBe('それをやっておいてください。');
    const child = spawnMock.mock.results[0].value as ReturnType<typeof fakeChild>;
    expect(child.stdin.write).toHaveBeenCalledWith(buildPolishPrompt('あれやっといて'));
  });

  it('CLI 失敗時は null を返す', async () => {
    spawnMock.mockReturnValue(fakeChild('ok', 0, false));
    const p = polishInstruction('x', { timeoutMs: 5000 });
    (spawnMock.mock.results[0].value as ReturnType<typeof fakeChild>)._emit('error', new Error('boom'));
    expect(await p).toBeNull();
  });

  it('応答がコードフェンスで囲まれている場合は剥がす', async () => {
    spawnMock.mockReturnValue(fakeChild('```\n整形結果\n```'));
    const r = await polishInstruction('x', { timeoutMs: 5000 });
    expect(r).toBe('整形結果');
  });
});
