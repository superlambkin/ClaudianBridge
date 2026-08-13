import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { addTextToTTS } from '../../../src/features/tts/core';
import type { TtsSettings } from '../../../src/features/tts/core';

// ── mocks ──────────────────────────────────────────────────────────────────
// Notice: replace with a spy so we can assert toast messages.
const { noticeMock } = vi.hoisted(() => ({ noticeMock: vi.fn() }));
vi.mock('obsidian', () => ({ Notice: noticeMock }));

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock }));

// fs.existsSync: モジュールレベルで差し替え（ESM namespace は configurable:false なため
// vi.spyOn は失敗する → vi.mock で実体ごと差し替える）
const { existsMock } = vi.hoisted(() => ({ existsMock: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, existsSync: existsMock };
});

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

/** v0.6.0: voices がネスト必須になったテストヘルパー */
function makeSettings(engine: 'edge' | 'webspeech'): TtsSettings {
  return {
    engine,
    voices: {
      edge:      { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' },
      webspeech: { zh: '',         ja: '',       en: '' },
    },
  };
}

/** v0.7.0: anime-tts 用 settings ヘルパー */
function makeDamSettings(opts: { dir?: string } = {}): TtsSettings {
  return {
    engine: 'damarcreative',
    voices: {
      edge:      { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' },
      webspeech: { zh: '',         ja: '',       en: '' },
    },
    animeTtsDir: opts.dir ?? '',
  };
}

beforeEach(() => {
  spawnMock.mockReset();
  noticeMock.mockClear();
  existsMock.mockReset();
});

// ── tests ──────────────────────────────────────────────────────────────────
describe('claudettsHttpSpeak (via addTextToTTS)', () => {
  it('spawns `python <commands.py> speak` and pipes text to stdin', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'こんにちは', makeSettings('edge'));
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

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    child.emit('close', 0);
    await expect(p).resolves.toBe(true);
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it('exit 0 + stderr usage string → false (無音失敗検出)', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
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

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
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

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
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

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    child.emit('error', new Error('ENOENT'));
    child.emit('close', -2);

    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('ClaudeTTS 失敗'),
    );
  });

  it('webspeech engine: Node 環境では API がなく false を返す', async () => {
    // engine=webspeech: Node 環境では window.speechSynthesis が無い → false
    const p = addTextToTTS(null as never, 'hello', makeSettings('webspeech'));
    await expect(p).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('Web SpeechSynthesis API が利用できません'),
    );
  });
});

describe('damarcreativeSpeak (via addTextToTTS, v0.7.0)', () => {
  it('TC-A03: animeTtsDir 未設定で spawn されず false + 案内 Notice', async () => {
    const p = addTextToTTS(null as never, 'こんにちは', makeDamSettings());
    await expect(p).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('anime-tts ディレクトリ未設定'),
    );
  });

  it('TC-A06: zh テキストを damarcreative で → spawn されず false + 日本語限定 Notice', async () => {
    const p = addTextToTTS(null as never, '你好', makeDamSettings({ dir: 'D:\\fake' }));
    await expect(p).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('日本語のみ対応'),
    );
  });

  // 共通: fs.existsSync をパス検証用に偽装
  // vi.mock('fs') で existsMock にすり替えてあるため、ここでは実装を差し替えるだけ。
  const DAMAR_EXIST_PATHS = new Set<string>([
    'D:\\fake',
    'D:\\fake\\models.py',
    'D:\\fake\\configs',
    'D:\\fake\\model\\ameth.pth',
  ]);
  const stubExists = (): ReturnType<typeof vi.fn> => {
    existsMock.mockReset();
    return existsMock.mockImplementation((p) => DAMAR_EXIST_PATHS.has(String(p)));
  };

  it('TC-A04: dir 正常時 pickPython → adapter spawn し正しい引数・--text-file で実行', async () => {
    stubExists();
    // 1 回目: pickPython の venv python --version → close 0 で成功
    const probe = makeChild();
    spawnMock.mockImplementationOnce(() => probe as never);
    // 2 回目: 本体 adapter → close 0 → wav 不在で E9 経路（false）
    const child = makeChild();
    spawnMock.mockImplementationOnce(() => child as never);

    const p = addTextToTTS(null as never, 'こんにちは', makeDamSettings({ dir: 'D:\\fake' }));
    // pickPython 内 await を解決
    probe.emit('close', 0);
    // microtask 待機 → addTextToTTS が adapter spawn を実行
    await new Promise<void>((r) => setTimeout(r, 0));
    // adapter exit 0 → wav 不在 → E9 → false
    child.emit('close', 0);
    await expect(p).resolves.toBe(false);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const adapterCall = spawnMock.mock.calls[1];
    expect(adapterCall[1][0]).toContain('anime_tts_adapter.py');
    expect(adapterCall[1]).toContain('--dir');
    expect(adapterCall[1]).toContain('D:\\fake');
    expect(adapterCall[1]).toContain('--model');
    expect(adapterCall[1]).toContain('ameth.pth');
    expect(adapterCall[1]).toContain('--out');
    // RC7 修正: テキストは --text-file 経由（stdin パイプは Electron でデッドロックするため）
    expect(adapterCall[1]).toContain('--text-file');
    // stdin.write は呼ばれず、end() のみで即クローズ
    expect(child.stdin.write).not.toHaveBeenCalled();
    expect(child.stdin.end).toHaveBeenCalled();
    existsMock.mockReset();
  });

  it('TC-A05: adapter spawn exit != 0 → false + Notice（stderr 末尾を保持）', async () => {
    stubExists();
    const probe = makeChild();
    spawnMock.mockImplementationOnce(() => probe as never);
    const child = makeChild();
    spawnMock.mockImplementationOnce(() => child as never);

    const p = addTextToTTS(null as never, 'こんにちは', makeDamSettings({ dir: 'D:\\fake' }));
    probe.emit('close', 0);
    await new Promise<void>((r) => setTimeout(r, 0));
    child.stderr.emitData('ModuleNotFoundError: No module named torch');
    child.emit('close', 1);
    await expect(p).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('anime-tts 失敗 (exit 1)'),
    );
    existsMock.mockReset();
  });
});
