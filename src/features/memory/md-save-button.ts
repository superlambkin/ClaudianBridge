/**
 * v0.17.0: ClaudianChat 入力ツールバーの 📝MD保存ボタン。
 * クリックで設定スコープ（pair / conversation）のチャットをメモリフォルダに保存する。
 */
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { extractMessages, findFirstHeadingText, MESSAGES_SELECTOR } from './extract';
import { serializeElementToMarkdown } from './serialize';
import { composeBody, saveMarkdown } from './save';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const SAVE_MARK = 'data-cb-md-save-toolbar';
const EXCLUDE_SELECTORS = ['.claudian-text-copy-btn', '.claudian-text-tts-btn', '[data-cb-md-save-toolbar]'];

export interface MdSaveButtonDeps {
  app: App;
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

export function setupMdSaveButton(deps: MdSaveButtonDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const handleClick = async (btn: HTMLButtonElement): Promise<void> => {
    const cfg = deps.store.load();
    if (!cfg.memory.enabled) return;
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const messagesEl = document.querySelector(MESSAGES_SELECTOR);
      if (!messagesEl) { notice('保存するメッセージがありません'); return; }
      const msgs = extractMessages(cfg.memory.scope, messagesEl);
      if (!msgs) { notice('保存するメッセージがありません'); return; }
      const serialized = msgs.map((m) => ({
        role: m.role,
        md: serializeElementToMarkdown(m.element, EXCLUDE_SELECTORS),
      }));
      const body = composeBody(cfg.memory.scope, serialized);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      const title = lastAssistant ? findFirstHeadingText(lastAssistant.element) : '';
      const r = await saveMarkdown(deps.app, cfg.memory.folder, cfg.memory.scope, title, body);
      notice(r.ok ? `✅ ${r.path} に保存しました` : `⚠️ 保存失敗: ${r.message}`);
    } catch (e) {
      console.warn('[cb-md-save] failed:', e);
      notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '📝';
    }
  };

  const inject = (toolbar: Element): void => {
    if (deps.store.load().memory.enabled === false) return;
    if (toolbar.querySelector(`[${SAVE_MARK}]`)) return;
    const btn = document.createElement('button');
    btn.classList.add('claudian-action-btn', 'cb-md-save-btn');
    btn.setAttribute(SAVE_MARK, 'true');
    btn.textContent = '📝';
    btn.title = 'MD保存：メモリフォルダに保存';
    btn.addEventListener('click', () => { void handleClick(btn); });
    toolbar.appendChild(btn);
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && (node.matches(TOOLBAR_SELECTOR) || node.querySelector(TOOLBAR_SELECTOR))) {
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
    if (deps.store.load().memory.enabled === false) {
      document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
    } else {
      scan();
    }
  });

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
  };
}
