// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { playBeep } from '../../../src/features/tts/audio-beep';

describe('playBeep (v0.36.0)', () => {
  it('AudioContext 未対応時は no-op（throw しない）', () => {
    const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const saved = w.AudioContext;
    delete w.AudioContext;
    delete w.webkitAudioContext;
    try {
      expect(() => playBeep()).not.toThrow();
    } finally {
      w.AudioContext = saved;
    }
  });

  it('AudioContext 対応時は createOscillator と setTimeout が呼ばれる', () => {
    const osc = { frequency: { value: 0 }, type: '', connect: vi.fn().mockReturnThis(), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { value: 0 }, connect: vi.fn().mockReturnThis() };
    const ctxMock = {
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
      destination: {},
    };
    const w = globalThis as unknown as { AudioContext?: typeof AudioContext };
    const saved = w.AudioContext;
    w.AudioContext = vi.fn(() => ctxMock) as unknown as typeof AudioContext;
    try {
      playBeep();
      expect(ctxMock.createOscillator).toHaveBeenCalled();
      expect(osc.frequency.value).toBe(880);
      expect(ctxMock.createGain).toHaveBeenCalled();
    } finally {
      w.AudioContext = saved;
    }
  });
});
