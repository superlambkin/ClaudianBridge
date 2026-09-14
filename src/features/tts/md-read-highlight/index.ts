/**
 * v0.31.0 (F-028): MD 読み上げ位置ハイライト機能の公開 I/F 集約（barrel）。
 *
 * 外部（main.ts, 設定タブ等）から使うシンボルだけを re-export する。
 * 内部実装（types / state / anchor 等）は直接 import せず、こちら経由に統一。
 */

// 状態管理
export { mdReadState } from './state';

// チャンク分割・見出し解析
export { buildChunks } from './anchor';
export { nextHeadingIndex } from './heading-skip';

// Preview ハイライト描画
export { highlightChunkInPreview, clearAllHighlights } from './preview-renderer';
export { mountOverlay } from './floating-overlay';

// runtime helpers（F-028 MVP 統合で md-file-read.ts から利用）
export {
  prepareMdRead,
  finalizeMdRead,
  createChunkStartHook,
} from './runtime';

// ライフサイクル
export { clearAllForFile } from './cleanup';
export { setupMdReadHighlight } from './setup';

// 型
export type {
  MdReadChunkAnchor,
  MdReadState,
  MdReadCommand,
} from './types';
