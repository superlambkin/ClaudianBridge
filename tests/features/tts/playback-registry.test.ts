import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerPlayback, isTtsPlaying, stopAllPlayback, onPlaybackChange, resetPlaybackRegistry,
} from '../../../src/features/tts/playback-registry';

beforeEach(() => { resetPlaybackRegistry(); });

describe('playback-registry', () => {
  it('register すると isTtsPlaying が true になり、unregister で false に戻る', () => {
    expect(isTtsPlaying()).toBe(false);
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(isTtsPlaying()).toBe(true);
    unregister();
    expect(isTtsPlaying()).toBe(false);
  });

  it('stopAllPlayback は active ハンドルの stop を呼び、数を返す', () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    registerPlayback({ engine: 'edge', stop: stop1 });
    registerPlayback({ engine: 'plachta', stop: stop2 });
    expect(stopAllPlayback()).toBe(2);
    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).toHaveBeenCalledTimes(1);
  });

  it('onPlaybackChange は register / unregister で呼ばれる', () => {
    const listener = vi.fn();
    const off = onPlaybackChange(listener);
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(listener).toHaveBeenCalledTimes(1);
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(listener).toHaveBeenCalledTimes(2); // 購読解除後は増えない
  });
});
