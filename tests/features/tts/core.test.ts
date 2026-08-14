import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { addTextToTTS, webSpeechSpeak } from '../../../src/features/tts/core';
import type { TtsSettings } from '../../../src/features/tts/core';
import { plachtaTtsSpeak } from '../../../src/features/tts/plachta-tts';
import { PLACHTA_DEFAULT_SPEAKER } from '../../../src/features/tts/plachta-tts';

// ── mocks ──────────────────────────────────────────────────────────────────
// Notice: replace with a spy so we can assert toast messages.
const { noticeMock } = vi.hoisted(() => ({ noticeMock: vi.fn() }));
vi.mock('obsidian', () => ({ Notice: noticeMock }));

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock }));

// plachta-tts: mock して dispatcher の分岐を検証
vi.mock('../../../src/features/tts/plachta-tts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/tts/plachta-tts')>();
  return {
    ...actual,
    plachtaTtsSpeak: vi.fn(),
  };
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

/** v0.8.0: plachta エンジン用 settings ヘルパー */
function makePlachtaSettings(): TtsSettings {
  return {
    engine: 'plachta',
    voices: {
      edge:      { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' },
      webspeech: { zh: '',         ja: '',       en: '' },
    },
    plachta: {
      speaker: PLACHTA_DEFAULT_SPEAKER,
      language: '日本語',
      speed: 1.0,
    },
  };
}

beforeEach(() => {
  spawnMock.mockReset();
  noticeMock.mockClear();
  vi.mocked(plachtaTtsSpeak).mockReset();
  vi.mocked(plachtaTtsSpeak).mockResolvedValue(true);
});

// ── helper: window モック（webSpeechSpeak / TC-L04 用）──────────────────────
// Node には window が無いため、最小の window モックを作る。
// speak() は渡された utterance を保持し、テストから onend を発火できるようにする。
// SpeechSynthesisUtterance はコンストラクタのテキストを this.text に保持する。
function mockWindowWithSpeech() {
  let lastUtterance: { onend?: (() => void) | null } | null = null;
  const synth = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    speak: vi.fn((_u: unknown) => {
      lastUtterance = _u as typeof lastUtterance;
    }),
  };
  (globalThis as unknown as { window: unknown }).window = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class {
      voice: { name?: string } | null = null;
      lang = '';
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      text: string;
      constructor(t: string) { this.text = t; }
    },
  };
  return {
    synth,
    fireEnd: () => lastUtterance?.onend?.(),
  };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
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

describe('webSpeechSpeak (v0.10.0 onend fix)', () => {
  it('onend 発火後に true を返す（100ms 待たない）', async () => {
    vi.useFakeTimers();
    try {
      const { synth, fireEnd } = mockWindowWithSpeech();
      const notice = vi.fn();
      let resolved: boolean | undefined;
      const p = webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice).then((v) => { resolved = v; });
      // 旧実装（setTimeout 100ms）はここで resolve してしまうため FAIL する
      await vi.advanceTimersByTimeAsync(200);
      expect(resolved).toBeUndefined();
      fireEnd();
      await p;
      expect(resolved).toBe(true);
      expect(synth.speak).toHaveBeenCalledTimes(1);
      expect(notice).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('onerror 発火時は false を返す', async () => {
    const { synth } = mockWindowWithSpeech();
    const notice = vi.fn();
    // SpeechSynthesisUtterance の onerror を発火するため、speak を上書き
    const orig = synth.speak;
    synth.speak = vi.fn((_u: unknown) => {
      const u = _u as { onerror?: (e: unknown) => void };
      u.onerror?.(new Error('boom'));
    });
    const result = await webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Web Speech 再生エラー'));
    orig.mockClear();
  });
});

describe('plachtaTtsSpeak (via addTextToTTS, v0.8.0)', () => {
  it('TC-N01: engine === "plachta" → plachtaTtsSpeak が呼ばれ spawn されない', async () => {
    const p = addTextToTTS(null as never, 'こんにちは', makePlachtaSettings());
    await p;

    // plachtaTtsSpeak が text と settings を受け取って呼ばれた
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(1);
    expect(plachtaTtsSpeak).toHaveBeenCalledWith(
      'こんにちは',
      expect.objectContaining({ engine: 'plachta' }),
      expect.any(Function),
    );
    // spawn (edge 経路) は呼ばれない
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('TC-N01 続き: plachtaTtsSpeak が false を返したら dispatcher 全体も false を返す', async () => {
    vi.mocked(plachtaTtsSpeak).mockResolvedValueOnce(false);
    const p = addTextToTTS(null as never, 'こんにちは', makePlachtaSettings());
    await expect(p).resolves.toBe(false);
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(1);
  });
});

describe('addTextToTTS chunking (v0.10.0)', () => {
  it('TC-L01: plachta 1001文字 → 140字チャンクに分割して複数回 plachtaTtsSpeak を呼ぶ（実測制限150字）', async () => {
    const longText = 'あ'.repeat(1001);
    const p = addTextToTTS(null as never, longText, makePlachtaSettings());
    await p;
    // 1001 = 140×7 + 21 → 8 チャンク
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(8);
    const calls = vi.mocked(plachtaTtsSpeak).mock.calls.map((c) => c[0] as string);
    expect(calls.slice(0, 7).every((c) => c.length === 140)).toBe(true);
    expect(calls[7].length).toBe(21);
  });

  it('TC-L02: plachta 140文字以下は分割しない（1回だけ）', async () => {
    const shortText = 'あ'.repeat(140);
    await addTextToTTS(null as never, shortText, makePlachtaSettings());
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(1);
  });

  it('TC-L03: edge はチャンキングしない（制限 null）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const longText = 'a'.repeat(5000);
    const p = addTextToTTS(null as never, longText, makeSettings('edge'));
    child.emit('close', 0);
    await p;
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith(longText);
  });

  it('TC-L04: webspeech 450字 → 3チャンク(200/200/50)で連続再生', async () => {
    const { synth, fireEnd } = mockWindowWithSpeech();
    const notice = vi.fn();
    const p = addTextToTTS(null as never, 'こ'.repeat(450), makeSettings('webspeech'));
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    fireEnd();
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(2));
    fireEnd();
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(3));
    fireEnd();
    await expect(p).resolves.toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(3);
    const lengths = (synth.speak.mock.calls as unknown[][]).map((c) => (c[0] as { text: string }).text.length);
    expect(lengths).toEqual([200, 200, 50]);
    expect(notice).not.toHaveBeenCalled();
  });
});
