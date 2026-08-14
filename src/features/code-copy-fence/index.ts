import type { ConfigStore } from '../../core/config-store';

/**
 * v0.9.0: Claudian チャットのコードブロック言語ラベルのクリックコピーを
 * フックし、コードフェンス（```lang ... ```）付きの内容をクリップボードへ書く。
 *
 * realclaudian 本体はレンダリング済み DOM の textContent をコピーするため
 * フェンスが欠落し、Mermaid 等が貼り付け後に描画されない。このモジュールは
 * capture フェーズで click を横取りしてフェンスを付与する。
 *
 * 設定 general.codeCopyFence が false のときは素通し（realclaudian の既定動作）。
 */
export function setupCodeCopyFence(store: ConfigStore): () => void {
  const handler = (e: Event): void => {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;

    // 設定 OFF なら素通し
    if (!store.load().general.codeCopyFence) return;

    const label = target.closest('.claudian-code-lang-label') as HTMLElement | null;
    if (!label) return;

    const wrapper = label.closest('.claudian-code-wrapper');
    const code = wrapper
      ? (wrapper.querySelector('pre code') ?? wrapper.querySelector('code'))
      : null;
    const lang = (label.textContent ?? '').trim();
    const text = code?.textContent ?? '';
    const fence = '```' + lang + '\n' + text + '\n```';

    e.stopPropagation();
    e.preventDefault();

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(fence)
        .then(() => {
          label.textContent = 'Copied!';
          window.setTimeout(() => { label.textContent = lang; }, 1500);
        })
        .catch(() => { /* コピー失敗は無視 */ });
    }
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}
