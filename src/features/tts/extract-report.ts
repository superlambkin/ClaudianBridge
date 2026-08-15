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

/** ヘッダースコープで読み上げない要素（UI に加え、データ表 table も除外） */
const HEADER_SPEECH_EXCLUDE = `${HEADER_EXCLUDE}, table`;

/** 見出し要素（markdown 見出し） */
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/**
 * 指定要素に一時マークを付け、readVisibleTextExcluding で除外して読む。
 * @param el 読み取り元
 * @param hide 除外対象（一時マークを付与する要素）
 * @param excludeSel 静的な除外セレクタ
 */
function readTextWithHidden(el: Element, hide: Element[], excludeSel: string): string {
  const mark = 'data-cb-temp-hide';
  hide.forEach((t) => t.setAttribute(mark, '1'));
  try {
    return readVisibleTextExcluding(el, `${excludeSel}, [${mark}]`);
  } finally {
    hide.forEach((t) => t.removeAttribute(mark));
  }
}

/**
 * v0.14.1: 最初の見出しより前の「導入文」を取得する（ヘッダースコープの「結果全体まとめ」）。
 * 📢 が無い応答では、見出し以降（詳細・次のアクション）はヘッダーで読まない。
 * 呼び出し側で見出しの存在を確認済み。
 */
function readIntroText(el: Element): string {
  const firstHeading = el.querySelector(HEADING_SELECTOR)!;
  const after: Element[] = [];
  let sib: Element | null = firstHeading;
  while (sib) { after.push(sib); sib = sib.nextElementSibling; }
  return readTextWithHidden(el, after, HEADER_SPEECH_EXCLUDE);
}

/**
 * v0.14.2: 一項目のみの応答（見出しが1つ・導入文なし）で、その節（見出し以降）を読む。
 * データ表・思考ブロック・ボタンは除外（まとめとして読み上げる）。
 */
function readSectionText(el: Element, heading: Element): string {
  const before: Element[] = [];
  let prev: Element | null = heading.previousElementSibling;
  while (prev) { before.push(prev); prev = prev.previousElementSibling; }
  return readTextWithHidden(el, before, HEADER_SPEECH_EXCLUDE);
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

  // 📢 が無い場合: 導入文（最初の見出しまで）→ 一項目のみ（見出し1つ）の順でフォールバック
  const headings = Array.from(source.querySelectorAll(HEADING_SELECTOR));
  let text = '';
  if (headings.length >= 1) {
    text = readIntroText(source); // 見出し前の導入文（空なら ''）
  }
  if (!text && headings.length === 1) {
    text = readSectionText(source, headings[0]); // 一項目のみ → その節を読む
  }
  if (!text) return null;
  if (last.hasAttribute(AUTO_READ_MARK)) return null;
  last.setAttribute(AUTO_READ_MARK, '1');
  return text;
}
