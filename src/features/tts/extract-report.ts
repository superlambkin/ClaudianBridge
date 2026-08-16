/**
 * v0.11.0: タスク終了報告（📢）の DOM 抽出。
 * 発火条件は 📢 blockquote の存在（scope は読み上げ範囲のみ制御）。
 * 抽出と同時に重複防止マーク（data-cb-tts-read）を付与する。
 */
import type { SpeechFilterOptions } from '../../core/settings';

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

/** 読み上げから除外する realclaudian 要素（v0.17: タイプ別フィルタで個別制御） */
export const THINKING_BLOCK_SELECTOR = '.claudian-thinking-block';
export const CODE_WRAPPER_SELECTOR = '.claudian-code-wrapper';
/** コールアウト（> [!type]）セレクタ */
export const CALLOUT_SELECTOR = '.callout';
/** v0.18.1: ツール呼び出し（Read/Write/Bash/Task 等）のコンテナ */
export const TOOL_CALL_SELECTOR = '.claudian-tool-call';

/**
 * v0.19.0: 最終回答ターン判定。
 * 複数ターンタスクでは onTabStreamingChanged(false) が途中ターン終了時にも発火するため、
 * 「最後の assistant メッセージが最終回答（非空 .claudian-text-block 終端）か」を DOM 構造から判定する。
 * - 'ready': 最終回答テキストが存在 → 読み上げ可
 * - 'intermediate': 途中ターン（ツール/思考終端・中断） → 即スキップ（dedup マークを付けない）
 * - 'pending': 描画遅延等で判定不能 → リトライ
 */
export type FinalAnswerState = 'ready' | 'intermediate' | 'pending';

export function detectFinalAnswerState(messagesEl: Element): FinalAnswerState {
  const assistants = messagesEl.querySelectorAll('.claudian-message-assistant');
  const last = assistants[assistants.length - 1];
  if (!last) return 'pending';

  const source = last.querySelector('.claudian-message-content') ?? last;
  const blocks = Array.from(source.children).filter((c) =>
    c.classList.contains('claudian-text-block') ||
    c.classList.contains('claudian-tool-call') ||
    c.classList.contains('claudian-thinking-block')
  );

  // ブロッククラス無し（旧DOM・レンダリング前）: 可視テキスト有無で判定
  if (blocks.length === 0) {
    return readVisibleText(source) === '' ? 'pending' : 'ready';
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock.classList.contains('claudian-tool-call')) return 'intermediate';
  if (lastBlock.classList.contains('claudian-thinking-block')) return 'intermediate';
  // 最後は .claudian-text-block
  if (lastBlock.querySelector('.claudian-interrupted')) return 'intermediate';
  return readVisibleText(lastBlock) === '' ? 'pending' : 'ready';
}

/** ヘッダースコープの抽出で除外する UI 要素（コピー/読上げボタン） */
const HEADER_UI_EXCLUDE = '.claudian-text-copy-btn, [data-cb-msg-read]';

/** 読み上げ除外セレクタを組み立てる（filter の false 項目を除外対象に含める） */
export function buildSpeechExclude(filter: SpeechFilterOptions): string {
  const parts: string[] = [];
  if (!filter.thinking) parts.push(THINKING_BLOCK_SELECTOR);
  if (!filter.code) parts.push(CODE_WRAPPER_SELECTOR);
  if (!filter.callout) parts.push(CALLOUT_SELECTOR);
  if (!filter.toolCommands) parts.push(TOOL_CALL_SELECTOR);
  return parts.join(', ');
}

/** ヘッダースコープの除外セレクタ（UI ボタンも除外。table は filter.table に従う） */
function buildHeaderSpeechExclude(filter: SpeechFilterOptions): string {
  const base = buildSpeechExclude(filter);
  const withUi = base === '' ? HEADER_UI_EXCLUDE : `${base}, ${HEADER_UI_EXCLUDE}`;
  return filter.table ? withUi : `${withUi}, table`;
}

/** 見出し要素（markdown 見出し） */
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/** ヘッダースコープの「結果全体まとめ」マーカー（✅・📢 で始まる） */
function isSummaryMarker(text: string): boolean {
  const t = text.trim();
  return t.startsWith('📢') || t.startsWith('✅');
}

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
function readIntroText(el: Element, excludeSel: string): string {
  const firstHeading = el.querySelector(HEADING_SELECTOR)!;
  const after: Element[] = [];
  let sib: Element | null = firstHeading;
  while (sib) { after.push(sib); sib = sib.nextElementSibling; }
  return readTextWithHidden(el, after, excludeSel);
}

/**
 * v0.14.2: 一項目のみの応答（見出しが1つ・導入文なし）で、その節（見出し以降）を読む。
 * データ表・思考ブロック・ボタンは除外（まとめとして読み上げる）。
 */
function readSectionText(el: Element, heading: Element, excludeSel: string): string {
  const before: Element[] = [];
  let prev: Element | null = heading.previousElementSibling;
  while (prev) { before.push(prev); prev = prev.previousElementSibling; }
  return readTextWithHidden(el, before, excludeSel);
}

/**
 * v0.19.0: メッセージ内容から .claudian-text-block のみを読み連結する。
 * 思考・ツールは構造的に読み飛ばす（innerText の display 依存を排除）。
 * ブロッククラス無し（旧DOM・テスト）は従来どおり source 全体を読む。
 */
function extractTextBlocks(source: Element, excludeSel: string): string {
  const blocks = Array.from(source.children).filter((c) => c.classList.contains('claudian-text-block'));
  if (blocks.length === 0) {
    return excludeSel === '' ? readVisibleText(source) : readVisibleTextExcluding(source, excludeSel);
  }
  return blocks
    .map((b) => (excludeSel === '' ? readVisibleText(b) : readVisibleTextExcluding(b, excludeSel)))
    .filter((t) => t !== '')
    .join('\n');
}

/**
 * messagesEl（.claudian-messages）内の最後の assistant メッセージから読み上げテキストを抽出。
 * - header: 結果全体まとめのみ。📢 blockquote → 導入文（最初の見出しより前）の順でフォールバック。
 *   v0.14.1 より 📢 が無くても導入文は読む（詳細・次のアクションは読まない）。
 * - full:   メッセージ全文（.claudian-message-content）。v0.13.0 以降は 📢 有無に関わらず
 *           最後の応答を全文読み上げる（CLI Stop hook に代わるプラグイン一元化）。
 * @param opts.excludeCallouts コールアウト（> [!type]）を除外するか（既定 true・後方互換）
 * @param opts.filter タイプ別読み上げフィルタ（false の項目を除外）。省略時は既定（思考/コード/コールアウト/テーブルを除外）
 * 抽出済み・assistant なしの場合は null。
 */
export function extractReportText(
  messagesEl: Element,
  scope: AutoReadScope,
  opts?: { excludeCallouts?: boolean; filter?: SpeechFilterOptions },
): string | null {
  const filter: SpeechFilterOptions = opts?.filter ?? {
    emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true,
    callout: !(opts?.excludeCallouts ?? true),
    table: false, code: false, thinking: false, toolCommands: false,
  };
  const speechExclude = buildSpeechExclude(filter);
  const headerSpeechExclude = buildHeaderSpeechExclude(filter);
  const assistants = messagesEl.querySelectorAll('.claudian-message-assistant');
  const last = assistants[assistants.length - 1];
  if (!last) return null;

  const report = Array.from(last.querySelectorAll('blockquote'))
    .find((b) => isSummaryMarker((b.textContent ?? '').trim()));

  // v0.13.0: full scope は 📢 有無に関わらず最後の応答を全文読み上げ（全応答統一）
  if (scope === 'full') {
    if (last.hasAttribute(AUTO_READ_MARK)) return null;
    last.setAttribute(AUTO_READ_MARK, '1');
    const source = last.querySelector('.claudian-message-content') ?? last;
    const text = extractTextBlocks(source, speechExclude);
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
    text = readIntroText(source, headerSpeechExclude); // 見出し前の導入文（空なら ''）
  }
  if (!text && headings.length === 1) {
    text = readSectionText(source, headings[0], headerSpeechExclude); // 一項目のみ → その節を読む
  }
  if (!text) return null;
  if (last.hasAttribute(AUTO_READ_MARK)) return null;
  last.setAttribute(AUTO_READ_MARK, '1');
  return text;
}
