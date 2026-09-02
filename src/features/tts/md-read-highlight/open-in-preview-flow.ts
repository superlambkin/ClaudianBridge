/**
 * v0.33.4 (F-028 bugfix): ファイル自動オープン + Preview モード切替。
 *
 * v0.33.3 の実装 `getLeaf(false).openFile()` + `find-by-path` は
 * 「md-leaf でない状態」「setState の {history:false} 無視」で
 * Source モードで開く問題があった。v0.33.4 では:
 *
 *   1. `app.workspace.openLinkText(path, '', false)` で開く
 *      （Obsidian 高レベル API・leaf と view 解決を内部で処理）
 *   2. `getLeavesOfType('markdown')` で対象 view を取得
 *   3. `setActiveLeaf({focus: true})` で前面化
 *   4. `view.setState({state:'preview'}, {focus: true})` で切替
 *      （{history:false} は無効な第2引数なので除去）
 *   5. await 1 tick で preview DOM の render を待つ
 *      （chunk-by-chunk ハイライトが同期実行される前の race を回避）
 */
import { Notice } from 'obsidian';
import type { App } from 'obsidian';

interface MarkdownViewLike {
  file?: { path?: string } | null;
  previewMode?: { containerEl?: HTMLElement };
  getMode?: () => string;
  setState?: (state: { state?: string }, opts?: { focus?: boolean }) => void;
}

export async function openInPreview(app: App, filePath: string): Promise<void> {
  const abstractFile = app.vault.getAbstractFileByPath(filePath);
  if (!abstractFile) {
    new Notice(`⚠️ ファイルが見つかりません: ${filePath}`);
    return;
  }

  // 1. 高レベル API でファイルを開く（leaf 解決は内部）
  await app.workspace.openLinkText(filePath, '', false);

  // 2. 該当 MarkdownView を取得
  const targetLeaf = app.workspace
    .getLeavesOfType('markdown')
    .find((l) => {
      const v = (l.view as unknown as MarkdownViewLike);
      return v?.file?.path === filePath;
    });
  if (!targetLeaf) return;

  // 3. 前面化
  app.workspace.setActiveLeaf(targetLeaf as never, { focus: true } as never);

  // 4. Preview（読書）モードに切替（v0.33.7 確定: Live Preview では
  // previewMode.containerEl が空のためハイライト不可）
  const view = (targetLeaf.view as unknown) as MarkdownViewLike;
  if (view.getMode && view.getMode() !== 'preview') {
    view.setState?.({ state: 'preview' }, { focus: true });
  }

  // 5. Preview DOM の render 待ち（v0.33.7 強化: 200ms）
  await new Promise<void>((r) => setTimeout(r, 200));
}
