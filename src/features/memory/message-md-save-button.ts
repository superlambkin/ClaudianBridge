/**
 * v0.17.0: ClaudianChat 回答ブロック（.claudian-text-block）右下の 📝MD保存ボタン。
 * クリックでそのブロックのみをメモリフォルダに保存する（scope=block）。
 */
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { findFirstHeadingText } from './extract';
import { serializeElementToMarkdown } from './serialize';
import { saveMarkdown } from './save';

const TEXT_BLOCK_SELECTOR = '.claudian-text-block';
const COPY_BTN_SELECTOR = '.claudian-text-copy-btn';
const SAVE_MARK = 'data-cb-md-save';
const EXCLUDE_SELECTORS = ['.claudian-text-copy-btn', '.claudian-text-tts-btn', '[data-cb-md-save]'];

export interface MessageMdSaveButtonDeps {
  app: App;
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

export function setupMessageMdSaveButtons(deps: MessageMdSaveButtonDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });
  // ConfigStore.onSave は購読解除を返さないため、cleanup 後に無効化するフラグで
  // 残留リスナーからの再注入・スキャンを防止する（md-save-button.ts と同じ運用）。
  let disposed = false;

  const inject = (block: HTMLElement): void => {
    if (deps.store.load().memory.enabled === false) return;
    if (block.querySelector(`[${SAVE_MARK}]`)) return;
    const copyBtn = block.querySelector(COPY_BTN_SELECTOR);
    if (!copyBtn) return;
    const btn = document.createElement('span');
    btn.className = 'claudian-text-md-save-btn';
    btn.setAttribute(SAVE_MARK, 'true');
    btn.textContent = '📝';
    btn.title = 'MD保存：このブロックを保存';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void (async () => {
        const cfg = deps.store.load();
        if (!cfg.memory.enabled) return;
        const md = serializeElementToMarkdown(block, EXCLUDE_SELECTORS);
        if (md.trim() === '') return;
        const title = findFirstHeadingText(block);
        const r = await saveMarkdown(deps.app, cfg.memory.folder, 'block', title, md);
        notice(r.ok ? `✅ ${r.path} に保存しました` : `⚠️ 保存失敗: ${r.message}`);
      })().catch((e) => console.warn('[cb-md-save-block] failed:', e));
    });
    copyBtn.before(btn);
  };

  const scan = (): void => {
    document.querySelectorAll(TEXT_BLOCK_SELECTOR).forEach((el) => {
      if (el instanceof HTMLElement) inject(el);
    });
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement &&
            (node.matches(TEXT_BLOCK_SELECTOR) || node.querySelector(TEXT_BLOCK_SELECTOR) || node.closest(TEXT_BLOCK_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  deps.store.onSave(() => {
    if (disposed) return;
    if (deps.store.load().memory.enabled === false) {
      document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
    } else {
      scan();
    }
  });

  return () => {
    disposed = true;
    observer.disconnect();
    document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
  };
}
