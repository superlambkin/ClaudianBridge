// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeForMatch } from '../../../../src/features/tts/md-read-highlight/match';
import { highlightChunkInPreview, clearAllHighlights } from '../../../../src/features/tts/md-read-highlight/preview-renderer';
import type { MdReadChunkAnchor } from '../../../../src/features/tts/md-read-highlight/types';

function chunk(partial: Partial<MdReadChunkAnchor>): MdReadChunkAnchor {
  return { index: 0, startLine: 0, anchor: '', text: '', headingLevel: 0, ...partial };
}

describe('normalizeForMatch (v0.32.4)', () => {
  it('記号（# / - ‐ / [[ ]] / ** など）と空白を完全に除去する', () => {
    expect(normalizeForMatch('# 大見出し')).toBe('大見出し');
    expect(normalizeForMatch('東京‐大阪')).toBe('東京大阪');
    expect(normalizeForMatch('**重要**')).toBe('重要');
    expect(normalizeForMatch('data/test')).toBe('datatest');
  });

  it('連続空白も全て除去する', () => {
    expect(normalizeForMatch('a    b')).toBe('ab');
  });
});

describe('highlightChunkInPreview: 正規化マッチング（v0.32.4）', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('フィルタ前テキスト（# 付き見出し）の DOM でも anchor に一致する', () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>大見出し</h1><p>本文です。</p>';
    document.body.appendChild(container);
    const view = { previewMode: { containerEl: container } };

    // anchor は記号・空白除去後テキスト（TTS 側と同じ形）
    highlightChunkInPreview(view, chunk({ anchor: '大見出し本文です' }));
    expect(container.querySelector('.cb-md-read-chunk.is-active')).not.toBeNull();
  });

  it('ハイフン違い（DOM=‐ / anchor=空白）でも一致する', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>東京‐大阪間の話</p>';
    document.body.appendChild(container);
    const view = { previewMode: { containerEl: container } };

    highlightChunkInPreview(view, chunk({ anchor: '東京 大阪間の話' }));
    expect(container.querySelector('.cb-md-read-chunk.is-active')).not.toBeNull();
  });

  it('anchor が複数テキストノードに跨っていても span を付ける', () => {
    const container = document.createElement('div');
    // <b> で分断されたテキストノード
    container.innerHTML = '<p>これは<b>重要な</b>段落です</p>';
    document.body.appendChild(container);
    const view = { previewMode: { containerEl: container } };

    highlightChunkInPreview(view, chunk({ anchor: 'これは重要な段落です' }));
    const spans = container.querySelectorAll('.cb-md-read-chunk.is-active');
    expect(spans.length).toBeGreaterThanOrEqual(2); // 両ノードに span
  });

  it('一致しなければ no-op（throw しない）', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>無関係</p>';
    document.body.appendChild(container);
    const view = { previewMode: { containerEl: container } };
    expect(() => highlightChunkInPreview(view, chunk({ anchor: '存在しないアンカー' }))).not.toThrow();
    expect(container.querySelector('.cb-md-read-chunk.is-active')).toBeNull();
  });

  it('clearAllHighlights で span が外れテキストが復元される', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>東京‐大阪間の話</p>';
    document.body.appendChild(container);
    const view = { previewMode: { containerEl: container } };
    highlightChunkInPreview(view, chunk({ anchor: '東京大阪間の話' }));
    clearAllHighlights(view);
    expect(container.querySelector('.cb-md-read-chunk')).toBeNull();
    expect(container.querySelector('p')!.textContent).toBe('東京‐大阪間の話');
  });
});
