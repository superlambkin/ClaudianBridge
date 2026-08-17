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
