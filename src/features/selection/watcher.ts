import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { addTextToClaudian } from './core';
import { buildPopup } from './popup';

const SCOPE_SELECTORS = ['.cm-editor', '.markdown-preview-view', '.claudian-messages'];

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
  let capturedText = '';

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function clearPopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }
  function cancelAndHide() { clearTimer(); clearPopup(); }

  function onSelectionChange() {
    clearTimer(); clearPopup();
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
      popupEl = buildPopup(
        app,
        async () => { cancelAndHide(); await addTextToClaudian(app, capturedText); },
        async () => { cancelAndHide(); await onTts?.(capturedText); }
      );
      document.body.appendChild(popupEl);
    }, cfg.selection.delayMs);
  }

  const onPointerDown = (e: PointerEvent) => {
    pointerDown = true;
    if (popupEl && !popupEl.contains(e.target as Node)) {
      dismissed = true;
      cancelAndHide();
    } else {
      dismissed = false;
    }
  };
  const onPointerUp = () => {
    pointerDown = false;
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
