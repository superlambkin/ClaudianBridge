// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { highlightChunkInPreview, clearAllHighlights } from '../../../../src/features/tts/md-read-highlight/preview-renderer';
import type { MdReadChunkAnchor } from '../../../../src/features/tts/md-read-highlight/types';

function makePreview(text: string): HTMLElement {
  document.body.innerHTML = '';
  const p = document.createElement('div');
  p.textContent = text;
  document.body.appendChild(p);
  return p;
}

const chunk: MdReadChunkAnchor = {
  index: 0,
  startLine: 0,
  anchor: 'Hello world. This is',
  text: 'Hello world. This is a long paragraph.',
  headingLevel: 0,
};

describe('highlightChunkInPreview', () => {
  beforeEach(() => document.body.innerHTML = '');

  it('anchor を span でラップ → is-active クラス付与', () => {
    const view = { previewMode: { containerEl: makePreview('Hello world. This is a test.') } };
    highlightChunkInPreview(view, chunk);
    const active = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain('Hello world');
  });

  it('anchor が見つからない場合 no-op（throw しない）', () => {
    const view = { previewMode: { containerEl: makePreview('xyz') } };
    expect(() => highlightChunkInPreview(view, chunk)).not.toThrow();
  });

  it('既存アクティブはクラス剥奪 → 新アクティブ付与', () => {
    const view = {
      previewMode: {
        containerEl: makePreview('Hello world. This is a test.'),
      },
    };
    highlightChunkInPreview(view, chunk);
    const first = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    highlightChunkInPreview(view, { ...chunk, index: 1, anchor: 'xyz' });
    // 古い active は消える
    expect(view.previewMode.containerEl.querySelectorAll('.cb-md-read-chunk.is-active')).toHaveLength(0);
    // 新規 anchor がマッチしない場合 no-op → active 数 = 0
    expect(first).not.toBeNull();
  });

  it('clearAllHighlights で全 cb-md-read-chunk を削除', () => {
    const view = { previewMode: { containerEl: makePreview('Hello world. This is a test.') } };
    highlightChunkInPreview(view, chunk);
    clearAllHighlights(view);
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-chunk')).toBeNull();
  });
});
