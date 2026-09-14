/**
 * v0.37.1 (F-033 修正): LLM 原稿書き換えセッション管理。
 *
 * - 常に「最新の読み上げ」が勝つ（古い書き換えは中断）
 * - 生成中でも 🔇 / 別 MD オープン / 新規読みで abort すれば claude 子プロセスを kill
 * - gen による世代ガードで、中断後に完了した古い結果が読み上げられないようにする
 */
export interface LlmSession {
  gen: number;
  signal: AbortSignal;
}

let seq = 0;
let ctrl: AbortController | null = null;
let activeFilePath: string | null = null;

/** 新規セッション開始（直前のセッションがあれば中断）。開始時に seq を増分 */
export function beginLlmSession(filePath?: string): LlmSession {
  abortCurrentLlm();
  seq += 1;
  ctrl = new AbortController();
  activeFilePath = filePath ?? null;
  return { gen: seq, signal: ctrl.signal };
}

/** 現在進行中のセッションを中断（claude 子プロセス kill） */
export function abortCurrentLlm(): void {
  try { ctrl?.abort(); } catch { /* ignore */ }
  ctrl = null;
  activeFilePath = null;
}

/**
 * v0.37.1 (N3/N4): 指定ファイル以外で LLM 原稿生成が走っている場合だけ中断する。
 * 同じファイルの再オープン等で誤って止めないため。
 */
export function abortIfOtherLlmActive(filePath: string): void {
  if (ctrl && activeFilePath !== null && activeFilePath !== filePath) {
    abortCurrentLlm();
  }
}

/** 世代ガード: gen が最新でなければ stale（別の読み上げが開始された） */
export function isCurrent(gen: number): boolean {
  return gen === seq;
}

/** セッション終了（正常完了時）。v0.37.1: 世代一致時のみ後始末（古い後始末で新しい ctrl を破棄しない） */
export function endLlmSession(gen?: number): void {
  if (gen !== undefined && gen !== seq) return;
  ctrl = null;
  activeFilePath = null;
}
