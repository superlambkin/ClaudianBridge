/**
 * v0.11.1: Claudian チャット入力ツールバーの「📖 全文読み上げ」トグルボタン。
 *
 * 旧 claude-tts-settings プラグインが注入していた同名ボタン(
 * voice-config.json の full_text を直接トグル)の後継。
 * Claudian Bridge 側では tts.cli.full_text が相当するため、
 * トグル時に store 経由で保存 → ConfigStore.onSave で voice-config.json へ反映。
 *
 * 挙動:
 * - realclaudian の入力ツールバー(.claudian-input-toolbar)を検出して
 *   📖/📄 ボタンを末尾に追加(MutationObserver + 既存ボタン検査)
 * - クリックで tts.cli.full_text をトグル(.is-fulltext クラスで表示切替)
 * - 二重注入防止: data-cb-fulltext 属性でマーク
 */
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const MARK_ATTR = 'data-cb-fulltext';

function setButtonState(btn: HTMLElement, fullText: boolean): void {
  if (fullText) {
    btn.textContent = '📖';
    btn.title = '全文読み上げ ON（全文を読み上げ）';
    btn.classList.add('is-fulltext');
  } else {
    btn.textContent = '📄';
    btn.title = '全文読み上げ OFF（最大文字数で読み上げ）';
    btn.classList.remove('is-fulltext');
  }
}

export function setupToolbarFullTextButton(store: ConfigStore): () => void {
  const inject = (toolbar: Element): void => {
    if (toolbar.querySelector(`[${MARK_ATTR}]`)) return;
    const btn = document.createElement('button');
    btn.classList.add('claudian-action-btn', 'claude-tts-fulltext-btn');
    btn.setAttribute(MARK_ATTR, 'true');
    btn.setAttribute('aria-label', '全文読み上げ');
    setButtonState(btn, store.load().tts.cli.full_text);
    btn.addEventListener('click', () => {
      try {
        const cfg = store.load();
        const next = !cfg.tts.cli.full_text;
        store.save({
          ...cfg,
          tts: { ...cfg.tts, cli: { ...cfg.tts.cli, full_text: next } },
        });
        setButtonState(btn, next);
        new Notice(next ? '📖 全文読み上げ ON（全文を読み上げます）' : '📄 全文読み上げ OFF（最大文字数で読み上げます）');
      } catch (e) {
        setButtonState(btn, store.load().tts.cli.full_text);
        new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
      }
    });
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
      for (const node of m.addedNodes) {
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

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.remove());
  };
}
