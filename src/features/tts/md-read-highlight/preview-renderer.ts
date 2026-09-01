import type { MdReadChunkAnchor } from './types';

const ACTIVE_CLASS = 'is-active';
const CHUNK_CLASS = 'cb-md-read-chunk';
/** チャンクマーカー span を識別するための CSS プレフィックス文字列 */
const WRAPPER_MARK = 'data-cb-md-read-chunk';

interface PreviewLike {
  previewMode?: { containerEl: HTMLElement };
}

/** 既存のアクティブ span を全て非アクティブ化 */
function deactivateAll(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(`.${CHUNK_CLASS}.${ACTIVE_CLASS}`)
    .forEach((el) => el.classList.remove(ACTIVE_CLASS));
}

/** TreeWalker で anchor を含む最初のテキストノードを発見 */
function findAnchorNode(container: HTMLElement, anchor: string): Text | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.nodeValue && textNode.nodeValue.includes(anchor)) {
      return textNode;
    }
    node = walker.nextNode();
  }
  return null;
}

/** anchor を含むテキストノードを wrap してアクティブ化 */
export function highlightChunkInPreview(view: PreviewLike, chunk: MdReadChunkAnchor): void {
  const container = view.previewMode?.containerEl;
  if (!container) return;
  deactivateAll(container);
  const textNode = findAnchorNode(container, chunk.anchor);
  if (!textNode) return; // フォールバック：throw しない

  const text = textNode.nodeValue ?? '';
  const idx = text.indexOf(chunk.anchor);
  if (idx < 0) return;
  const before = document.createTextNode(text.slice(0, idx));
  const matched = document.createElement('span');
  matched.className = `${CHUNK_CLASS} ${ACTIVE_CLASS}`;
  matched.setAttribute(WRAPPER_MARK, String(chunk.index));
  matched.textContent = chunk.anchor;
  const after = document.createTextNode(text.slice(idx + chunk.anchor.length));

  const parent = textNode.parentNode;
  if (!parent) return;
  parent.insertBefore(before, textNode);
  parent.insertBefore(matched, textNode);
  parent.insertBefore(after, textNode);
  parent.removeChild(textNode);

  if (typeof matched.scrollIntoView === 'function') {
    matched.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/** 全アクティブ + 全 wrapper を除去 */
export function clearAllHighlights(view: PreviewLike): void {
  const container = view.previewMode?.containerEl;
  if (!container) return;
  container.querySelectorAll(`.${CHUNK_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    const text = document.createTextNode(el.textContent ?? '');
    parent.insertBefore(text, el);
    parent.removeChild(el);
    parent.normalize();
  });
}
