export const MESSAGES_SELECTOR = '.claudian-messages';
export const RECOMMEND_DEBOUNCE_MS = 300;

// 推奨方案のパターン（ja/zh/en）。最初に一致した番号（1〜5）を採用する
// (?!\d) は桁境界: 「方案10」等の先頭桁（1）を誤マッチしないようにする
// v0.26.0: 「案」（方案なし）・最優先/第一選択/優先案・首选/优选・best/prefer を追加
// 「(?:方案|案)」: 「方案」(2 文字) または「案」(1 文字) のいずれかを許容
const RECOMMEND_PATTERNS: RegExp[] = [
  // ja: 既存（推奨/おすすめ）
  /推奨[は:：]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /推奨案[は:：]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /おすすめ[は:：]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  // ja: 追加（最優先/第一選択/優先案/優先）
  /最優先[のは]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /第一選択[は:：]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /優先(?:度|案)?[は:：]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  // ja: 逆順（案N が推奨 / 案N を推奨 / 案N がお勧め）
  /(?:(?:方案|案)\s*)?([1-5])(?!\d)\s*(?:が|を)?\s*(?:推奨|おすすめ)(?:です|されます|します|だ)?/,
  // zh: 既存（推荐/建议）
  /推荐\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /建议(?:选择)?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  // zh: 追加（首选/优选）
  /首选[是的]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  /优选[的]?\s*(?:(?:方案|案)\s*)?([1-5])(?!\d)/,
  // en: 既存 + 追加（recommend/best/prefer）
  /recommend(?:ed|ation)?\s*:?\s*(?:(?:option|choice|pick)\s*)?([1-5])(?!\d)/i,
  /best\s*(?:(?:option|choice|pick)\s*)?([1-5])(?!\d)/i,
  /prefer(?:red)?\s*(?:(?:option|choice|pick)\s*)?([1-5])(?!\d)/i,
  // v0.30.2: 完了報告（次のアクション提案）の 👑 推奨マーカー（👑N）
  /👑\s*([1-5])(?!\d)/,
];

/**
 * v0.23.0: メッセージ本文から推奨方案（1〜5）を抽出する純関数。
 * 見つからない・範囲外は null。
 */
export function extractRecommendedOption(text: string): number | null {
  if (!text) return null;
  for (const re of RECOMMEND_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 5) return n;
    }
  }
  return null;
}

import type { App } from 'obsidian';

// === v0.23.0: 推奨方案の自動検出 ===

// realclaudian プラグインへのアクセスに必要な最小形状。
// インラインで `Record<string, { ... } | undefined>` を書くと esbuild の TS パーサーが解析失敗するため、named type に分離。
type RecommendTabLike = { dom?: { messagesEl?: HTMLElement } };
type RecommendViewLike = { getActiveTab?: () => RecommendTabLike | null | null };
type RecommendPluginLike = { getView?: () => RecommendViewLike | null | null };

/** 直近の assistant メッセージ本文を取得する（取得不能は空文字） */
function readLastAssistantText(app: App): string {
  try {
    const p = (app as unknown as { plugins?: { plugins?: Record<string, RecommendPluginLike | undefined> } })
      ?.plugins?.plugins?.['realclaudian'];
    const view = p?.getView?.() ?? null;
    const tab = view?.getActiveTab?.() ?? null;
    const messagesEl = tab?.dom?.messagesEl;
    if (!messagesEl) return '';
    const msgs = messagesEl.querySelectorAll('[data-role="assistant"]');
    const last = msgs[msgs.length - 1];
    return last?.querySelector('.claudian-message-content')?.textContent ?? '';
  } catch {
    return '';
  }
}

/** 直近の assistant メッセージ本文から推奨方案（1〜5）を抽出する。取得不能・解析不能は null。 */
export function readRecommendedOption(app: App): number | null {
  return extractRecommendedOption(readLastAssistantText(app));
}

/** クイック返信ボタンの状態（推奨方案 + 選択肢数） */
export interface RecommendState {
  recommended: number | null;
  maxOptionCount: number;
}

/** 直近の assistant メッセージから推奨方案と選択肢数を返す */
export function readRecommendationState(app: App): RecommendState {
  const text = readLastAssistantText(app);
  return {
    recommended: extractRecommendedOption(text),
    maxOptionCount: extractMaxOptionCount(text),
  };
}

/**
 * 追加ノードがメッセージ領域（.claudian-messages）に関連するかを判定する。
 * 2 ケースをカバー:
 *  1. ノード自身が .claudian-messages の内部・またはそれ自体（closest で上方向に判定）
 *  2. ノードが .claudian-messages を CONTAINS する（タブ切替時にラッパーごと再構築されるケース）
 * パターンは src/features/tts/toolbar-buttons.ts の
 * `node.matches(SELECTOR) || node.querySelector(SELECTOR)` に倣う。
 */
function isInMessages(node: Node): boolean {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return false;
  if (el.closest?.(MESSAGES_SELECTOR)) return true;
  return !!el.querySelector?.(MESSAGES_SELECTOR);
}

/**
 * メッセージ領域の変化を監視し、デバウンス後に推奨方案と選択肢数を再スキャンする。
 * onChange には RecommendState（推奨方案 + 選択肢数）が渡る。
 * 戻り値は cleanup 関数。
 */
export function setupRecommendDetection(
  app: App,
  onChange: (state: RecommendState) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scan = (): void => {
    onChange(readRecommendationState(app));
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(scan, RECOMMEND_DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        if (m.target.parentElement?.closest(MESSAGES_SELECTOR)) { shouldScan = true; break; }
        continue;
      }
      for (const node of Array.from(m.addedNodes)) {
        if (isInMessages(node)) { shouldScan = true; break; }
      }
      if (shouldScan) break;
    }
    if (shouldScan) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // 初回スキャン
  schedule();

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}

/**
 * v0.23.0: メッセージ本文から選択肢の最大数（方案N）を抽出する純関数。
 * 個別表記（方案1、方案2、…）と範囲表記（方案1〜5 / 方案1-5 / 方案1〜方案5）を併走し、
 * 収集した数値の最大値を返す。該当なしは 0。上限 99。
 */
export function extractMaxOptionCount(text: string): number {
  if (!text) return 0;
  const nums: number[] = [];
  // v0.26.0: 「(?:方案|案)」で方案なし（例: 案1〜4）もカバー
  // 範囲表記: 終端値を採用（方案1〜5 / 案1〜案5 / 案1-5）
  const rangeRe = /(?:方案|案)\s*(\d{1,2})\s*[〜~～\-–]\s*(?:(?:方案|案)\s*)?(\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    nums.push(Number(m[2]));
  }
  // 個別表記: 方案N / 案N（(?!\d) で「方案10」「案10」の先頭桁を誤マッチしない）
  const singleRe = /(?:方案|案)\s*(\d{1,2})(?!\d)/g;
  while ((m = singleRe.exec(text)) !== null) {
    nums.push(Number(m[1]));
  }
  // v0.30.2: 完了報告（次のアクション提案）の選択肢検出
  // 👑N マーカー（推奨行の番号）を追加
  const crownRe = /👑\s*(\d{1,2})(?!\d)/g;
  while ((m = crownRe.exec(text)) !== null) {
    nums.push(Number(m[1]));
  }
  // 選択プロンプト「数字（1/2/3）」→ 全数値の最大（範囲/個別どちらもカバー）
  const promptRe = /数字\s*[（(]\s*(\d{1,2})(?:\s*\/\s*(\d{1,2}))*\s*[）)]/g;
  while ((m = promptRe.exec(text)) !== null) {
    nums.push(Number(m[1]));
    for (let i = 2; i < m.length; i++) {
      if (m[i]) nums.push(Number(m[i]));
    }
  }
  if (nums.length === 0) return 0;
  return Math.min(Math.max(...nums), 99);
}
