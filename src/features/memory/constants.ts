/**
 * v0.17.0: MD保存機能の共通定数。
 * ツールバー保存・ブロック保存の両方で共用するセレクタ定義。
 */

/** シリアライズ対象から除外する UI ボタンのセレクタ集合（両ボタンで一元管理） */
export const SAVE_EXCLUDE_SELECTORS = [
  '.claudian-text-copy-btn',
  '.claudian-text-tts-btn',
  '.claudian-text-md-save-btn',
  '[data-cb-md-save]',
  '[data-cb-md-save-toolbar]',
];
