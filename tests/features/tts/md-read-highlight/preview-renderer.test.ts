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

describe('highlightChunkInPreview 終端計算 (v0.35.1)', () => {
  it('次チャンクの anchor 開始位置まで下線を広げる（読み上げ除外文字で隙間が空かない）', () => {
    // DOM にはハッシュタグ（読み上げ除外）が含まれる
    const view = { previewMode: { containerEl: makePreview('前半のチャンクです。 #タグ 後半のチャンクです。続き。') } };
    const c0: MdReadChunkAnchor = { index: 0, startLine: 0, anchor: '前半のチャンクです', text: '前半のチャンクです。', headingLevel: 0 };
    const c1: MdReadChunkAnchor = { index: 1, startLine: 0, anchor: '後半のチャンクです', text: '後半のチャンクです。続き。', headingLevel: 0 };
    highlightChunkInPreview(view, c0, 40, c1);
    const active = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    // 次チャンク先頭（後半の…）までは下線が及ぶ（#タグ を含む）
    expect(active?.textContent).toContain('タグ');
  });

  it('nextChunk 未指定なら従来どおり text 長で終端する', () => {
    const view = { previewMode: { containerEl: makePreview('Hello world. This is a long paragraph.') } };
    highlightChunkInPreview(view, chunk);
    const active = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    expect(active?.textContent).toContain('long paragraph');
  });
});
