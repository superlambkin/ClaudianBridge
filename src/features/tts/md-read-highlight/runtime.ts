/**
 * v0.31.0 (F-028): MD 読み上げ位置ハイライト機能の runtime helpers。
 *
 * md-file-read.ts が speakText を呼ぶ前後に prepare/finalize と chunk hook を
 * 組み合わせるための薄いファサード。責務を切り出して単体テスト可能にする。
 */
import { buildChunks } from './anchor';
import { mdReadState } from './state';

export interface PrepareMdReadOpts {
  /** 機能の ON/OFF（cfg.tts.mdReadHighlight?.enabled !== false を呼び出し側で評価） */
  enabled: boolean;
  /** 再生対象 MD の vault パス */
  filePath: string;
  /** 元 MD 全文（frontmatter / code 等含む、heading level 解析用） */
  content: string;
  /** extractMdText 後のフィルタ後テキスト（チャンク分割対象） */
  filteredText: string;
  /** チャンク最大文字数（cfg.tts.chunkMaxChars?.edge ?? 500 など） */
  chunkMax: number;
}

/**
 * speakText 呼び出し前の state 登録。
 * enabled=false のときは no-op。
 */
export function prepareMdRead(opts: PrepareMdReadOpts): void {
  if (!opts.enabled) return;
  const chunks = buildChunks(opts.content, opts.filteredText, opts.chunkMax);
  mdReadState.register(opts.filePath, chunks);
}

/**
 * speakText 完了後のクリーンアップ。
 * ok=true → completed フェーズ。ok=false → clear。
 * state が未登録（null）でもクラッシュしない（冪等）。
 */
export function finalizeMdRead(ok: boolean): void {
  const s = mdReadState.get();
  if (!s) return;
  if (ok) mdReadState.complete();
  else mdReadState.clear();
}

/**
 * speakText の SpeakTextOpts.onChunkStart に渡す関数を作る。
 * enabled=false のとき undefined を返す（speakText 側で no-op 扱い）。
 */
export function createChunkStartHook(
  enabled: boolean,
): ((idx: number) => void) | undefined {
  if (!enabled) return undefined;
  return (idx: number) => mdReadState.setActiveIdx(idx);
}
