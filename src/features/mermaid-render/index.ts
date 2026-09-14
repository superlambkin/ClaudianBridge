import type { App, Plugin } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { mermaidLog } from './logger';

/**
 * v0.33.0: Claudian チャット内の mermaid コードブロックを自動描画する。
 *
 * realclaudian 本体に Mermaid レンダラがないため、閉じた ```mermaid ブロックを
 * 検知して Obsidian 標準 MarkdownRenderer.render() で図化し、コードブロックと
 * 置換する。「</>」ボタンで図 ⇔ コードを切替可能。
 *
 * 描画エンジン: Obsidian 内蔵 Mermaid（mermaid npm は同梱しない）。
 * 描画失敗時は元コードブロックへフォールバックし、debug.mermaid.log に記録する。
 * 設定 general.mermaidRender が false のときは素通し（realclaudian の既定動作）。
 */

/** 確定判定の待機時間（ms）。この間 textContent が変わらなければフェンスが閉じたとみなす */
const SETTLE_MS = 1200;

const isMermaidLang = (lang: string): boolean => lang === 'mermaid' || lang === 'mmd';

export function setupMermaidRender(
  app: App,
  plugin: Plugin,
  store: ConfigStore,
  log: (...args: unknown[]) => void = mermaidLog,
): () => void {
  const processed = new WeakSet<Element>();
  const observer = new MutationObserver(() => scan());

  /** チャット DOM から未処理の mermaid コードブロックを探して確定を待つ */
  const scan = (): void => {
    if (!store.load().general.mermaidRender) return;
    for (const wrapper of Array.from(document.querySelectorAll('.claudian-code-wrapper'))) {
      if (processed.has(wrapper)) continue;
      const code = wrapper.querySelector('pre code') ?? wrapper.querySelector('code');
      const label = wrapper.querySelector('.claudian-code-lang-label');
      if (!code || !label) continue;
      const lang = (label.textContent ?? '').trim().toLowerCase();
      if (!isMermaidLang(lang)) continue;

      const text = code.textContent ?? '';
      processed.add(wrapper); // 二重スキャン防止
      // 確定判定: textContent が SETTLE_MS 間変わらなければ描画。変わった場合は再度待つ
      const settleCheck = (expected: string): void => {
        window.setTimeout(() => {
          const current = code.textContent ?? '';
          if (current === expected) void renderBlock(app, plugin, wrapper, code, log);
          else settleCheck(current);
        }, SETTLE_MS);
      };
      settleCheck(text);
    }
  };

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
  return () => observer.disconnect();
}

/** ブロック 1 個を Obsidian 標準レンダラで図化して置換。失敗時は元コードのまま＋バッジ＋ログ */
async function renderBlock(
  app: App,
  plugin: Plugin,
  wrapper: Element,
  code: Element,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const source = code.textContent ?? '';
  const holder = document.createElement('div');
  holder.className = 'cb-mermaid-holder';
  try {
    await MarkdownRenderer.render(app, '```mermaid\n' + source + '\n```', holder, '', plugin);
  } catch (e) {
    fail(wrapper, code, e as Error, log);
    return;
  }

  // 結果検査: エラー要素や空描画は失敗扱い
  const bad = holder.querySelector('.error, .mod-empty');
  if (bad || holder.children.length === 0) {
    fail(wrapper, code, new Error('mermaid render produced empty/error output'), log);
    return;
  }

  // トグルボタンで図 ⇔ コードを切替。既存 code-copy-fence は元コードを参照し続ける
  const toggle = document.createElement('button');
  toggle.className = 'cb-mermaid-toggle';
  toggle.textContent = '</>';
  toggle.title = 'Toggle diagram / code';
  let showing = true;
  toggle.addEventListener('click', () => {
    showing = !showing;
    (code.parentElement as HTMLElement).style.display = showing ? 'none' : '';
    holder.style.display = showing ? '' : 'none';
  });

  wrapper.insertBefore(toggle, wrapper.firstChild);
  (code.parentElement as HTMLElement).style.display = 'none';
  wrapper.appendChild(holder);
}

/** フォールバック: 元コードを表示状態に戻し、失敗バッジとログを残す */
function fail(
  wrapper: Element,
  code: Element,
  err: Error,
  log: (...args: unknown[]) => void,
): void {
  log('mermaid render failed', err.message, { code: (code.textContent ?? '').slice(0, 200) });
  const badge = document.createElement('span');
  badge.className = 'cb-mermaid-fail-badge';
  badge.textContent = '⚠ 描画失敗';
  wrapper.appendChild(badge);
}
