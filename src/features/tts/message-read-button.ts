/**
 * v0.14.0: ClaudianChat 結果欄（.claudian-text-block）のコピーボタン左隣に
 * 読上げボタンを注入。クリックで該当ブロックの可視テキストを
 * speakText('message', ...) へ渡して読み上げる。
 *
 * realclaudian 構造（main.js / styles.css 実測）:
 *   .claudian-text-block                    position:relative
 *     └── .claudian-text-copy-btn           absolute; bottom:0; inset-inline-end:0
 * 読上げボタンは inset-inline-end:22px でコピーボタンの左隣に配置する。
 */
import { Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { readVisibleTextExcluding, buildSpeechExclude } from './extract-report';
import { speakText, resolveSpeechFilter } from './speak';

const TEXT_BLOCK_SELECTOR = '.claudian-text-block';
const COPY_BTN_SELECTOR = '.claudian-text-copy-btn';
const READ_MARK = 'data-cb-msg-read';

export interface MessageReadDeps {
  app: App;
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

export function setupMessageReadButtons(deps: MessageReadDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const inject = (block: HTMLElement): void => {
    if (block.querySelector(`[${READ_MARK}]`)) return;
    const copyBtn = block.querySelector(COPY_BTN_SELECTOR);
    if (!copyBtn) return;
    const btn = document.createElement('span');
    btn.className = 'claudian-text-tts-btn';
    btn.setAttribute(READ_MARK, 'true');
    btn.title = '読み上げ';
    try { setIcon(btn, 'volume-2'); } catch { btn.textContent = '🔊'; }
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void (async () => {
        const cfg = deps.store.load();
        if (!cfg.tts.enabled) { notice('🔇 ミュート中です'); return; }
        const filter = resolveSpeechFilter(cfg, 'message');
        const text = readVisibleTextExcluding(
          block,
          `${COPY_BTN_SELECTOR}, [${READ_MARK}], ${buildSpeechExclude(filter)}`,
        );
        if (!text) { notice('入力がありません'); return; }
        await speakText('message', text, cfg);
      })().catch((e) => console.warn('[cb-msg-read] speak failed:', e));
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

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${READ_MARK}]`).forEach((el) => el.remove());
  };
}
