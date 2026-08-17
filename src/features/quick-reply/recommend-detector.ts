export const MESSAGES_SELECTOR = '.claudian-messages';
export const RECOMMEND_DEBOUNCE_MS = 300;

// 推奨方案のパターン（ja/zh/en）。最初に一致した番号（1〜5）を採用する
const RECOMMEND_PATTERNS: RegExp[] = [
  // ja
  /推奨[は:：]?\s*(?:方案\s*)?([1-5])/,
  /おすすめ[は:：]?\s*(?:方案\s*)?([1-5])/,
  // zh
  /推荐\s*(?:方案)?\s*([1-5])/,
  /建议(?:选择)?\s*(?:方案)?\s*([1-5])/,
  // en
  /recommend(?:ed|ation)?\s*:?\s*(?:option\s*)?([1-5])/i,
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

/**
 * 直近の assistant メッセージ本文から推奨方案（1〜5）を抽出する。
 * realclaudian の messagesEl（.claudian-messages）を参照。
 * 取得不能・解析不能は null（無害）。
 */
export function readRecommendedOption(app: App): number | null {
  try {
    const p = (app as unknown as { plugins?: { plugins?: Record<string, RecommendPluginLike | undefined> } })
      ?.plugins?.plugins?.['realclaudian'];
    const view = p?.getView?.() ?? null;
    const tab = view?.getActiveTab?.() ?? null;
    const messagesEl = tab?.dom?.messagesEl;
    if (!messagesEl) return null;
    const msgs = messagesEl.querySelectorAll('[data-role="assistant"]');
    const last = msgs[msgs.length - 1];
    const text = last?.querySelector('.claudian-message-content')?.textContent ?? '';
    return extractRecommendedOption(text);
  } catch {
    return null;
  }
}

function isInMessages(node: Node): boolean {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return !!el?.closest?.(MESSAGES_SELECTOR);
}

/**
 * メッセージ領域の変化を監視し、デバウンス後に推奨方案を再スキャンする。
 * 戻り値は cleanup 関数。
 */
export function setupRecommendDetection(
  app: App,
  onChange: (option: number | null) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scan = (): void => {
    onChange(readRecommendedOption(app));
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
