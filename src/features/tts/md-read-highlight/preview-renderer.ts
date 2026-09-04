import type { MdReadChunkAnchor } from './types';
import { normalizeForMatch } from './match';

const ACTIVE_CLASS = 'is-active';
const CHUNK_CLASS = 'cb-md-read-chunk';
/** チャンクマーカー span を識別するための CSS プレフィックス文字列 */
const WRAPPER_MARK = 'data-cb-md-read-chunk';

interface PreviewLike {
  previewMode?: { containerEl: HTMLElement };
}

/**
 * v0.32.9: 失敗原因を 1 セッション 1 回だけ Notice で通知する。
 * （毎回だと読み上げ中にトーストが連発するため初回のみ。DevTools を開かなくても
 * ご主人様が原因カテゴリを報告できるようにする目的）
 */
let failureNoticeShown = false;
function notifyOnce(msg: string): void {
  if (failureNoticeShown) return;
  failureNoticeShown = true;
  try {
    // 遅延 import を避けるため動的 import（Obsidian 環境では同梱済み）
    void import('obsidian').then(({ Notice }) => new Notice(msg, 8000));
  } catch {
    /* Notice 不可環境では console ログのみ */
  }
}

/** 既存のアクティブ span を全て非アクティブ化 */
function deactivateAll(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(`.${CHUNK_CLASS}.${ACTIVE_CLASS}`)
    .forEach((el) => el.classList.remove(ACTIVE_CLASS));
}

/** 正規化文字と元テキスト位置の対応 1 文字分 */
interface CharMapEntry {
  node: Text;
  /** ノード内での文字オフセット */
  offset: number;
  /** ノード配列内のインデックス（複数ノード跨ぎ判定用） */
  nodeIdx: number;
}

interface DomIndex {
  /** 正規化済み連結文字列 */
  norm: string;
  /** norm[i] の元位置 */
  map: CharMapEntry[];
  /** TreeWalker で収集したテキストノード（nodeIdx → node） */
  nodes: Text[];
}

/**
 * Preview DOM のテキストノードを収集し、正規化連結文字列と逆マップを構築する。
 */
/** デバッグ用に buildDomIndex を公開（本番コードからは使用しない） */
export function buildDomIndexForDebug(container: HTMLElement): DomIndex {
  return buildDomIndex(container);
}

function buildDomIndex(container: HTMLElement): DomIndex {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = node as Text;
    if (t.nodeValue && t.nodeValue.trim().length > 0) nodes.push(t);
    node = walker.nextNode();
  }

  let norm = '';
  const map: CharMapEntry[] = [];
  nodes.forEach((t, nodeIdx) => {
    const value = t.nodeValue ?? '';
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      // 照合用正規化: 記号・空白は完全スキップ（norm に加えない）
      if (/[-‐‑‒–—―`/|*_~\s]/.test(ch)) continue;
      norm += ch;
      map.push({ node: t, offset: i, nodeIdx });
    }
  });
  return { norm, map, nodes };
}

/** テキストノードの [from, to) を span でラップする */
function wrapRange(node: Text, from: number, to: number, chunkIndex: number): HTMLElement | null {
  const text = node.nodeValue ?? '';
  if (from >= to || from >= text.length) return null;
  const end = Math.min(to, text.length);
  const parent = node.parentNode;
  if (!parent) return null;
  const before = document.createTextNode(text.slice(0, from));
  const span = document.createElement('span');
  span.className = `${CHUNK_CLASS} ${ACTIVE_CLASS}`;
  span.setAttribute(WRAPPER_MARK, String(chunkIndex));
  span.textContent = text.slice(from, end);
  const after = document.createTextNode(text.slice(end));
  parent.insertBefore(before, node);
  parent.insertBefore(span, node);
  parent.insertBefore(after, node);
  parent.removeChild(node);
  return span;
}

/**
 * v0.32.4: 正規化マッチングによるハイライト。
 * anchor（記号フィルタ後テキスト）を、DOM 側も同じ正規化を施した上で検索し、
 * 見つかった範囲（複数ノード跨ぎ対応）に is-active span を注入する。
 */
export function highlightChunkInPreview(view: PreviewLike, chunk: MdReadChunkAnchor): boolean {
  const container = view.previewMode?.containerEl;
  if (!container) return false;
  deactivateAll(container);

  const anchor = normalizeForMatch(chunk.anchor);
  if (!anchor) return false;

  // v0.34.0: 描画範囲はチャンク全文（anchor は照合用の先頭 24 文字のまま）
  const full = normalizeForMatch(chunk.text ?? '') || anchor;

  const { norm, map, nodes } = buildDomIndex(container);
  if (nodes.length === 0) {
    // v0.32.7: コンテナにテキスト無し → 読書モード以外で再生している疑い
    console.log('[cb-md-read-highlight] container has no text nodes — is the view in Reading mode?');
    notifyOnce('⚠️ 下線表示: 読書モードで開けていない可能性があります（Console: no text nodes）');
    return false;
  }
  // v0.34.0: 完全 anchor で不一致のときは先頭 20/18/16 文字で再試行（wikilink 表示名等の
  // 軽微な文字列差に耐性を持たせる）。短くしすぎると誤照合するため 16 文字未満にはしない。
  let pos = norm.indexOf(anchor);
  if (pos < 0) {
    const cps = Array.from(anchor);
    for (let keep = 20; keep >= 16; keep -= 2) {
      const p2 = norm.indexOf(cps.slice(0, keep).join(''));
      if (p2 >= 0) { pos = p2; break; }
    }
  }
  if (pos < 0 || pos + anchor.length > map.length) {
    // v0.32.6: 不一致時の診断ログ（実機確認用）
    console.log('[cb-md-read-highlight] anchor not matched:', JSON.stringify(anchor.slice(0, 20)), 'norm head:', JSON.stringify(norm.slice(0, 40)));
    notifyOnce('⚠️ 下線表示: テキスト照合に失敗しました（Console: anchor not matched）');
    return false;
  }
  // 全文がコンテナ末尾で途中切れの場合（末尾チャンク等）は map の範囲内にクランプ
  const endPos = Math.min(pos + full.length, map.length);

  const startEntry = map[pos];
  const endEntry = map[endPos - 1];

  // 単一ノード内なら 1 span、複数ノード跨ぎは各ノードに span を分配
  let firstSpan: HTMLElement | null = null;
  if (startEntry.nodeIdx === endEntry.nodeIdx) {
    firstSpan = wrapRange(startEntry.node, startEntry.offset, endEntry.offset + 1, chunk.index);
  } else {
    for (let ni = startEntry.nodeIdx; ni <= endEntry.nodeIdx; ni++) {
      const node = nodes[ni];
      // wrapRange が node を置き換えるため、以降の map 参照は不要（この呼び出しで終了）
      const from = ni === startEntry.nodeIdx ? startEntry.offset : 0;
      const to = ni === endEntry.nodeIdx ? endEntry.offset + 1 : (node.nodeValue ?? '').length;
      const span = wrapRange(node, from, to, chunk.index);
      if (span && !firstSpan) firstSpan = span;
    }
  }

  if (firstSpan && typeof firstSpan.scrollIntoView === 'function') {
    firstSpan.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // v0.32.6: 一致時の診断ログ（実機確認用）
  console.log('[cb-md-read-highlight] matched chunk', chunk.index, 'anchor:', JSON.stringify(anchor.slice(0, 20)));
  return firstSpan !== null;
}

/** 全アクティブ + 全 wrapper を除去 */
export function clearAllHighlights(view: PreviewLike): void {
  const container = view.previewMode?.containerEl;
  if (!container) return;
  container.querySelectorAll(`.${CHUNK_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    const text = document.createTextNode(el.textContent ?? '');
    parent.insertBefore(text, el);
    parent.removeChild(el);
    parent.normalize();
  });
}
