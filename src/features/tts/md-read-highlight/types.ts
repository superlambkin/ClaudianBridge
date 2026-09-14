/**
 * v0.31.0 (F-028): MD 読み上げ位置ハイライト機能の型定義。
 */

/** MD ファイル内の単一チャンクの anchor + メタデータ */
export interface MdReadChunkAnchor {
  /** チャンク番号（0 始まり） */
  index: number;
  /** 元 MD ファイルでの開始行番号（0 始まり） */
  startLine: number;
  /** チャンク先頭の anchor テキスト（12-20 文字） */
  anchor: string;
  /** チャンク本文 */
  text: string;
  /** このチャンクが属する直近の heading level（0=プレアンブル／1-3=H1-H3） */
  headingLevel: 0 | 1 | 2 | 3;
}

/** ハイライト機構の状態（シングルトン管理用） */
export interface MdReadState {
  /** 再生対象ファイルパス */
  filePath: string;
  /** 構築済み chunk anchor 配列 */
  chunks: MdReadChunkAnchor[];
  /** 現在 active な chunk index（-1=未開始） */
  activeIdx: number;
  /** 一時停止フラグ */
  paused: boolean;
  /** ライフサイクル状態 */
  phase: 'pending' | 'playing' | 'paused' | 'completed' | 'cleared';
}

/** 公開するチャネルイベント（コントローラ ⇄ レンダラ間のメッセージ） */
export type MdReadCommand =
  | { kind: 'set-active'; idx: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'skip-to'; idx: number }
  | { kind: 'clear' };
