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
 * v0.13.1: 実ブラウザの realclaudian 思考ブロック（Extended thinking）は
 * `.claudian-thinking-block` 配下に「Thought for Xs」ラベルと思考内容を持つ。
 * full 読み上げ時にこれを発話に含めないよう、指定セレクタのサブツリーを除外してテキストを取得する。
 * - innerText 環境（実ブラウザ）: display:none にしてから innerText を読む（レイアウト反映）。
 * - textContent 環境（jsdom）: clone から除外サブツリーを除去して textContent を読む。
 */
export function readVisibleTextExcluding(el: Element, excludeSel: string): string {
  const targets = Array.from(el.querySelectorAll(excludeSel));
  const prevDisplay = targets.map((t) => ({ t, d: (t as HTMLElement).style.display }));
  // 1) innerText 系（実ブラウザ）
  targets.forEach((t) => ((t as HTMLElement).style.display = 'none'));
  let inner = '';
  try {
    const withInner = el as Element & { innerText?: string };
    if (typeof withInner.innerText === 'string') inner = withInner.innerText.trim();
  } finally {
    prevDisplay.forEach(({ t, d }) => ((t as HTMLElement).style.display = d));
  }
  if (inner !== '') return inner;
  // 2) textContent 系（jsdom 等 innerText 非対応）
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(excludeSel).forEach((n) => n.remove());
  return (clone.textContent ?? '').trim();
}

/** 読み上げから除外する realclaudian 要素（Extended thinking ブロック） */
export const EXCLUDED_FROM_SPEECH = '.claudian-thinking-block';

/** ヘッダースコープの抽出で除外する UI 要素（思考ブロック・コピー/読上げボタン） */
const HEADER_EXCLUDE = `${EXCLUDED_FROM_SPEECH}, .claudian-text-copy-btn, [data-cb-msg-read]`;

/** 見出し要素（markdown 見出し） */
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/**
 * v0.14.1: 最初の見出しより前の「導入文」を取得する（ヘッダースコープの「結果全体まとめ」）。
 * 📢 が無い応答では、見出し以降（詳細・次のアクション）はヘッダーで読まない。
 * 呼び出し側で見出しの存在を確認済み。
 */
function readIntroText(el: Element): string {
  const firstHeading = el.querySelector(HEADING_SELECTOR)!;
  // 最初の見出し以降に一時マークを付け、readVisibleTextExcluding で除外して読む
  const mark = 'data-cb-intro-cut';
  let sib: Element | null = firstHeading;
  while (sib) {
    sib.setAttribute(mark, '1');
    sib = sib.nextElementSibling;
  }
  try {
    return readVisibleTextExcluding(el, `${HEADER_EXCLUDE}, [${mark}]`);
  } finally {
    let sib2: Element | null = firstHeading;
    while (sib2) {
      sib2.removeAttribute(mark);
      sib2 = sib2.nextElementSibling;
    }
  }
}

/**
 * messagesEl（.claudian-messages）内の最後の assistant メッセージから読み上げテキストを抽出。
 * - header: 結果全体まとめのみ。📢 blockquote → 導入文（最初の見出しより前）の順でフォールバック。
 *   v0.14.1 より 📢 が無くても導入文は読む（詳細・次のアクションは読まない）。
 * - full:   メッセージ全文（.claudian-message-content）。v0.13.0 以降は 📢 有無に関わらず
 *           最後の応答を全文読み上げる（CLI Stop hook に代わるプラグイン一元化）。
 * 抽出済み・assistant なしの場合は null。
 */
export function extractReportText(messagesEl: Element, scope: AutoReadScope): string | null {
  const assistants = messagesEl.querySelectorAll('.claudian-message-assistant');
  const last = assistants[assistants.length - 1];
  if (!last) return null;

  const report = Array.from(last.querySelectorAll('blockquote'))
    .find((b) => (b.textContent ?? '').trim().startsWith('📢'));

  // v0.13.0: full scope は 📢 有無に関わらず最後の応答を全文読み上げ（全応答統一）
  if (scope === 'full') {
    if (last.hasAttribute(AUTO_READ_MARK)) return null;
    last.setAttribute(AUTO_READ_MARK, '1');
    const source = last.querySelector('.claudian-message-content') ?? last;
    const text = readVisibleTextExcluding(source, EXCLUDED_FROM_SPEECH);
    return text === '' ? null : text;
  }

  // header scope: 結果全体まとめのみ
  const source = last.querySelector('.claudian-message-content') ?? last;
  if (report) {
    if (report.hasAttribute(AUTO_READ_MARK)) return null;
    report.setAttribute(AUTO_READ_MARK, '1');
    const text = readVisibleText(report);
    return text === '' ? null : text;
  }
  // 📢 が無い場合: 最初の見出しまでの導入文を「まとめ」として読む（見出しが無ければ null）
  if (!source.querySelector(HEADING_SELECTOR)) return null;
  if (last.hasAttribute(AUTO_READ_MARK)) return null;
  last.setAttribute(AUTO_READ_MARK, '1');
  const text = readIntroText(source);
  return text === '' ? null : text;
}
