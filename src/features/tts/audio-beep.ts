/**
 * v0.36.0 (F-032): DR プロフィール用の警告音生成。
 * Web Audio API で短音（880Hz・80ms）を鳴らす。未対応環境では no-op。
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function playBeep(freq = 880, durMs = 80): void {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = 0.05;
    osc.connect(gain).connect(c.destination);
    osc.start();
    setTimeout(() => { try { osc.stop(); } catch { /* ignore */ } }, durMs);
  } catch {
    /* no-op */
  }
}
