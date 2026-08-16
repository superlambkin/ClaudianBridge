import { describe, it, expect, vi } from 'vitest';
import { createLatestWinsSpeaker } from '../../../src/features/tts/speak-coordinator';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createLatestWinsSpeaker (v0.18.1 即割り込み)', () => {
  it('idle 時は即座に speak を呼ぶ', async () => {
    const speak = vi.fn(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    expect(speak).toHaveBeenCalledWith('A');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('speaking 中の新報告は旧スピーチを停止して即再生する（後勝ち）', async () => {
    const d1 = deferred<boolean>();
    const stop = vi.fn();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak, stop);

    enqueue('A');
    await Promise.resolve();
    expect(speak).toHaveBeenCalledTimes(1);

    enqueue('B');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith('B');

    d1.resolve(true);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
  });

  it('連続割り込み（A→B→C）では最終報告 C のみが発声される', async () => {
    const d1 = deferred<boolean>();
    const stop = vi.fn();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => Promise.resolve(true))
      .mockImplementationOnce(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak, stop);

    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    enqueue('C');

    expect(stop).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(3);
    expect(speak).toHaveBeenLastCalledWith('C');

    d1.resolve(true);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(3));
  });

  it('旧スピーチの finally は新スピーチの speaking を誤解除しない（世代ガード）', async () => {
    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    const stop = vi.fn();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    const enqueue = createLatestWinsSpeaker(speak, stop);

    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    expect(speak).toHaveBeenCalledTimes(2);

    d1.resolve(true);
    await Promise.resolve();

    const d3 = deferred<boolean>();
    speak.mockImplementationOnce(() => d3.promise);
    enqueue('C');
    expect(stop).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith('C');

    d2.resolve(true);
    d3.resolve(true);
  });

  it('speak が reject しても例外で停止しない', async () => {
    const d1 = deferred<boolean>();
    const stop = vi.fn();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => Promise.reject(new Error('tts failed')));
    const enqueue = createLatestWinsSpeaker(speak, stop);

    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    expect(speak).toHaveBeenCalledTimes(2);

    d1.reject(new Error('old failed'));
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
  });
});
