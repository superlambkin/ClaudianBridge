import type { TtsEngine } from '../../core/settings';

/**
 * v0.12.0: エンジン横断の「再生中ハンドル」レジストリ。
 * ミュートボタンの3状態（再生中検知・停止）の土台。
 * 各エンジンは再生開始時に registerPlayback() し、終了時に unregister する。
 */
export interface TtsPlaybackHandle {
  engine: TtsEngine;
  stop: () => void;
}

const active = new Set<TtsPlaybackHandle>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* listener エラーは無視 */ }
  }
}

export function registerPlayback(handle: TtsPlaybackHandle): () => void {
  active.add(handle);
  notify();
  return () => {
    active.delete(handle);
    notify();
  };
}

export function isTtsPlaying(): boolean {
  return active.size > 0;
}

export function stopAllPlayback(): number {
  const handles = [...active];
  for (const h of handles) {
    try { h.stop(); } catch { /* ベストエフォート */ }
  }
  return handles.length;
}

export function onPlaybackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** テスト用: 全状態をクリア */
export function resetPlaybackRegistry(): void {
  active.clear();
  listeners.clear();
}
