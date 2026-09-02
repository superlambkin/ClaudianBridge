import type { MdReadState } from './types';

interface PreviewLike {
  previewMode?: { containerEl: HTMLElement };
}

interface OverlayHandlers {
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onMute: () => void;
}

const OVERLAY_CLASS = 'cb-md-read-overlay';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountOverlay(
  view: PreviewLike,
  handlers: OverlayHandlers
): () => void {
  // v0.33.5: overlay は document.body 直下に append
  // （previewMode.containerEl は mode 切替時に再生成されるため
  // overlay が孤立しやすい。position: fixed で位置は viewport 基準なので
  // 親 DOM に依存しない → document.body 直下が堅牢）
  void view; // 引数は将来の拡張用に保持（pre-existing API 互換）

  const overlay = el('div', { class: OVERLAY_CLASS });
  const pauseBtn = el('button', { 'data-cb-md-read-pause': 'true' }, '⏸');
  const skipBtn = el('button', { 'data-cb-md-read-skip': 'true' }, '⏭');
  const muteBtn = el('button', { 'data-cb-md-read-mute': 'true' }, '🔇');
  const progress = el('span', { 'data-cb-md-read-progress': 'true' }, '-/-');
  overlay.appendChild(pauseBtn);
  overlay.appendChild(skipBtn);
  overlay.appendChild(muteBtn);
  overlay.appendChild(progress);

  pauseBtn.addEventListener('click', () => handlers.onPause());
  skipBtn.addEventListener('click', () => handlers.onSkip());
  muteBtn.addEventListener('click', () => handlers.onMute());

  document.body.appendChild(overlay);

  return () => {
    overlay.remove();
  };
}