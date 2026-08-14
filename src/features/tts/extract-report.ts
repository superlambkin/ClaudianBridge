/**
 * v0.11.0: タスク終了報告（📢）の DOM 抽出。
 * 発火条件は 📢 blockquote の存在（scope は読み上げ範囲のみ制御）。
 * 抽出と同時に重複防止マーク（data-cb-tts-read）を付与する。
 */
export type AutoReadScope = 'header' | 'full';

export const AUTO_READ_MARK = 'data-cb-tts-read';

/** innerText 非対応環境（jsdom）では textContent にフォールバック */
function readVisibleText(el: Element): string {
  const withInner = el as Element & { innerText?: string };
  const raw = typeof withInner.innerText === 'string' ? withInner.innerText : (el.textContent ?? '');
  return raw.trim();
}

/**
 * messagesEl（.claudian-messages）内の最後の assistant メッセージから報告テキストを抽出。
 * - header: 📢 で始まる blockquote のテキスト
 * - full:   メッセージ全文（.claudian-message-content）
 * 抽出済み・📢 なし・assistant なしの場合は null。
 */
export function extractReportText(messagesEl: Element, scope: AutoReadScope): string | null {
  const assistants = messagesEl.querySelectorAll('.claudian-message-assistant');
  const last = assistants[assistants.length - 1];
  if (!last) return null;

  const report = Array.from(last.querySelectorAll('blockquote'))
    .find((b) => (b.textContent ?? '').trim().startsWith('📢'));
  if (!report) return null;

  const markTarget = scope === 'header' ? report : last;
  if (markTarget.hasAttribute(AUTO_READ_MARK)) return null;
  markTarget.setAttribute(AUTO_READ_MARK, '1');

  const source = scope === 'header' ? report : (last.querySelector('.claudian-message-content') ?? last);
  const text = readVisibleText(source);
  return text === '' ? null : text;
}
