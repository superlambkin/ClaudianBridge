import { describe, it, expect, vi } from 'vitest';
import { createLatestWinsSpeaker } from '../../../src/features/tts/speak-coordinator';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createLatestWinsSpeaker', () => {
  it('idle 時は即座に speak を呼ぶ', async () => {
    const speak = vi.fn(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    expect(speak).toHaveBeenCalledWith('A');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('speaking 中の新報告は最新1件のみ保留（古いのは破棄）', async () => {
    const d1 = deferred<boolean>();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');          // 読み上げ開始
    await Promise.resolve();
    enqueue('B');          // 保留
    enqueue('C');          // B を上書き
    d1.resolve(true);      // A 完了
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(speak).not.toHaveBeenCalledWith('B');
    expect(speak).toHaveBeenCalledWith('C');
  });

  it('完了後に保留分を読む（順序保証）', async () => {
    const calls: string[] = [];
    const d1 = deferred<boolean>();
    const speak = vi.fn((t: string) => { calls.push(t); return d1.promise; });
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    d1.resolve(true);
    await vi.waitFor(() => expect(calls).toEqual(['A', 'B']));
  });

  it('speak が reject しても保留分を読む（例外で停止しない）', async () => {
    const d1 = deferred<boolean>();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    d1.reject(new Error('tts failed'));
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(speak).toHaveBeenLastCalledWith('B');
  });
});
