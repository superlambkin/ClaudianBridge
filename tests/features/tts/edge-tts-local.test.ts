import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { localEdgeTtsSpeak, resolveEdgeTtsModulePath, resolveEdgeVoiceFull, initEdgeTtsLocal, resetEdgeTtsLocalState } from '../../../src/features/tts/edge-tts-local';
import type { TtsSettings } from '../../../src/features/tts/core';
import { isTtsPlaying, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';

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

const origCreateObjectURL = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;

beforeEach(() => {
  spawnMock.mockReset();
  resetPlaybackRegistry();
  initEdgeTtsLocal('C:/plugin');
  // Node には URL.createObjectURL が無いためモックする
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:test');
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

describe('resolveEdgeVoiceFull', () => {
  it('短縮名 → フル名', () => {
    expect(resolveEdgeVoiceFull('xiaoxiao', 'zh')).toBe('zh-CN-XiaoxiaoNeural');
    expect(resolveEdgeVoiceFull('nanami', 'ja')).toBe('ja-JP-NanamiNeural');
    expect(resolveEdgeVoiceFull('aria', 'en')).toBe('en-US-AriaNeural');
  });
  it('未知値はそのまま', () => {
    expect(resolveEdgeVoiceFull('zh-CN-YunxiNeural', 'zh')).toBe('zh-CN-YunxiNeural');
  });
  it('空文字は言語の既定', () => {
    expect(resolveEdgeVoiceFull('', 'zh')).toBe('zh-CN-XiaoxiaoNeural');
    expect(resolveEdgeVoiceFull('', 'ja')).toBe('ja-JP-NanamiNeural');
    expect(resolveEdgeVoiceFull('', 'en')).toBe('en-US-AriaNeural');
  });
});

describe('resolveEdgeTtsModulePath', () => {
  it('設定値が最優先', () => {
    expect(resolveEdgeTtsModulePath('C:/MyEdgeTts')).toBe('C:/MyEdgeTts');
  });
  it('空ならプラグイン内 edge_tts', () => {
    expect(resolveEdgeTtsModulePath('')).toBe(path.join('C:/plugin', 'edge_tts'));
  });
  it('プラグインDIR未設定なら空（site-packages）', () => {
    resetEdgeTtsLocalState();
    expect(resolveEdgeTtsModulePath('')).toBe('');
  });
});

describe('localEdgeTtsSpeak', () => {
  it('spawn: python <tmp>/claudian_bridge_edge_tts.py --voice <full> --edge-tts-path <path> + stdin に text', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = localEdgeTtsSpeak('こんにちは', makeSettings(), vi.fn());
    // アダプタが tmp に書き出されている
    const scriptPath = spawnMock.mock.calls[0][1][0] as string;
    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(scriptPath).toContain('claudian_bridge_edge_tts.py');
    expect(spawnMock.mock.calls[0][0]).toBe('python');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[1]).toBe('--voice');
    expect(args[2]).toBe('ja-JP-NanamiNeural'); // かな判定 → ja
    expect(args).toContain('--edge-tts-path');
    expect(args[args.indexOf('--edge-tts-path') + 1]).toBe(path.join('C:/plugin', 'edge_tts'));
    expect(child.stdin.write).toHaveBeenCalledWith('こんにちは');
    child.emit('close', 0); // 再生は Audio 未モックなので playObjectUrl が失敗 → false
    await p;
  });

  it('exit 0 + 音声 → Audio 再生 → true', async () => {
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = localEdgeTtsSpeak('hello', makeSettings(), vi.fn());
    expect(isTtsPlaying()).toBe(true);
    child.stdout.emitData(Buffer.from('MP3DATA'));
    child.emit('close', 0);
    await expect(p).resolves.toBe(true);
    expect(isTtsPlaying()).toBe(false);
  });

  it('exit 1 → false + Notice', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const notice = vi.fn();
    const p = localEdgeTtsSpeak('hello', makeSettings(), notice);
    child.stderr.emitData('boom');
    child.emit('close', 1);
    await expect(p).resolves.toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('ローカル EdgeTTS 失敗'));
  });

  it('設定パスに edge_tts が無い場合は spawn せず Notice', async () => {
    const settings = makeSettings();
    settings.edgeTtsModulePath = 'C:/nonexistent';
    const notice = vi.fn();
    const p = localEdgeTtsSpeak('hello', settings, notice);
    await expect(p).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('指定パスに edge_tts モジュールがありません'));
  });
});
