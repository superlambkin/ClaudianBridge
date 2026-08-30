/**
 * v0.23.0: Claudian チャット入力ツールバーへのクイック返信ボタン注入。
 * v0.24.0: showAllOptions 設定で方案ボタンを常に表示可能に。
 * v0.29.0: 配置を .claudian-input-toolbar の先頭行から
 *          .claudian-input-nav-actions 内の NewTab 左隣へ移動。
 * ボタン: ✅ OK / ❌ NG / 1️⃣〜5️⃣ 方案1〜方案5
 * クリックで定型文を直接送信する（sendToClaudian）。
 * 推奨方案ハイライトと選択肢数の動的表示は recommend-detector.ts の
 * setupRecommendDetection（RecommendState）と連携する。
 * 設計: docs/superpowers/specs/2026-08-30-quick-reply-nav-actions-design.md
 */
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { sendToClaudian } from './core';
import { setupRecommendDetection, type RecommendState } from './recommend-detector';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings } from '../../core/settings';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../core/settings';

// ConfigStore は configPath を引数に取るため、app 参照は不要
const store = new ConfigStore();

// v0.29.0: ツールバー → nav-actions へ配置変更
const NAV_SELECTOR = '.claudian-input-nav-actions';
// v0.29.0: NewTab を多経路で取得（クラス → aria-label）
const NEWTAB_SELECTOR = '.claudian-new-tab-btn, [aria-label="New tab"]';
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
function renderGroup(group: Element, state: RecommendState, showAllOptions: boolean): void {
  const optionCount = showAllOptions ? MAX_OPTIONS : Math.min(state.maxOptionCount, MAX_OPTIONS);
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const btn = group.querySelector(`[data-cb-qr-${i}]`);
    if (!btn) continue;
    btn.classList.toggle('cb-hidden', i > optionCount);
    btn.classList.toggle('is-recommended', state.recommended === i);
  }
}

export function setupQuickReplyButtons(app: App): () => void {
  const loadShowAll = (): boolean => {
    try {
      const cfg = store.load() as ClaudianBridgeSettings | null;
      return cfg?.general?.quickReplyShowAllOptions ?? DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.quickReplyShowAllOptions;
    } catch {
      return DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.quickReplyShowAllOptions;
    }
  };

  const loadEnabled = (): boolean => {
    try {
      const cfg = store.load() as ClaudianBridgeSettings | null;
      return cfg?.general?.quickReplyEnabled ?? DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.quickReplyEnabled;
    } catch {
      return DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.quickReplyEnabled;
    }
  };

  const offDetect = setupRecommendDetection(app, (state) => {
    const showAll = loadShowAll();
    if (!loadEnabled()) return;
    document.querySelectorAll(`[${GROUP_MARK}]`).forEach((group) => renderGroup(group, state, showAll));
  });

  // v0.29.0: nav-actions 内 NewTab の左に挿入
  const inject = (nav: Element): void => {
    if (nav.querySelector(`[${GROUP_MARK}]`)) return;
    if (!loadEnabled()) return;
    // v0.29.0: NewTab 不在時は非注入（防御）
    const newTab = nav.querySelector(NEWTAB_SELECTOR);
    if (!newTab) return;
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
    nav.insertBefore(row, newTab);
  };

  const removeInjected = (): void => {
    document.querySelectorAll(`[${ROW_MARK}]`).forEach((el) => el.remove());
  };

  const scan = (): void => {
    if (!loadEnabled()) {
      removeInjected();
      return;
    }
    document.querySelectorAll(NAV_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && (node.matches(NAV_SELECTOR) || node.querySelector(NAV_SELECTOR))) {
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
