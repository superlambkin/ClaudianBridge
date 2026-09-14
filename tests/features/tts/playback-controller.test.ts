// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPlaybackController } from '../../../src/features/tts/playback-controller';
import { registerPlayback } from '../../../src/features/tts/playback-registry';

function fakeAudio() {
  return {
    pause: vi.fn(),
    play: vi.fn(),
  };
}

describe('PlaybackController (v0.35.0)', () => {
  beforeEach(() => getPlaybackController().reset());

  it('togglePause: bind 中の audio を pause / play する', () => {
    const pc = getPlaybackController();
    const a = fakeAudio();
    pc.bindAudio({ pause: a.pause, resume: a.play });
    expect(pc.togglePause()).toBe(true);
    expect(a.pause).toHaveBeenCalled();
    expect(pc.togglePause()).toBe(false);
    expect(a.play).toHaveBeenCalled();
  });

  it('skipNext: consumeSkip が 1 回だけ true を返す', () => {
    const pc = getPlaybackController();
    pc.skipNext();
    expect(pc.consumeSkip()).toBe(true);
    expect(pc.consumeSkip()).toBe(false);
  });

  it('一時停止中は onChunkBoundary が再開まで待つ', async () => {
    const pc = getPlaybackController();
    pc.bindAudio({ pause: vi.fn(), resume: vi.fn() });
    pc.togglePause();
    let released = false;
    const p = pc.onChunkBoundary().then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBe(false);
    pc.togglePause(); // 再開
    await expect(p).resolves.toBeUndefined();
  });

  it('skipNext は一時停止の待ちも解除する', async () => {
    const pc = getPlaybackController();
    pc.bindAudio({ pause: vi.fn(), resume: vi.fn() });
    pc.togglePause();
    const p = pc.onChunkBoundary();
    pc.skipNext();
    await expect(p).resolves.toBeUndefined();
    expect(pc.consumeSkip()).toBe(true);
  });

  it('reset: 全状態クリア', () => {
    const pc = getPlaybackController();
    pc.bindAudio({ pause: vi.fn(), resume: vi.fn() });
    pc.skipNext();
    pc.reset();
    expect(pc.consumeSkip()).toBe(false);
  });
});

describe('PlaybackController skip 統合 (v0.35.1)', () => {
  it('skipNext で最新の再生ハンドルにも停止が指示される', () => {
    const pc = getPlaybackController();
    const stop = vi.fn();
    const unregister = registerPlayback({ engine: 'edge-local', stop });
    pc.skipNext();
    expect(stop).toHaveBeenCalled();
    expect(pc.consumeSkip()).toBe(true);
    unregister();
  });
});
