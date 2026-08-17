/**
 * v0.23.0: Claudian チャット入力ツールバーへのクイック返信ボタン注入。
 * ボタン: ✅ OK / ❌ NG / 1️⃣〜5️⃣ 方案1〜方案5
 * クリックで定型文を直接送信する（sendToClaudian）。
 * 推奨方案ハイライトと選択肢数の動的表示は recommend-detector.ts の
 * setupRecommendDetection（RecommendState）と連携する。
 */
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { sendToClaudian } from './core';
import { setupRecommendDetection, type RecommendState } from './recommend-detector';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const GROUP_MARK = 'data-cb-quickreply';
const ROW_MARK = 'data-cb-quickreply-row';
const MAX_OPTIONS = 5;

const OPTION_ICONS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

interface QuickReplyButtonDef {
  mark: string;
  icon: string;
  text: string;
  option?: number;
}

const BUTTONS: QuickReplyButtonDef[] = [
  { mark: 'data-cb-qr-ok', icon: '✅', text: 'OK' },
  { mark: 'data-cb-qr-ng', icon: '❌', text: 'NG' },
  ...Array.from({ length: MAX_OPTIONS }, (_, i) => ({
    mark: `data-cb-qr-${i + 1}`,
    icon: OPTION_ICONS[i],
    text: `方案${i + 1}`,
    option: i + 1,
  })),
];

function makeButton(app: App, def: QuickReplyButtonDef): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claudian-action-btn', 'cb-quickreply-btn');
  if (def.option) btn.classList.add('cb-hidden'); // デフォルトは選択肢なし
  btn.setAttribute(def.mark, 'true');
  btn.textContent = def.icon;
  const s = getLocaleStrings(getUILanguage());
  btn.title = def.option
    ? s.quickReplySendOption.replace('{n}', String(def.option))
    : def.mark === 'data-cb-qr-ok' ? s.quickReplySendOk : s.quickReplySendNg;

  let busy = false;
  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    // sendToClaudian は内部 try/catch でエラー処理済み（reject しない）が、
    // 将来 reject する変更が入っても unhandled rejection にしないよう防御
    void sendToClaudian(app, def.text, (m) => new Notice(m))
      .catch(() => {})
      .finally(() => {
        busy = false;
        btn.disabled = false;
      });
  });
  return btn;
}

/** 選択肢数に応じて方案ボタンの表示と推奨ハイライトを更新する */
function renderGroup(group: Element, state: RecommendState): void {
  const optionCount = Math.min(state.maxOptionCount, MAX_OPTIONS);
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const btn = group.querySelector(`[data-cb-qr-${i}]`);
    if (!btn) continue;
    btn.classList.toggle('cb-hidden', i > optionCount);
    btn.classList.toggle('is-recommended', state.recommended === i);
  }
}

export function setupQuickReplyButtons(app: App): () => void {
  // 状態変化（推奨方案 + 選択肢数）でボタン表示を更新
  const offDetect = setupRecommendDetection(app, (state) => {
    document.querySelectorAll(`[${GROUP_MARK}]`).forEach((group) => renderGroup(group, state));
  });

  const inject = (toolbar: Element): void => {
    if (toolbar.querySelector(`[${GROUP_MARK}]`)) return;
    // 他ボタンの上の行・右寄せ: 全幅の行（.cb-quickreply-row）をツールバー先頭に挿入
    const row = document.createElement('div');
    row.className = 'cb-quickreply-row';
    row.setAttribute(ROW_MARK, 'true');
    const group = document.createElement('span');
    group.className = 'cb-quickreply-group';
    group.setAttribute(GROUP_MARK, 'true');
    for (const def of BUTTONS) {
      group.appendChild(makeButton(app, def));
    }
    row.appendChild(group);
    toolbar.insertBefore(row, toolbar.firstChild);
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      // Array.from 必須: NodeList は for...of だと TS2488 になる
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

  return () => {
    offDetect();
    observer.disconnect();
    document.querySelectorAll(`[${GROUP_MARK}], [${ROW_MARK}]`).forEach((el) => el.remove());
  };
}
