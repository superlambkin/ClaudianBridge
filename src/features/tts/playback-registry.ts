import { execFileSync } from 'child_process';
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

/** v0.12.5: レジストリ追跡が外れても停止できるよう、edge 子プロセス PID を直接保持 */
let edgeChildPid: number | null = null;

/** v0.18.x (F1): 停止エポック。stopAllPlayback() が実際に何かを停止するたびに +1。
 * 読み上げ中断（後勝ち）を「エラーではない」と判定するための世代カウンタ。 */
let stopEpoch = 0;

/** 現在の停止エポックを返す（addTextToTTS が読み開始時の基準値として使う） */
export function getStopEpoch(): number {
  return stopEpoch;
}

/** edge 子プロセス PID を登録/解除（claudettsHttpSpeak から呼ぶ） */
export function setEdgeChildPid(pid: number | null): void {
  edgeChildPid = pid;
}

/** 保険: レジストリ外の edge 子プロセスをプロセスツリーごと kill */
function killEdgeChild(): boolean {
  if (edgeChildPid && process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(edgeChildPid), '/T', '/F'], { stdio: 'ignore' });
      return true;
    } catch { /* 既に終了済み */ }
  }
  return false;
}

function notify(): void {
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* listener エラーは無視 */ }
  }
}

export function registerPlayback(handle: TtsPlaybackHandle): () => void {
  active.add(handle);
  console.log('[cb-tts] playback START', handle.engine, 'active=', active.size);
  notify();
  return () => {
    active.delete(handle);
    console.log('[cb-tts] playback END', handle.engine, 'active=', active.size);
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
  // v0.12.5: 保険としてレジストリ外の edge 子プロセスも kill
  const stopped = handles.length + (killEdgeChild() ? 1 : 0);
  // v0.18.x (F1): 実際に何かを停止した場合のみエポックを進める。
  // 読みAを中断した読みBは「自分の開始後」の基準値を持ち、後続の停止（=この読みの中断）で初めて基準値を超える。
  if (stopped > 0) stopEpoch++;
  return stopped;
}

export function onPlaybackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** テスト用: 全状態をクリア */
export function resetPlaybackRegistry(): void {
  active.clear();
  listeners.clear();
  edgeChildPid = null;
  stopEpoch = 0;
}
