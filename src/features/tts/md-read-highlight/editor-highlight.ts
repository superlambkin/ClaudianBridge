/**
 * v0.33.8 (F-028): Live Preview 用・検索ハイライト方式の装飾拡張。
 *
 * Obsidian の検索ハイライトと同じ CodeMirror 6 の Decoration 方式で、
 * 現在読み上げ中のチャンク anchor に背景色マークを付ける。
 * Preview（読書）モードの span 注入（preview-renderer.ts）と併用。
 */
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { mdReadState } from './state';

/** active チャンク用の mark decoration（検索ハイライト風） */
const activeMark = Decoration.mark({ class: 'cb-md-read-chunk is-active' });

/**
 * doc テキスト中の anchor の [from, to] を返す。見つからなければ null。
 */
export function findRange(doc: string, anchor: string): [number, number] | null {
  if (!anchor) return null;
  const idx = doc.indexOf(anchor);
  if (idx < 0) return null;
  return [idx, idx + anchor.length];
}

/**
 * editor view から現在の装飾セットを構築する純粋関数（テスト可能）。
 * active chunk の anchor が doc に存在する範囲に mark を付与。
 */
export function buildEditorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const s = mdReadState.get();
  if (!s || s.activeIdx < 0) return builder.finish();

  const chunk = s.chunks[s.activeIdx];
  if (!chunk?.anchor) return builder.finish();

  const doc = view.state.doc.toString();
  const range = findRange(doc, chunk.anchor);
  if (!range) return builder.finish();

  builder.add(range[0], range[1], activeMark);
  return builder.finish();
}

/**
 * Live Preview / Source エディタに登録する拡張。
 * main.ts の registerEditorExtension から使用。
 * mdReadState の変化は global なので、editor の update 時に再計算する。
 */
export const mdReadEditorHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildEditorDecorations(view);
    }

    update(update: ViewUpdate): void {
      // state の変化は外部から来るため、毎 update で再計算（軽量処理のため許容）
      this.decorations = buildEditorDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
