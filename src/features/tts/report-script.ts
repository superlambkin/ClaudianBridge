/**
 * v0.28.0 (F026): タスク完了報告 → 読上げ用スクリプト整形。
 * ✅ 完了報告から 報告ヘッダー（📢）・結論・次のアクション提案のサマリーのみを収集し、
 * TTS で自然に聴こえる敬体スクリプトを組み立てる。
 * 成果物・検証結果・参照文献・テーブルは読み上げない。
 * 設計書: 02_設計文書/2026-08-30-report-speech-script-design.md
 */
import {
  readVisibleTextExcluding,
  collectStructuralExcludes,
  HEADING_SELECTOR,
  isSummaryMarker,
} from './extract-report';

/** 読み上げるセクション（見出しテキスト完全一致 → 見出し語） */
const SECTION_SPECS: Array<{ heading: string; label: string }> = [
  { heading: '🎯 結論', label: '結論。' },
  { heading: '🔜 次のアクション提案', label: '次のアクション提案です。' },
];

/** サマリー収集を打ち切る要素（見出し・表・引用・思考・コード・ツール・コールアウト） */
const STOP_SELECTOR = `${HEADING_SELECTOR}, table, blockquote, .claudian-thinking-block, .claudian-code-wrapper, .claudian-tool-call, .callout`;

/** excludeSel（空許容）に追加セレクタを連結する。空なら追加のみ */
function joinExclude(excludeSel: string, extra: string): string {
  return excludeSel === '' ? extra : `${excludeSel}, ${extra}`;
}

/** excludeSel が空の場合は querySelectorAll('') がエラーになるため textContent にフォールバックする */
function readText(el: Element, excludeSel: string): string {
  return excludeSel === ''
    ? (el.textContent ?? '').trim()
    : readVisibleTextExcluding(el, excludeSel);
}

/** ✅ 完了報告（「✅」で始まり 完了/修正/実装 を含む見出しが存在）か判定する */
export function isCompletionReport(source: Element): boolean {
  return Array.from(source.querySelectorAll(HEADING_SELECTOR)).some((h) => {
    const t = (h.textContent ?? '').trim();
    return t.startsWith('✅') && (t.includes('完了') || t.includes('修正') || t.includes('実装'));
  });
}

/** 見出し直下の最初の非空段落（サマリー）を取得する。終端条件に当たったら空文字 */
function readSectionSummary(source: Element, heading: Element, excludeSel: string): string {
  const hidden = collectStructuralExcludes(source);
  hidden.push(heading);
  const mark = 'data-cb-temp-hide';
  hidden.forEach((e) => e.setAttribute(mark, '1'));
  try {
    let next: Element | null = heading.nextElementSibling;
    while (next && !next.matches(STOP_SELECTOR)) {
      const text = readText(next, joinExclude(excludeSel, `[${mark}]`));
      if (text !== '') return text;
      next = next.nextElementSibling;
    }
    return '';
  } finally {
    hidden.forEach((e) => e.removeAttribute(mark));
  }
}

/**
 * 完了報告 DOM から読上げ用スクリプトを組み立てる。
 * 収集できる要素が無い場合は null を返し、呼び出し側は従来の全文読上げへフォールバックする。
 */
export function buildReportScript(source: Element, excludeSel: string): string | null {
  const parts: string[] = [];

  const report = Array.from(source.querySelectorAll('blockquote'))
    .find((b) => isSummaryMarker((b.textContent ?? '').trim()));
  if (report) {
    const text = readText(report, excludeSel);
    if (text !== '') parts.push(text);
  }

  for (const { heading, label } of SECTION_SPECS) {
    const h = Array.from(source.querySelectorAll(HEADING_SELECTOR))
      .find((e) => (e.textContent ?? '').trim() === heading);
    if (!h) continue;
    const summary = readSectionSummary(source, h, excludeSel);
    if (summary !== '') parts.push(`${label} ${summary}`);
  }

  if (parts.length === 0) return null;
  return ['タスク完了です。', ...parts].join('\n');
}
