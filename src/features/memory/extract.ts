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
    // 直下子要素だけでなくグループ/コンテナにネストされたメッセージも拾うため
    // 深さ無制限の querySelectorAll を使う（返り値はドキュメント順）。
    const out: ExtractedMessage[] = [];
    for (const el of Array.from(messagesEl.querySelectorAll(`${USER_MESSAGE_SELECTOR}, ${ASSISTANT_MESSAGE_SELECTOR}`))) {
      out.push({
        role: el.classList.contains('claudian-message-user') ? 'user' : 'assistant',
        element: contentOf(el),
      });
    }
    return out.length > 0 ? out : null;
  }

  // pair: 最後の assistant + 直前の user（無ければ assistant のみ）
  // conversation と同じくドキュメント順の全メッセージを列挙し、その中から直前の user を探すことで
  // グループ/コンテナにネストされた DOM でも previousElementSibling の歩行が途中で止まらない。
  const last = assistants[assistants.length - 1];
  const all = Array.from(messagesEl.querySelectorAll(`${USER_MESSAGE_SELECTOR}, ${ASSISTANT_MESSAGE_SELECTOR}`));
  const out: ExtractedMessage[] = [{ role: 'assistant', element: contentOf(last) }];
  const lastIdx = all.indexOf(last);
  for (let i = lastIdx - 1; i >= 0; i--) {
    if (all[i].classList.contains('claudian-message-user')) {
      out.unshift({ role: 'user', element: contentOf(all[i]) });
      break;
    }
  }
  return out;
}

export function findFirstHeadingText(el: Element): string {
  const h = el.querySelector('h1, h2, h3, h4, h5, h6');
  return h ? (h.textContent ?? '').trim() : '';
}
