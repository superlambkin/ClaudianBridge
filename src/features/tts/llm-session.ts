/**
 * v0.37.1 (F-033 修正): LLM 原稿書き換えセッション管理。
 *
 * - 常に「最新の読み上げ」が勝つ（古い書き換えは中断）
 * - 生成中でも 🔇 / 別 MD オープンで abortCurrentLlm() を呼べば claude 子プロセスを kill
 * - gen による世代ガードで、中断後に完了した古い結果が読み上げられないようにする
 */
export interface LlmSession {
  gen: number;
  signal: AbortSignal;
}

let seq = 0;
let ctrl: AbortController | null = null;

/** 新規セッション開始（直前のセッションがあれば中断）。開始時に seq を増分 */
export function beginLlmSession(): LlmSession {
  abortCurrentLlm();
  seq += 1;
  ctrl = new AbortController();
  return { gen: seq, signal: ctrl.signal };
}

/** 現在進行中のセッションを中断（claude 子プロセス kill） */
export function abortCurrentLlm(): void {
  try { ctrl?.abort(); } catch { /* ignore */ }
  ctrl = null;
}

/** 世代ガード: gen が最新でなければ stale（別の読み上げが開始された） */
export function isCurrent(gen: number): boolean {
  return gen === seq;
}

/** セッション終了（正常完了時）。以後 abort 不要にする */
export function endLlmSession(): void {
  ctrl = null;
}
