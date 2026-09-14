/**
 * v0.35.2: ハイライト色パレット（スウォッチグリッド＋カスタムピッカー）。
 * テキスト入力の代わりに色チップのクリックで直感的に色を選択できる。
 * 設定キーは mdReadHighlight.highlightColor のまま（後方互換）。
 */
import { getLocaleStrings, getUILanguage } from '../core/i18n';

export interface ColorPreset {
  labelKey: keyof ReturnType<typeof getLocaleStrings>;
  value: string;
  dark: boolean;
}

/** プリセット 16 色（通常 8 + 濃い 8） */
export const HIGHLIGHT_COLOR_PRESETS: ColorPreset[] = [
  { labelKey: 'mdReadColorDefault', value: '#ffb300', dark: false },
  { labelKey: 'mdReadColorYellow', value: '#ffd54f', dark: false },
  { labelKey: 'mdReadColorGreen', value: '#a5d6a7', dark: false },
  { labelKey: 'mdReadColorBlue', value: '#81d4fa', dark: false },
  { labelKey: 'mdReadColorPink', value: '#f48fb1', dark: false },
  { labelKey: 'mdReadColorOrange', value: '#ffab91', dark: false },
  { labelKey: 'mdReadColorPurple', value: '#ce93d8', dark: false },
  { labelKey: 'mdReadColorGray', value: '#cfd8dc', dark: false },
  { labelKey: 'mdReadColorDarkDefault', value: '#b26a00', dark: true },
  { labelKey: 'mdReadColorDarkYellow', value: '#f9a825', dark: true },
  { labelKey: 'mdReadColorDarkGreen', value: '#43a047', dark: true },
  { labelKey: 'mdReadColorDarkBlue', value: '#1e88e5', dark: true },
  { labelKey: 'mdReadColorDarkPink', value: '#e53935', dark: true },
  { labelKey: 'mdReadColorDarkOrange', value: '#f4511e', dark: true },
  { labelKey: 'mdReadColorDarkPurple', value: '#8e24aa', dark: true },
  { labelKey: 'mdReadColorDarkGray', value: '#607d8b', dark: true },
];

/**
 * パレットを container へ描画する。
 * @param current 現在の色（一致スウォッチを強調）
 * @param onPick 色選択時のコールバック
 */
export function renderHighlightColorPalette(
  container: HTMLElement,
  current: string,
  onPick: (color: string) => void,
): void {
  const s = getLocaleStrings(getUILanguage());
  const grid = document.createElement('div');
  grid.className = 'cb-color-palette';

  for (const preset of HIGHLIGHT_COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'cb-color-swatch' + (preset.value === current ? ' is-selected' : '');
    btn.style.backgroundColor = preset.value;
    btn.setAttribute('aria-label', String(s[preset.labelKey]));
    btn.title = String(s[preset.labelKey]);
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.cb-color-swatch').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      onPick(preset.value);
    });
    grid.appendChild(btn);
  }

  // カスタムピッカー（パレット外の色）
  const customLabel = document.createElement('label');
  customLabel.className = 'cb-color-swatch cb-color-custom';
  customLabel.title = s.mdReadColorCustom;
  customLabel.setAttribute('aria-label', s.mdReadColorCustom);
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.value = /^#[0-9a-fA-F]{6}$/.test(current) ? current : '#ffb300';
  custom.addEventListener('change', () => {
    grid.querySelectorAll('.cb-color-swatch').forEach((el) => el.classList.remove('is-selected'));
    customLabel.classList.add('is-selected');
    onPick(custom.value);
  });
  customLabel.appendChild(custom);
  grid.appendChild(customLabel);

  container.appendChild(grid);
}
