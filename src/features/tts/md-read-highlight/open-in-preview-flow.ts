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
}

/** leaf の最小 shape（setViewState で読書モードを強制する） */
interface LeafLike {
  view: MarkdownViewLike;
  setViewState?: (state: unknown) => Promise<void>;
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
    }) as unknown as LeafLike | undefined;
  if (!targetLeaf) return;

  // 3. 前面化
  app.workspace.setActiveLeaf(targetLeaf as never, { focus: true } as never);

  // 4. 読書（Preview）モードに切替。
  // v0.32.7 修正: これまで使っていた view.setState({state:'preview'}) は
  // Obsidian の正式な状態キー（state.markdown / setViewState の mode）と
  // 異なるため実機では切替が効かず、Live Preview のまま → previewMode が空
  // → 下線が表示されない原因だった。正式 API の leaf.setViewState を使う。
  const view = targetLeaf.view;
  if (view.getMode && view.getMode() !== 'preview') {
    try {
      await targetLeaf.setViewState?.({
        type: 'markdown',
        state: { file: filePath, mode: 'preview' },
      });
    } catch (e) {
      console.warn('[cb-md-read-highlight] setViewState failed:', e);
    }
  }

  // 5. Preview DOM の render 待ち（最大 2.5 秒ポーリング）
  // previewMode.containerEl 内に実コンテンツ（p/h1/h2/li 等）が出るまで待つ。
  const container = view.previewMode?.containerEl;
  if (container) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const hasContent = container.querySelector('p, h1, h2, h3, h4, li, td, .markdown-preview-section');
      if (hasContent) break;
      await new Promise<void>((r) => setTimeout(r, 50));
    }
  } else {
    // containerEl 未取得でも最低 1 tick は待つ（後続 chunk で回復するため）
    await new Promise<void>((r) => setTimeout(r, 200));
  }
}
