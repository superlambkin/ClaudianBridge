/**
 * v0.17.0: ClaudianChat チャット DOM からスコープ別にメッセージを抽出する。
 */
import type { MemoryScope } from '../../core/settings';

export interface ExtractedMessage {
  role: 'user' | 'assistant';
  /** .claudian-message-content（無ければメッセージ要素自体） */
  element: Element;
}

export const MESSAGES_SELECTOR = '.claudian-messages';
const USER_MESSAGE_SELECTOR = '.claudian-message-user';
const ASSISTANT_MESSAGE_SELECTOR = '.claudian-message-assistant';

function contentOf(msg: Element): Element {
  return msg.querySelector('.claudian-message-content') ?? msg;
}

export function extractMessages(scope: MemoryScope, messagesEl: Element): ExtractedMessage[] | null {
  const assistants = Array.from(messagesEl.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR));
  if (assistants.length === 0) return null;

  if (scope === 'conversation') {
    const out: ExtractedMessage[] = [];
    for (const el of Array.from(messagesEl.children)) {
      if (el.classList.contains('claudian-message-user')) out.push({ role: 'user', element: contentOf(el) });
      else if (el.classList.contains('claudian-message-assistant')) out.push({ role: 'assistant', element: contentOf(el) });
    }
    return out.length > 0 ? out : null;
  }

  // pair: 最後の assistant + 直前の user（無ければ assistant のみ）
  const last = assistants[assistants.length - 1];
  const out: ExtractedMessage[] = [{ role: 'assistant', element: contentOf(last) }];
  let prev = last.previousElementSibling;
  while (prev && !prev.classList.contains('claudian-message-user')) {
    prev = prev.previousElementSibling;
  }
  if (prev) out.unshift({ role: 'user', element: contentOf(prev) });
  return out;
}

export function findFirstHeadingText(el: Element): string {
  const h = el.querySelector('h1, h2, h3, h4, h5, h6');
  return h ? (h.textContent ?? '').trim() : '';
}
