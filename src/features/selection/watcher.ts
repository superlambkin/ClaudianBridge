import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { addTextToClaudian } from './core';
import { buildPopup } from './popup';

export function setupSelectionWatcher(app: App, store: ConfigStore, onTts?: (text: string) => void): () => void {
  let popupEl: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearPopup() {
    if (popupEl) { popupEl.remove(); popupEl = null; }
  }

  function onSelectionChange() {
    clearPopup();
    const cfg = store.load();
    if (!cfg.selection.enabled) return;

    const selection = window.getSelection()?.toString() ?? '';
    if (!selection) return;

    if (timer) clearTimeout(timer);
    const delayMs = cfg.selection.delayMs;
    timer = setTimeout(() => {
      popupEl = buildPopup(
        app,
        () => { addTextToClaudian(app, selection); clearPopup(); },
        () => { onTts?.(selection); clearPopup(); }
      );
      document.body.appendChild(popupEl);
    }, delayMs);
  }

  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    document.removeEventListener('selectionchange', onSelectionChange);
    if (timer) clearTimeout(timer);
    clearPopup();
  };
}
