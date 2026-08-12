import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { addTextToTTS } from '../../../src/features/tts/core';

// ── mocks ──────────────────────────────────────────────────────────────────
// Notice: replace with a spy so we can assert toast messages.
const { noticeMock } = vi.hoisted(() => ({ noticeMock: vi.fn() }));
vi.mock('obsidian', () => ({ Notice: noticeMock }));

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock }));

// ── helper: make a controllable ChildProcess-like handle ──────────────────
interface StreamHandle {
  on: ReturnType<typeof vi.fn>;
  emitData: (d: string) => void;
}
interface ChildHandle {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stderr: StreamHandle;
  stdout: StreamHandle;
  on: ReturnType<typeof vi.fn>;
  emit: (ev: string, ...args: unknown[]) => void;
}

function makeEmitter(): StreamHandle {
  const listeners: Array<(d: string) => void> = [];
  return {
    on: vi.fn((_ev: string, fn: (d: string) => void) => {
      listeners.push(fn);
    }),
    emitData: (d: string) => {
      listeners.forEach((fn) => fn(d));
    },
  };
}

function makeChild(): ChildHandle {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: makeEmitter(),
    stdout: makeEmitter(),
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      (listeners[ev] ??= []).push(fn);
      return child;
    }),
    emit(ev: string, ...args: unknown[]) {
      (listeners[ev] ?? []).forEach((fn) => fn(...args));
    },
  } as ChildHandle;
  return child;
}

const expectedCmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');

beforeEach(() => {
  spawnMock.mockReset();
  noticeMock.mockClear();
});

// ── tests ──────────────────────────────────────────────────────────────────
describe('claudettsHttpSpeak (via addTextToTTS)', () => {
  it('spawns `python <commands.py> speak` and pipes text to stdin', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'こんにちは', { engine: 'claudetts' });
    child.emit('close', 0);
    await p;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][0]).toBe('python');
    expect(spawnMock.mock.calls[0][1][0]).toBe(expectedCmd);
    expect(spawnMock.mock.calls[0][1][1]).toBe('speak');
    expect(child.stdin.write).toHaveBeenCalledWith('こんにちは');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('exit 0 + empty stderr/stdout → true', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'claudetts' });
    child.emit('close', 0);
    await expect(p).resolves.toBe(true);
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it('exit 0 + stderr usage string → false (無音失敗検出)', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'claudetts' });
    child.stderr.emitData('使い方: python commands.py {status|test|config|voice|mute|speak} [args...]');
    child.emit('close', 0);

    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('speak サブコマンド未定義'),
    );
  });

  it('exit 0 + stdout usage string → false (usage が stdout に出る場合も検出)', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'claudetts' });
    child.stdout.emitData('usage: python commands.py speak <text>');
    child.emit('close', 0);

    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('speak サブコマンド未定義'),
    );
  });

  it('exit 1 → false + Notice', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'claudetts' });
    child.stderr.emitData('boom');
    child.emit('close', 1);

    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('ClaudeTTS 失敗 (exit 1)'),
    );
  });

  it('spawn error event → false + Notice', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'claudetts' });
    child.emit('error', new Error('ENOENT'));
    child.emit('close', -2);

    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('ClaudeTTS 失敗'),
    );
  });

  it('auto engine: claudetts 失敗時は Web Speech フォールバックを試行する', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', { engine: 'auto' });
    child.stderr.emitData('使い方: python commands.py {status|test|config|voice|mute|speak} [args...]');
    child.emit('close', 0);

    // claudetts は usage 検出で false → Web Speech へ。Node 環境は window 無し → false。
    await expect(p).resolves.toBe(false);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    // usage 警告 + Web Speech 非対応の 2 回 Notice が出る
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('speak サブコマンド未定義'),
    );
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('Web SpeechSynthesis API'),
    );
  });
});
