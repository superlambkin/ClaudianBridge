// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildEditorDecorations, findRange } from '../../../../src/features/tts/md-read-highlight/editor-highlight';
import { mdReadState } from '../../../../src/features/tts/md-read-highlight/state';

/** 疑似 CM EditorView: doc テキスト + visibleRanges を持つ最小モック */
function makeEditorView(doc: string, ranges?: Array<{ from: number; to: number }>) {
  return {
    state: { doc },
    visibleRanges: ranges ?? [{ from: 0, to: doc.length }],
  } as never;
}

describe('findRange (v0.33.8)', () => {
  it('doc 内の anchor 位置を返す', () => {
    const doc = 'Hello world. This is paragraph 1.';
    expect(findRange(doc, 'Hello world.')).toEqual([0, 12]);
  });

  it('anchor が見つからなければ null', () => {
    expect(findRange('abc', 'zzz')).toBeNull();
  });
});

describe('buildEditorDecorations (v0.33.8)', () => {
  it('active chunk の anchor 範囲に Decoration を作る（空でない）', () => {
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'Hello world.', text: 'Hello world. This is paragraph 1.', headingLevel: 0 },
    ]);
    mdReadState.setActiveIdx(0);
    const view = makeEditorView('Hello world. This is paragraph 1.');
    const set = buildEditorDecorations(view);
    expect(set.size).toBeGreaterThan(0);
  });

  it('state 未登録（null）なら空の DecorationSet', () => {
    mdReadState.clear();
    const view = makeEditorView('Hello world.');
    const set = buildEditorDecorations(view);
    expect(set.size).toBe(0);
  });

  it('activeIdx = -1（未開始）なら空', () => {
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'Hello', text: 'Hello', headingLevel: 0 },
    ]);
    // setActiveIdx しない → activeIdx = -1
    const view = makeEditorView('Hello world.');
    expect(buildEditorDecorations(view).size).toBe(0);
  });

  it('anchor が doc に存在しなければ空（no-op・throw しない）', () => {
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'ZZZ', text: 'ZZZ', headingLevel: 0 },
    ]);
    mdReadState.setActiveIdx(0);
    const view = makeEditorView('Hello world.');
    expect(() => buildEditorDecorations(view)).not.toThrow();
    expect(buildEditorDecorations(view).size).toBe(0);
  });
});
