/**
 * v0.49.0 (F-050): Claudian 画面の最終回答自動読み上げ中のメッセージハイライト。
 * MD 読上げハイライト (F-028) の Claudian 画面版（メッセージ単位・チャンク範囲は対象外）。
 *
 * - activate(messagesEl): 最後の .claudian-message-assistant にクラス + 背景色を付与し
 *   画面中央へスクロール。トークン（世代番号）を返す。
 * - deactivate(token): token が最新世代と一致する場合のみ解除。
 *   後勝ち割り込み時に旧 speak の finally が新ハイライトを誤解除しないためのガード
 *   （speak-coordinator の世代カウンタと同パターン）。
 */

import type { ConfigStore } from '../../../core/config-store';

const ASSISTANT_SELECTOR = '.claudian-message-assistant';
const ACTIVE_CLASS = 'cb-chat-read-active';

export interface ChatReadHighlighter {
  /** ハイライトを開始し、世代トークンを返す */
  activate: (messagesEl: Element) => number;
  /** トークンが最新世代の場合のみハイライトを解除 */
  deactivate: (token: number) => void;
}

export function createChatReadHighlighter(deps: { store: ConfigStore }): ChatReadHighlighter {
  let latestToken = 0;
  let current: HTMLElement | null = null;

  const clear = (): void => {
    if (!current) return;
    current.classList.remove(ACTIVE_CLASS);
    current.style.removeProperty('background');
    current = null;
  };

  const activate = (messagesEl: Element): number => {
    const token = ++latestToken;
    clear();
    try {
      const cfg = deps.store.load();
      if (cfg.tts.chatReadHighlight?.enabled === false) return token;
      const root = messagesEl.querySelector('.claudian-messages') ?? messagesEl;
      const items = root.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR);
      const last = items.length ? items[items.length - 1] : null;
      if (!last) return token; // 対象欠落 → 静かにスキップ（設計 5.3）
      last.classList.add(ACTIVE_CLASS);
      const color = cfg.tts.mdReadHighlight?.highlightColor;
      if (color) last.style.setProperty('background', color);
      current = last;
      // v0.49.1 緊急対応: scrollIntoView({behavior:'smooth'}) は同期レイアウトスラスタ
      // を引き起こし、Forced reflow 嵐（114ms ピーク）→ 描画フリーズの原因。
      // rAF 経由で 1 回限りの即時スクロールに切替え、レイアウトスラスタを断つ。
      requestAnimationFrame(() => {
        try { last.scrollIntoView({ behavior: 'auto', block: 'center' }); }
        catch { /* best-effort */ }
      });
    } catch (e) {
      console.warn('[cb-chat-highlight] activate error:', e);
    }
    return token;
  };

  const deactivate = (token: number): void => {
    if (token !== latestToken) return; // 割り込み済み → 何もしない
    clear();
  };

  return { activate, deactivate };
}
