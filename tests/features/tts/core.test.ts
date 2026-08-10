import { describe, it, expect, vi } from 'vitest';
import { addTextToTTS } from '../../../src/features/tts/core';

// child_process をモック（vitest の vi.mock はホイストされるため、ファクトリは自己完結させる）
vi.mock('child_process', () => {
  const makeChild = () => {
    const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
    const child: Record<string, unknown> = {
      stdin: {
        write() {},
        end() {},
      },
      stderr: {
        on() {},
      },
      on(ev: string, fn: (...a: unknown[]) => void) {
        (listeners[ev] ??= []).push(fn);
        return child;
      },
      emit(ev: string, ...args: unknown[]) {
        (listeners[ev] ?? []).forEach((fn) => fn(...args));
      },
    };
    return child;
  };
  return {
    spawn: () => {
      const child = makeChild();
      setImmediate(() => (child as { emit: (e: string, ...a: unknown[]) => void }).emit('close', 0));
      return child;
    },
  };
});

const settings = {
  engine: 'claudetts' as const,
};

describe('addTextToTTS (claudetts)', () => {
  it('claudettsHttpSpeak 経由で spawn 呼び出し → exit 0 で true', async () => {
    const ok = await addTextToTTS(null as never, 'こんにちは', settings);
    expect(ok).toBe(true);
  });
});
