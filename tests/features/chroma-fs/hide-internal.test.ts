import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildChromaFsHideCss, installChromaFsHideCss, removeChromaFsHideCss, CHROMA_FS_STYLE_ID } from '../../../src/features/chroma-fs/hide-internal';

describe('chroma-fs hide-internal', () => {
  it('PDF/DOCX フォルダ以外のサブフォルダを非表示にする', () => {
    const css = buildChromaFsHideCss();
    expect(css).toContain('[data-path="chroma_db/PDF"]');
    expect(css).toContain('[data-path="chroma_db/DOCX"]');
    expect(css).toContain('display: none !important');
  });

  it('chroma_db 直下のファイル（sqlite / base）を非表示にする', () => {
    const css = buildChromaFsHideCss();
    expect(css).toContain('.nav-folder[data-path="chroma_db"] > .nav-folder-children > .nav-file');
    expect(css).toContain('display: none !important');
  });

  it('install / remove で style 要素が注入・除去される', () => {
    // jsdom 環境で document をモック
    const created = new Map<string, { textContent: string }>();
    const headChildren: unknown[] = [];
    const doc = {
      createElement: (tag: string) => {
        const el = {
          id: '',
          textContent: '',
          // 実 DOM の Element.remove() を模擬：headChildren から自身を除去する
          remove: () => {
            const idx = headChildren.indexOf(el);
            if (idx !== -1) headChildren.splice(idx, 1);
          },
        };
        created.set(tag, el);
        return el;
      },
      getElementById: (id: string) => headChildren.find((c) => (c as { id?: string }).id === id) ?? null,
      head: { appendChild: (el: unknown) => headChildren.push(el) },
    } as unknown as Document;
    const origDoc = globalThis.document;
    (globalThis as unknown as { document: unknown }).document = doc;

    try {
      installChromaFsHideCss();
      expect(created.get('style')?.textContent).toContain('chroma_db');
      removeChromaFsHideCss();
      expect(headChildren.find((c) => (c as { id?: string }).id === CHROMA_FS_STYLE_ID)).toBeUndefined();
    } finally {
      (globalThis as unknown as { document: unknown }).document = origDoc;
    }
  });
});
