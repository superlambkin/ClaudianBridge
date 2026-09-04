/**
 * v0.32.4 (F-028): DOM と anchor を同じ正規化で照合するためのユーティリティ。
 *
 * 背景: TTS 側テキストは記号フィルタ（normalizeMdForSpeech）を通っているため、
 * チャンク anchor と Preview DOM の元テキストは文字列として一致しない
 * （例: DOM「東京‐大阪」vs anchor「東京 大阪」）。
 * そこで DOM 側も同じ正規化を施した上で indexOf 照合し、
 * 正規化インデックス → 元テキスト位置の逆マップで span を注入する。
 */

/** 見出し行頭の # */
const HEADING_MARK_RE = /^\s{0,3}#{1,6}\s+/gm;
/** ハッシュタグ */
const HASHTAG_RE = /(^|\s)#[^\s#、。！？]+/g;
/** wikilink */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
/** markdown link */
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
/** 強調記号 */
const EMPHASIS_RE = /\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g;
/** リストマーカー */
const LIST_MARKER_RE = /^\s{0,3}[-*]\s+/gm;
/** 引用の行頭 > */
const BLOCKQUOTE_MARK_RE = /^\s{0,3}>\s?/gm;
/** 記号類 → 除去（照合時は空白も含めて全て無視する） */
const IGNORE_CHARS_RE = /[-‐‑‒–—―`/|*_~\s]+/g;

/**
 * 照合用正規化: 記号フィルタと同じ変換 + 空白・記号の完全除去。
 * md-file-read.ts の normalizeMdForSpeech と同じ記号クラスを対象にする。
 * 空白を一切残さないことで、DOM 側のノード境界・改行・インデントに依存せず照合できる。
 */
export function normalizeForMatch(t: string): string {
  return t
    .replace(WIKILINK_RE, (_m, path: string, alias?: string) => {
      if (alias) return alias;
      // v0.34.0: Obsidian の描画に合わせ表示名（path 最終セグメント）で照合する
      const base = path.split('/').pop() ?? path;
      return base;
    })
    .replace(MD_LINK_RE, '$1')
    .replace(HEADING_MARK_RE, '')
    .replace(HASHTAG_RE, '$1')
    .replace(EMPHASIS_RE, (_m, b?: string, s?: string, e1?: string, e2?: string) => b ?? s ?? e1 ?? e2 ?? '')
    .replace(LIST_MARKER_RE, '')
    .replace(BLOCKQUOTE_MARK_RE, '')
    .replace(IGNORE_CHARS_RE, '');
}

/**
 * v0.34.0: サロゲートペア（絵文字等）を切断しない安全な先頭 n 文字切り出し。
 * String.prototype.slice は UTF-16 単位のため、絵文字の途中で切ると
 * 不正な lone surrogate が混ざり DOM 照合に必ず失敗する。
 */
export function anchorPrefix(t: string, n = 24): string {
  return Array.from(t).slice(0, n).join('');
}
