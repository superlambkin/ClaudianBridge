// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatReadHighlighter } from '../../../src/features/tts/chat-read-highlight';
import type { ConfigStore } from '../../../src/core/config-store';

// jsdom には scrollIntoView が無いためスタブ
beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
});

function makeStore(enabled: boolean, highlightColor = ''): ConfigStore {
  return {
    load: () => ({
      tts: {
        chatReadHighlight: { enabled },
        mdReadHighlight: { enabled: true, highlightColor, scrollPositionPct: 40 },
      },
    }),
  } as unknown as ConfigStore;
}

function makeMessages(assistantCount = 1): HTMLElement {
  const messages = document.createElement('div');
  messages.className = 'claudian-messages';
  for (let i = 0; i < assistantCount; i++) {
    const m = document.createElement('div');
    m.className = 'claudian-message-assistant';
    messages.appendChild(m);
  }
  return messages;
}

describe('createChatReadHighlighter (v0.49.0 / F-050)', () => {
  it('activate で最後の assistant メッセージにクラス + 背景色を付与し scrollIntoView する', () => {
    const el = makeMessages(2);
    const h = createChatReadHighlighter({ store: makeStore(true, '#ffe680') });
    h.activate(el);
    const items = el.querySelectorAll('.claudian-message-assistant');
    expect(items[0].classList.contains('cb-chat-read-active')).toBe(false);
    expect(items[1].classList.contains('cb-chat-read-active')).toBe(true);
    // jsdom は 16 進色を rgb() に正規化するため
    expect(items[1].style.getPropertyValue('background')).toBe('rgb(255, 230, 128)');
    expect(items[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('highlightColor が空文字ならインライン背景は付与しない（CSS 既定色）', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '') });
    h.activate(el);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(true);
    expect(last.style.getPropertyValue('background')).toBe('');
  });

  it('deactivate でクラス + インラインスタイルが完全解除される', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '#ffe680') });
    const token = h.activate(el);
    h.deactivate(token);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(false);
    expect(last.style.getPropertyValue('background')).toBe('');
  });

  it('割り込み時: 旧トークンの deactivate は新ハイライトを解除しない（世代ガード）', () => {
    const el1 = makeMessages(1);
    const el2 = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '') });
    const t1 = h.activate(el1);
    const t2 = h.activate(el2); // 後勝ち割り込み
    h.deactivate(t1); // 旧 speak の finally（無効であるべき）
    const last2 = el2.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last2.classList.contains('cb-chat-read-active')).toBe(true); // 残る
    h.deactivate(t2); // 新しい方の finally（有効）
    expect(last2.classList.contains('cb-chat-read-active')).toBe(false);
  });

  it('設定 OFF では何もしない', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(false) });
    h.activate(el);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(false);
  });

  it('assistant メッセージが無い場合は無害動作（例外を出さない）', () => {
    const el = document.createElement('div');
    const h = createChatReadHighlighter({ store: makeStore(true) });
    expect(() => h.activate(el)).not.toThrow();
  });
});
