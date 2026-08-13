import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { addTextToClaudian } from './core';
import { buildPopup, positionPopup } from './popup';

// 選択ポップアップを表示できるスコープ（Obsidian の全ビュー種別をカバー）
// - .cm-editor / .cm-content: ソースモード/ライブプレビュー
// - .markdown-source-view: ソースビューラッパ
// - .el-pre: ライブプレビューのレンダリングブロック
// - .markdown-preview-view / .markdown-rendered: プレビューモード
// - .canvas-wrapper / .canvas-node-content: キャンバス
// - .claudian-messages: realclaudian のチャット領域
const SCOPE_SELECTORS = [
  '.cm-editor',
  '.cm-content',
  '.markdown-source-view',
  '.el-pre',
  '.markdown-preview-view',
  '.markdown-rendered',
  '.canvas-wrapper',
  '.canvas-node-content',
  '.claudian-messages',
];

function toElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function isInAllowedScope(anchorNode: Node | null): boolean {
  const el = toElement(anchorNode);
  if (!el || typeof el.closest !== 'function') return false;
  return SCOPE_SELECTORS.some((sel) => el.closest(sel) !== null);
}

export function setupSelectionWatcher(app: App, store: ConfigStore, onTts?: (text: string) => void): () => void {
  let popupEl: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pointerDown = false;
  let dismissed = false;
  let pointerInPopup = false;
  let capturedText = '';

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function clearPopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }
  function cancelAndHide() { pointerInPopup = false; clearTimer(); clearPopup(); }

  function onSelectionChange() {
    clearTimer();
    // ポップアップ内クリック中は popup を消さない・再アームしない
    // （消すとボタンが click イベント前に DOM から外れ、onclick が発火しない）
    if (pointerInPopup) return;
    clearPopup();
    const cfg = store.load();
    if (!cfg.selection.enabled) return;
    if (pointerDown) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    if (!isInAllowedScope(sel.anchorNode)) return;
    const text = sel.toString();
    if (!text || text.trim().length < 1) return;
    capturedText = text;
    timer = setTimeout(() => {
      timer = null;
      // 発火時点の選択範囲で位置を決める（テキストはスケジュール時点の capturedText を使用）
      const selNow = window.getSelection();
      if (!selNow || selNow.rangeCount === 0) return;
      const rect = selNow.getRangeAt(0).getBoundingClientRect();
      popupEl = buildPopup(
        app,
        async () => { cancelAndHide(); await addTextToClaudian(app, capturedText); },
        async () => { cancelAndHide(); await onTts?.(capturedText); }
      );
      document.body.appendChild(popupEl);
      positionPopup(popupEl, rect);
    }, cfg.selection.delayMs);
  }

  const onPointerDown = (e: PointerEvent) => {
    pointerDown = true;
    if (popupEl && !popupEl.contains(e.target as Node)) {
      dismissed = true;
      cancelAndHide();
    } else {
      pointerInPopup = popupEl ? popupEl.contains(e.target as Node) : false;
      dismissed = false;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    pointerDown = false;
    if (popupEl && popupEl.contains(e.target as Node)) {
      // ポップアップ内（ボタン）を離した → popup を消さず click イベントを届ける
      dismissed = false;
      return;
    }
    if (!dismissed) onSelectionChange();
    dismissed = false;
  };
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelAndHide(); };
  const onScroll = () => cancelAndHide();

  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('pointerup', onPointerUp, { capture: true });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('scroll', onScroll, { capture: true });
  window.addEventListener('blur', cancelAndHide);

  return () => {
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('pointerup', onPointerUp, { capture: true });
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('blur', cancelAndHide);
    clearTimer(); clearPopup();
  };
}
