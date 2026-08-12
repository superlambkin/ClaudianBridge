import type { App } from 'obsidian';

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
 *  `.cb-popup` は `position: fixed` のため left/top を設定しないと
 *  静的位置（body 末尾＝画面外）に描画されて見えなくなる。 */
export function positionPopup(
  popupEl: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
): void {
  const margin = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = popupEl.offsetWidth;
  const h = popupEl.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + margin;

  // 右端はみ出し → 左にクランプ
  if (left + w + margin > vw) {
    left = vw - w - margin;
  }
  left = Math.max(margin, left);

  // 下端はみ出し → 選択範囲の上に反転
  if (top + h + margin > vh) {
    top = rect.top - h - margin;
  }
  top = Math.max(margin, top);

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
}
