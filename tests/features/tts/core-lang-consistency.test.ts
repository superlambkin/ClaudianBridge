/**
 * addTextToTTS チャンク分割時の言語一貫性テスト（v0.27.2）。
 *
 * 不具合: 分割後の各チャンクに対して pickLang が個別実行され、
 * 英語区間だけのチャンクで音声（言語）が切り替わっていた。
 * 修正後の期待動作: 分割前の全文で 1 回だけ言語判定し、全チャンクで同一音声を使用する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { addTextToTTS } from '../../../src/features/tts/core';
import type { TtsSettings } from '../../../src/features/tts/core';
import { resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';
import { initEdgeTtsLocal, resetEdgeTtsLocalState } from '../../../src/features/tts/edge-tts-local';

// addTextToTTS の進行状況 Notice（setMessage/hide）に対応したローカルモック
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(_message: string, _timeout?: number) {}
    setMessage(_message: string): void {}
    hide(): void {}
  },
}));

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock, execFileSync: vi.fn() }));

interface StreamHandle { on: ReturnType<typeof vi.fn>; emitData: (d: unknown) => void; }
interface ChildHandle {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stderr: StreamHandle;
  stdout: StreamHandle;
  on: ReturnType<typeof vi.fn>;
  emit: (ev: string, ...args: unknown[]) => void;
  kill: ReturnType<typeof vi.fn>;
  pid?: number;
}
function makeEmitter(): StreamHandle {
  const listeners: Array<(d: unknown) => void> = [];
  return {
    on: vi.fn((_ev: string, fn: (d: unknown) => void) => { listeners.push(fn); }),
    emitData: (d: unknown) => { listeners.forEach((fn) => fn(d)); },
  };
}
function makeChild(): ChildHandle {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: makeEmitter(),
    stdout: makeEmitter(),
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => { (listeners[ev] ??= []).push(fn); return child; }),
    emit(ev: string, ...args: unknown[]) { (listeners[ev] ?? []).forEach((fn) => fn(...args)); },
    kill: vi.fn(),
  } as ChildHandle;
  return child;
}

function makeSettings(): TtsSettings {
  return {
    engine: 'edge-local',
    voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' }, webspeech: { zh: '', ja: '', en: '' } },
  };
}

/** 全文は ja 判定（かな>漢字）だが、先頭の英語区間だけのチャンクは en 判定になる長文 */
function makeMixedLongText(): string {
  const en = 'This is a long English passage used to verify chunked language consistency. '.repeat(9); // 78*9=702 chars
  const ja = 'これは日本語の読み上げテストです。'.repeat(20); // 17*20=340 chars
  return en + ja; // 合計 1042 chars → edge 既定 500 超で複数チャンク
}

const origCreateObjectURL = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;

beforeEach(() => {
  spawnMock.mockReset();
  resetPlaybackRegistry();
  initEdgeTtsLocal('C:/plugin');
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:test');
  // 各チャンクの再生を成功させる（onended で即時解決）
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    src = '';
    onended: () => void = () => {};
    play(): Promise<void> { this.onended(); return Promise.resolve(); }
    pause() {}
  };
});

afterEach(() => {
  resetEdgeTtsLocalState();
  if (origCreateObjectURL === undefined) {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  } else {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = origCreateObjectURL;
  }
  delete (globalThis as unknown as { Audio?: unknown }).Audio;
});

describe('addTextToTTS チャンク分割時の言語一貫性', () => {
  it('全文が ja 判定なら全チャンクで ja 音声を使用する（英語チャンクで aria に切り替わらない）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const settings = makeSettings();

    const text = makeMixedLongText();
    let settled = false;
    const p = addTextToTTS(null, text, settings).then((v) => { settled = true; return v; });

    // speakChunks は逐次 await のため、spawn ごとに stdout + close を発火して前進させる
    const emitted = new Set<number>();
    for (let guard = 0; guard < 50 && !settled; guard++) {
      await new Promise((r) => setTimeout(r, 0));
      const i = spawnMock.mock.calls.length - 1;
      if (i < 0) continue;
      if (!emitted.has(i)) {
        child.stdout.emitData(Buffer.from('MP3DATA'));
        child.emit('close', 0);
        emitted.add(i);
      }
    }
    await p;

    // 複数チャンクに分割されていること（前提条件）
    expect(spawnMock.mock.calls.length).toBeGreaterThan(1);
    // 全チャンクの --voice が ja で統一されていること
    const voices = spawnMock.mock.calls.map((c) => {
      const args = c[1] as string[];
      return args[args.indexOf('--voice') + 1];
    });
    expect(voices.every((v) => v === 'ja-JP-NanamiNeural')).toBe(true);
    expect(fs.existsSync(spawnMock.mock.calls[0][1][0] as string)).toBe(true);
  });
});
