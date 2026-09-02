/**
 * v0.33.0 (F-028): MD 読み上げハイライト機能の setup 関数。
 *
 * main.ts から呼ばれ、workspace.on('layout-change') と mdReadState.subscribe を
 * 登録して、ライフサイクルイベントに応じたクリア処理 + DOM 配線
 * （overlay mount / chunk highlight / progress 更新）を行う。
 *
 * 注: 当初 design.md では 'file-close' だったが、Obsidian の Workspace.on は
 * 'file-close' を公開していない（API 型に存在しない）。タブクローズも含む
 * 'layout-change' で代替し、state が残っているときだけクリアする安全側実装。
 */
import type { App } from 'obsidian';
import type { ConfigStore } from '../../../core/config-store';
import { mdReadState } from './state';
import { clearAllForFile } from './cleanup';
import { mountOverlay } from './floating-overlay';
import { highlightChunkInPreview } from './preview-renderer';
import { nextHeadingIndex } from './heading-skip';
import { stopAllPlayback } from '../playback-registry';

interface PreviewViewLike {
  previewMode?: { containerEl?: HTMLElement };
  file?: { path?: string } | null;
}

/** 指定 filePath の MD Preview view を探す（先頭一致）。なければ null。 */
function findPreviewViewForFile(app: App, filePath: string): PreviewViewLike | null {
  const leaves = app.workspace.getLeavesOfType('markdown');
  for (const leaf of leaves) {
    const view = (leaf.view as unknown) as PreviewViewLike;
    if (view?.file?.path === filePath && view.previewMode?.containerEl) {
      return view;
    }
  }
  return null;
}

/** overlay の [data-cb-md-read-progress] テキストを `idx+1/total` で更新 */
function updateOverlayProgress(view: PreviewViewLike, idx: number, total: number): void {
  const span = view.previewMode?.containerEl?.querySelector<HTMLElement>(
    '[data-cb-md-read-progress]',
  );
  if (span) span.textContent = `${idx + 1}/${total}`;
}

/**
 * setupMdReadHighlight を main.ts から呼ぶ。
 * 返り値の cleanup 関数でイベントリスナを解除する。
 */
export function setupMdReadHighlight(app: App, store: ConfigStore): () => void {
  // layout-change: レイアウト変化（タブクローズ等）で state があればクリア
  const layoutChangeRef = app.workspace.on('layout-change', () => {
    if (mdReadState.get()) clearAllForFile(app);
  });

  // overlay の unmount ハンドル（state.filePath 変化時・終了時に使い回す）
  let overlayCleanup: (() => void) | null = null;
  let mountedFilePath: string | null = null;

  const offState = mdReadState.subscribe((s) => {
    // phase='cleared' → overlay を unmount して終了
    if (s.phase === 'cleared') {
      overlayCleanup?.();
      overlayCleanup = null;
      mountedFilePath = null;
      return;
    }

    // filePath 変化時 → overlay を再 mount（古いものは unmount）
    if (s.filePath !== mountedFilePath) {
      overlayCleanup?.();
      overlayCleanup = null;
      const view = findPreviewViewForFile(app, s.filePath);
      if (view) {
        overlayCleanup = mountOverlay(view as never, {
          // v0.33.x: pause/resume は state のみ更新（実 TTS の pause は Edge系で未対応のため将来課題）
          onPause: () => {
            mdReadState.pause();
          },
          onResume: () => {
            mdReadState.resume();
          },
          // A 案: 最後の見出し境界へ（隣接チャンクのみなら no-op）
          onSkip: () => {
            const cur = mdReadState.get();
            if (!cur) return;
            const nextIdx = nextHeadingIndex(cur.chunks, cur.activeIdx);
            if (nextIdx !== cur.activeIdx) mdReadState.setActiveIdx(nextIdx);
          },
          // ミュート: 全 TTS 停止 + state クリア
          onMute: () => {
            stopAllPlayback();
            clearAllForFile(app);
          },
        });
        mountedFilePath = s.filePath;
      }
    }

    // 該当 view が見つかればハイライト + 進捗反映
    const view = findPreviewViewForFile(app, s.filePath);
    if (view) {
      if (s.activeIdx >= 0 && s.chunks[s.activeIdx]) {
        highlightChunkInPreview(view as never, s.chunks[s.activeIdx]);
      }
      updateOverlayProgress(view, s.activeIdx, s.chunks.length);
    }

    // v0.33.3 修正: phase='completed' では overlay を unmount しない
    // UX: 読了後も最終チャンク位置にオーバーレイを残し、進捗が N/N で「完了」を示す
    // 閉じるのは layout-change（タブ切替等）または clear（次の再生開始）のみ
  });

  return () => {
    // Obsidian の EventRef は関数ではない（offref で解除）
    app.workspace.offref(layoutChangeRef);
    offState();
    overlayCleanup?.();
    overlayCleanup = null;
  };
}
