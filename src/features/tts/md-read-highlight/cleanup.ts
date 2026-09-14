/**
 * v0.31.0 (F-028): MD 読み上げハイライト機能のクリーンアップ統合。
 *
 * `setupMdReadHighlight` から呼ばれる、または file-close 時等任意のタイミング
 * で呼ばれて、全 Markdown leaf のハイライト span を除去 + state を破棄する。
 */
import type { App } from 'obsidian';
import { mdReadState } from './state';
import { clearAllHighlights } from './preview-renderer';

/** preview-renderer が要求する shape（containerEl は必須） */
interface PreviewView {
  previewMode: { containerEl: HTMLElement };
}

/**
 * 全 Markdown leaf のハイライトを取り除き、state も破棄する。
 * leaf.view.previewMode.containerEl が存在するものだけを処理（Live Preview / Source は no-op）。
 */
export function clearAllForFile(app: App): void {
  app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
    const view = leaf.view as Partial<PreviewView>;
    if (view?.previewMode?.containerEl) {
      // この時点で containerEl は HTMLElement にナローされている
      clearAllHighlights(view as PreviewView);
    }
  });
  mdReadState.clear();
}
