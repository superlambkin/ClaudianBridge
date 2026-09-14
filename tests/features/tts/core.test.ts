import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import { addTextToTTS, webSpeechSpeak, edgeCloudHttpSpeak } from '../../../src/features/tts/core';
import type { TtsSettings } from '../../../src/features/tts/core';
import type { TtsEdgeCloudSettings } from '../../../src/core/settings';
import type { TtsEngine } from '../../../src/core/settings';
import { plachtaSpeakChunksPipelined } from '../../../src/features/tts/plachta-tts';
import { PLACHTA_DEFAULT_SPEAKER } from '../../../src/features/tts/plachta-tts';
import { isTtsPlaying, stopAllPlayback, resetPlaybackRegistry, registerPlayback } from '../../../src/features/tts/playback-registry';

// ── mocks ──────────────────────────────────────────────────────────────────
// Notice: replace with a spy so we can assert toast messages.
// new Notice(msg, dur) は hide/setMessage を持つインスタンスを返す（プログレス表示対応）。
const { noticeMock } = vi.hoisted(() => ({
  noticeMock: vi.fn().mockImplementation((_msg: string, _dur?: number) => ({
    setMessage: vi.fn(),
    hide: vi.fn(),
  })),
}));
vi.mock('obsidian', () => ({ Notice: noticeMock }));

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock }));

// plachta-tts: mock して dispatcher の分岐を検証
vi.mock('../../../src/features/tts/plachta-tts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/tts/plachta-tts')>();
  return {
    ...actual,
    plachtaSpeakChunksPipelined: vi.fn(),
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
  kill: ReturnType<typeof vi.fn>;
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
    kill: vi.fn(),
  } as ChildHandle;
  return child;
}

const expectedCmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');

/** v0.6.0: voices がネスト必須になったテストヘルパー */
function makeSettings(engine: 'edge' | 'webspeech' | 'edge-local'): TtsSettings;
function makeSettings(overrides: Partial<TtsSettings>): TtsSettings;
function makeSettings(arg: 'edge' | 'webspeech' | 'edge-local' | Partial<TtsSettings>): TtsSettings {
  const engine: TtsEngine = typeof arg === 'string' ? arg : (arg.engine ?? 'edge');
  const base: TtsSettings = {
    engine,
    voices: {
      edge:      { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' },
      webspeech: { zh: '',         ja: '',       en: '' },
    },
  };
  if (typeof arg === 'string') return base;
  // v0.27.0: overrides で部分指定を可能にする（makeSettings({ edgeCloud: {...} }) 形式）
  return { ...base, ...arg, voices: base.voices };
}

/** v0.27.0: edgeCloud 設定のみを持つヘルパー */
function edgeCloud(partial: Partial<TtsEdgeCloudSettings> = {}): TtsEdgeCloudSettings {
  return {
    serverUrl: '',
    authToken: '',
    timeout: 30_000,
    ...partial,
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
  resetPlaybackRegistry();
  vi.mocked(plachtaSpeakChunksPipelined).mockReset();
  vi.mocked(plachtaSpeakChunksPipelined).mockResolvedValue(true);
  // Node には URL.createObjectURL が無いためモックする（edge-local 経路）
  URL.createObjectURL = vi.fn(() => 'blob:test') as unknown as typeof URL.createObjectURL;
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
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
});

// ── tests ──────────────────────────────────────────────────────────────────
// v0.27.0: claudettsHttpSpeak は削除され edgeCloudHttpSpeak（HTTPS POST プロキシ方式）に置換。
// 旧 spawn ベース経路のテスト（12件）は削除。dispatcher の edge 経路検証は
// edgeCloudHttpSpeak 直結テストと新 dispatcher テスト（後述）でカバーする。
describe('edgeCloudHttpSpeak (v0.27.0)', () => {
  it('serverUrl 未設定で false 返却 + Notice', async () => {
    const notice = vi.fn();
    const result = await edgeCloudHttpSpeak('hello', makeSettings({}), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('URL'));
  });

  it('POST が serverUrl に向かい Authorization ヘッダが付く', async () => {
    // Audio: テスト用に即座に onended を発火させるモック
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mpeg' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings = makeSettings({
      edgeCloud: edgeCloud({
        serverUrl: 'https://my-proxy.local/speak',
        authToken: 'secret-token',
        timeout: 5000,
      }),
    });
    const result = await edgeCloudHttpSpeak('你好', settings, vi.fn());
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://my-proxy.local/speak',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        }),
        body: expect.stringContaining('"text"'),
      }),
    );
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { Audio?: unknown }).Audio;
  });

  it('authToken 空文字のとき Authorization ヘッダなし', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    await edgeCloudHttpSpeak('hi', makeSettings({
      edgeCloud: edgeCloud({ serverUrl: 'https://x.local', authToken: '', timeout: 5000 }),
    }), vi.fn());
    const call = fetchMock.mock.calls[0];
    expect(call[1].headers).not.toHaveProperty('Authorization');
    vi.unstubAllGlobals();
  });

  it('HTTP 400 で false 返却 + Notice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', fetchMock);
    const notice = vi.fn();
    const result = await edgeCloudHttpSpeak('x', makeSettings({
      edgeCloud: edgeCloud({ serverUrl: 'https://x.local', authToken: '', timeout: 5000 }),
    }), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('400'));
    vi.unstubAllGlobals();
  });
});

describe('addTextToTTS dispatcher (v0.27.0)', () => {
  it('engine=edge → edgeCloudHttpSpeak（HTTPS POST）が呼ばれ spawn は実行されない', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mpeg' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    try {
      const settings = makeSettings({
        edgeCloud: edgeCloud({ serverUrl: 'https://x.local', authToken: '', timeout: 5000 }),
      });
      await addTextToTTS(null as never, 'こんにちは', settings);
      expect(spawnMock).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://x.local');
    } finally {
      vi.unstubAllGlobals();
      delete (globalThis as unknown as { Audio?: unknown }).Audio;
    }
  });

  it('engine=edge で serverUrl 未設定 → false 返却 + Notice', async () => {
    const settings = makeSettings('edge'); // edgeCloud は渡さない（normalize でデフォルト）
    // serverUrl が空文字のため edgeCloudHttpSpeak が即 false を返す
    await expect(addTextToTTS(null as never, 'hello', settings)).resolves.toBe(false);
    expect(noticeMock).toHaveBeenCalledWith(
      expect.stringContaining('URL'),
    );
    expect(spawnMock).not.toHaveBeenCalled();
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

  it('addTextToTTS は冒頭で stopAllPlayback を呼び既存再生を中断する（重複読み防止・後勝ち）', async () => {
    // edge 経路でも dispatcher 冒頭で stopAllPlayback が呼ばれることを確認
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mpeg' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    try {
      const stop = vi.fn();
      registerPlayback({ engine: 'edge', stop });
      expect(isTtsPlaying()).toBe(true);

      const settings = makeSettings({
        edgeCloud: edgeCloud({ serverUrl: 'https://x.local', authToken: '', timeout: 5000 }),
      });
      const p = addTextToTTS(null as never, 'こんにちは', settings);
      expect(stop).toHaveBeenCalledTimes(1);
      await p;
    } finally {
      vi.unstubAllGlobals();
      delete (globalThis as unknown as { Audio?: unknown }).Audio;
    }
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

  it('stopAllPlayback で synth.cancel されると false を返しエラー Notice を出さない', async () => {
    const { synth } = mockWindowWithSpeech();
    const notice = vi.fn();
    let resolved: boolean | undefined;
    const p = webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice).then((v) => { resolved = v; });

    expect(isTtsPlaying()).toBe(true);
    stopAllPlayback();
    expect(synth.cancel).toHaveBeenCalled();

    // Chrome 挙動: cancel 後に onerror(canceled/interrupted) が発火
    const u = synth.speak.mock.calls[0][0] as { onerror?: (e: unknown) => void };
    u.onerror?.(new Error('canceled'));

    await p;
    expect(resolved).toBe(false);
    expect(notice).not.toHaveBeenCalled();
  });
});

describe('plachtaSpeakChunksPipelined (via addTextToTTS, v0.10.0)', () => {
  it('TC-N01: engine === "plachta" → plachtaSpeakChunksPipelined が呼ばれ spawn されない', async () => {
    const p = addTextToTTS(null as never, 'こんにちは', makePlachtaSettings());
    await p;

    // plachtaSpeakChunksPipelined がチャンク配列と settings + noticeFn + onProgress を受け取って呼ばれた
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledWith(
      ['こんにちは'],
      expect.objectContaining({ engine: 'plachta' }),
      expect.any(Function),
      expect.any(Function),
    );
    // spawn (edge 経路) は呼ばれない
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('TC-N01 続き: plachtaSpeakChunksPipelined が false を返したら dispatcher 全体も false を返す', async () => {
    vi.mocked(plachtaSpeakChunksPipelined).mockResolvedValueOnce(false);
    const p = addTextToTTS(null as never, 'こんにちは', makePlachtaSettings());
    await expect(p).resolves.toBe(false);
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
  });
});

describe('addTextToTTS chunking (v0.10.0)', () => {
  it('TC-L01: plachta 1001文字 → 140字×7+21 = 8チャンクを plachtaSpeakChunksPipelined に渡す（実測制限150字）', async () => {
    await addTextToTTS(null as never, 'あ'.repeat(1001), makePlachtaSettings());
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
    const chunks = vi.mocked(plachtaSpeakChunksPipelined).mock.calls[0][0];
    expect(chunks.length).toBe(8);
    expect(chunks.slice(0, 7).every((c) => c.length === 140)).toBe(true);
    expect(chunks[7].length).toBe(21);
  });

  it('TC-L02: plachta 140文字以下は分割しない（1チャンク）', async () => {
    await addTextToTTS(null as never, 'あ'.repeat(140), makePlachtaSettings());
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
    expect(vi.mocked(plachtaSpeakChunksPipelined).mock.calls[0][0].length).toBe(1);
  });

  it('v0.32.10: plachta 経路でも onChunkStart が plachtaSpeakChunksPipelined に伝播する（下線原因⑥）', async () => {
    const onChunkStart = vi.fn();
    await addTextToTTS(null as never, 'あ'.repeat(300), makePlachtaSettings(), onChunkStart);
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
    const args = vi.mocked(plachtaSpeakChunksPipelined).mock.calls[0];
    // 第 5 引数（index 4）として onChunkStart が渡される
    expect(args[4]).toBe(onChunkStart);
  });

  it('TC-L04: webspeech 450字 → 4チャンク(140/140/140/30)で連続再生（v0.17.0）', async () => {
    const { synth, fireEnd } = mockWindowWithSpeech();
    const notice = vi.fn();
    const p = addTextToTTS(null as never, 'こ'.repeat(450), makeSettings('webspeech'));
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    fireEnd();
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(2));
    fireEnd();
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(3));
    fireEnd();
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(4));
    fireEnd();
    await expect(p).resolves.toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(4);
    const lengths = (synth.speak.mock.calls as unknown[][]).map((c) => (c[0] as { text: string }).text.length);
    expect(lengths).toEqual([140, 140, 140, 30]);
    expect(notice).not.toHaveBeenCalled();
  });

  it('chunkMaxChars.plachta=100（非デフォルト）で plachta がチャンク分割される（v0.18.0）', async () => {
    const s = makePlachtaSettings();
    s.chunkMaxChars = { ...s.chunkMaxChars, plachta: 100 };
    await addTextToTTS(null as never, 'あ'.repeat(141), s);
    expect(plachtaSpeakChunksPipelined).toHaveBeenCalledTimes(1);
    const chunks = vi.mocked(plachtaSpeakChunksPipelined).mock.calls[0][0];
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(100);
  });

  it('TC-EL01: engine=edge-local → spawn で localEdgeTtsSpeak 経由になる（voice=フル名・edge-tts-path 付き）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const settings = makeSettings('edge-local');
    settings.edgeTtsModulePath = 'C:/MyEdgeTts';
    // localEdgeTtsSpeak は設定パスに edge_tts が存在するか実 fs で確認する（pathExistsEdgeTts）。
    // テスト環境では existsSync をモックしてガードを通過させる（Task 4 実装由来の制約）。
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    try {
      const p = addTextToTTS(null as never, 'こんにちは', settings);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(spawnMock.mock.calls[0][0]).toBe('python');
      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args[0]).toContain('claudian_bridge_edge_tts.py');
      expect(args[2]).toBe('ja-JP-NanamiNeural'); // かな判定 → ja 音声
      expect(args).toContain('--edge-tts-path');
      expect(args[args.indexOf('--edge-tts-path') + 1]).toBe('C:/MyEdgeTts');
      child.emit('close', 0);
      await p;
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('TC-EL02: edge-local は 501 文字を chunkMaxChars.edge（既定 500）で分割する', async () => {
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = addTextToTTS(null as never, 'a'.repeat(501), makeSettings('edge-local'));
    // localEdgeTTS は stdout 音声が空だと失敗扱い（Task 4 実装）→ 各チャンクで音声データを流す
    child.stdout.emitData(Buffer.from('MP3DATA')); // chunk1 の音声
    child.emit('close', 0); // chunk1 完了 → chunk2 spawn
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    child.stdout.emitData(Buffer.from('MP3DATA')); // chunk2 の音声
    child.emit('close', 0); // chunk2 完了
    await p;
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect((child.stdin.write.mock.calls[0][0] as string).length).toBe(500);
  });
});

describe('chunkTextNatural 統合 (v0.35.0)', () => {
  it('見出しをまたぐテキストは見出し直前でチャンクが分かれる', async () => {
    await addTextToTTS(null as never, 'あ'.repeat(120) + '。\n# 見出し\n' + 'い'.repeat(120) + '。', makePlachtaSettings());
    const chunks = vi.mocked(plachtaSpeakChunksPipelined).mock.calls.at(-1)?.[0] as string[];
    expect(chunks.length).toBe(2);
    expect(chunks[1].startsWith('見出し')).toBe(true);
    expect(chunks[1]).not.toContain('#');
  });
});
