/**
 * v0.33.0 (F-028): 設定色 → CSS カスタム変数の反映ヘルパ。
 *
 * `SettingTabTts` の色 onChange から呼ばれて、`--cb-md-read-highlight`
 * を `document.documentElement` にセット/除去する。空文字・無効値のとき
 * は何もしない（CSS のフォールバック色を尊重）。
 */

/** `#aabbcc` または `#abc` 形式。case-insensitive。 */
const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function applyHighlightColor(color: string): void {
  const root = document.documentElement;
  if (color && HEX_RE.test(color)) {
    root.style.setProperty('--cb-md-read-highlight', hexToRgba(color, 0.35));
  } else {
    // 空文字・無効値: 既存値を除去（CSS フォールバックに戻す）
    root.style.removeProperty('--cb-md-read-highlight');
  }
}

/**
 * `#aabbcc` → `rgba(170, 187, 204, alpha)`。
 * `#abc` → `#aabbcc` に展開してから同じ処理。
 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').toLowerCase();
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
