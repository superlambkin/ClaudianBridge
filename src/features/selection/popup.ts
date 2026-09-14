import type { App } from 'obsidian';
import type { PopupPosition } from '../../core/settings';

export { PopupPosition };

export function buildPopup(app: App, onClaudian: () => void, onTts: () => void): HTMLElement {
  const div = document.createElement('div');
  div.classList.add('cb-popup');

  const btnClaudian = document.createElement('button');
  btnClaudian.classList.add('cb-action-btn');
  btnClaudian.textContent = 'Add to Claudian';
  btnClaudian.onclick = onClaudian;

  const btnTts = document.createElement('button');
  btnTts.classList.add('cb-action-btn');
  btnTts.textContent = 'Add to TTS';
  btnTts.onclick = onTts;

  div.appendChild(btnClaudian);
  div.appendChild(btnTts);
  return div;
}

/** 選択範囲（ビューポート基準の矩形）にポップアップを配置する。
 *  - 'top-right': 選択範囲の右上に外接（right 端合わせ、top - h - margin）
 *  - 'bottom':    選択範囲の直下（bottom + margin、既存挙動）
 *  いずれもビューポート端ではクランプ、選択テキストを覆う場合は反転する。
 *  `.cb-popup` は `position: fixed` のため left/top を設定しないと
 *  静的位置（body 末尾＝画面外）に描画されて見えなくなる。 */
export function positionPopup(
  popupEl: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
  mode: PopupPosition = 'top-right',
): void {
  const margin = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = popupEl.offsetWidth;
  const h = popupEl.offsetHeight;

  // --- 横方向 ---
  let left = mode === 'top-right' ? rect.right - w : rect.left;
  if (left + w + margin > vw) {
    left = vw - w - margin;  // 右はみ出し → 左にクランプ
  }
  left = Math.max(margin, left);

  // --- 縦方向 ---
  let top: number;
  if (mode === 'top-right') {
    top = rect.top - h - margin;
    if (top < margin) {
      // 上はみ出し → 選択範囲の下に反転
      top = rect.bottom + margin;
    }
  } else {
    top = rect.bottom + margin;
    if (top + h + margin > vh) {
      // 下はみ出し → 選択範囲の上に反転
      top = rect.top - h - margin;
    }
  }
  top = Math.max(margin, top);

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
}
