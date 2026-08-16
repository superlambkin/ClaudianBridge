import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import { addTextToTTS, webSpeechSpeak } from '../../../src/features/tts/core';
import type { TtsSettings } from '../../../src/features/tts/core';
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
function makeSettings(engine: 'edge' | 'webspeech' | 'edge-local'): TtsSettings {
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

  it('addTextToTTS はフィルタを適用しない（speakText 側で適用済み・v0.17.0）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const settings = makeSettings('edge');
    settings.cli = { speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } };

    const p = addTextToTTS(null as never, '📢 タスク完了しました :tada:', settings);
    child.emit('close', 0);
    await p;

    // emoji が残ったままでもチャンク化・再生に渡る（フィルタは speakText の責務）
    const written = child.stdin.write.mock.calls[0][0] as string;
    expect(written).toContain('📢');
    expect(written).toContain(':tada:');
    expect(written).toContain('タスク完了しました');
  });

  it('addTextToTTS は speech_filter 未設定でもテキストをそのまま渡す（v0.17.0）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const settings = makeSettings('edge'); // cli 未設定 → 旧実装なら全最適化 ON で除去される

    const p = addTextToTTS(null as never, '📢 タスク完了しました :tada:', settings);
    child.emit('close', 0);
    await p;

    const written = child.stdin.write.mock.calls[0][0] as string;
    expect(written).toContain('📢');
    expect(written).toContain(':tada:');
    expect(written).toContain('タスク完了しました');
  });

  it('exit 0 + empty stderr/stdout → true（エラー通知なし・プログレスは表示される）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    child.emit('close', 0);
    await expect(p).resolves.toBe(true);
    // エラー通知（⚠️）は出ない。プログレス（⏳/▶）は出る。
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⚠️'))).toBe(false);
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⏳'))).toBe(true);
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

  it('stopAllPlayback で child.kill されると true を返しエラー Notice を出さない（F1: 中断はエラー扱いしない）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    expect(isTtsPlaying()).toBe(true);

    stopAllPlayback();
    expect(child.kill).toHaveBeenCalled();

    child.emit('close', 1); // kill による close（非0 exit）
    await expect(p).resolves.toBe(true);
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⚠️'))).toBe(false);
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

  it('意図的停止後に error イベントが来てもエラー Notice を出さず true を返す（F1: 中断はエラー扱いしない）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    expect(isTtsPlaying()).toBe(true);

    stopAllPlayback(); // intentionalStop=true + child.kill
    child.emit('error', new Error('ESRCH')); // kill 後の error イベント
    await expect(p).resolves.toBe(true);
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⚠️'))).toBe(false);
  });

  it('F1回帰: 既存再生を後勝ち中断した読みが外部 stopAllPlayback で止められても true を返しエラー Notice を出さない', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    // 読みA相当の偽ハンドルを再生中にしておく
    const fakeStop = vi.fn();
    registerPlayback({ engine: 'edge', stop: fakeStop });
    expect(isTtsPlaying()).toBe(true);

    // 読みB開始 → 冒頭の後勝ち stopAllPlayback で読みA相当ハンドルが中断される
    const p = addTextToTTS(null as never, 'こんにちは', makeSettings('edge'));
    expect(fakeStop).toHaveBeenCalledTimes(1);

    // 読みB再生中に外部からの中断（ミュートボタン/さらに新しい読み上げ）
    stopAllPlayback();
    child.emit('close', 1); // kill による close（非0 exit）

    await expect(p).resolves.toBe(true);
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⚠️'))).toBe(false);
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
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const stop = vi.fn();
    registerPlayback({ engine: 'edge', stop });
    expect(isTtsPlaying()).toBe(true);

    const p = addTextToTTS(null as never, 'こんにちは', makeSettings('edge'));
    expect(stop).toHaveBeenCalledTimes(1);

    child.emit('close', 0);
    await p;
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

  it('TC-L03: edge も chunkMaxChars（既定500）でチャンク分割される（v0.18.0）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = addTextToTTS(null as never, 'a'.repeat(501), makeSettings('edge'));
    child.emit('close', 0); // 1 チャンク目
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    child.emit('close', 0); // 2 チャンク目
    await p;
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(child.stdin.write).toHaveBeenNthCalledWith(1, 'a'.repeat(500));
    expect(child.stdin.write).toHaveBeenNthCalledWith(2, 'a');
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
