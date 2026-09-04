/**
 * v0.33.0 (F-028): MD 読み上げハイライト機能の setup 関数。
 *
 * main.ts から呼ばれ、workspace.on('layout-change') と mdReadState.subscribe を
 * 登録して、ライフサイクルイベントに応じたクリア処理 + DOM 配線
 * （overlay mount / chunk highlight / progress 更新）を行う。
 *
 * 注: 当初 design.md では 'file-close' だったが、Obsidian の Workspace.on は
 * 'file-close' を公開していない（API 型に存在しない）。
 *
 * v0.33.5 修正: layout-change は**ファイルタブが消失した時のみ** clearAllForFile
 * を呼ぶ。フォーカス切替や他タブオープン等の軽微な layout 変化では
 * overlay が消えないようにする（過剰発火抑制）。
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

/** 指定 filePath の MD Preview view を探す。なければ null。 */
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
  // v0.33.5: overlay は document.body 直下にある（previewMode に依存しない）。
  // 進捗 span は querySelector で取得。
  const progressSpan = document.querySelector<HTMLElement>('[data-cb-md-read-progress]');
  if (progressSpan) progressSpan.textContent = `${idx + 1}/${total}`;
}

/**
 * setupMdReadHighlight を main.ts から呼ぶ。
 * 返り値の cleanup 関数でイベントリスナを解除する。
 */
export function setupMdReadHighlight(app: App, store: ConfigStore): () => void {
  // layout-change: ファイルタブ消失時のみクリア（過剰発火抑制・v0.33.5 修正）
  const layoutChangeRef = app.workspace.on('layout-change', () => {
    const s = mdReadState.get();
    if (!s) return;
    const fileStillOpen = app.workspace
      .getLeavesOfType('markdown')
      .some((leaf) => {
        const v = (leaf.view as unknown as PreviewViewLike);
        return v?.file?.path === s.filePath;
      });
    if (!fileStillOpen) {
      // 対象 MD のタブが完全に閉じた → state とハイライトを破棄
      clearAllForFile(app);
    }
    // タブが他所に移動しただけの layout 変化では何もしない（overlay を維持）
  });

  // overlay の unmount ハンドル
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
      // mountOverlay は常に cleanup 関数を返す（実 DOM がないときは no-op 関数）
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

    // ハイライト + 進捗反映
    const view = findPreviewViewForFile(app, s.filePath);
    // v0.34.0: 診断ログ（通知は届いているか・view は取れているかを区別する境界計装）
    console.log('[cb-md-read-highlight] state update idx=', s.activeIdx, 'phase=', s.phase, 'view found=', !!view);
    if (view && s.activeIdx >= 0 && s.chunks[s.activeIdx]) {
      // v0.35.0: スクロール位置設定（%）を反映（store が無いテスト環境では既定 40）
      const pct = store?.load?.()?.tts?.mdReadHighlight?.scrollPositionPct ?? 40;
      const matched = highlightChunkInPreview(view as never, s.chunks[s.activeIdx], pct);
      // v0.32.6: 診断ログ（実機確認用）
      console.log('[cb-md-read-highlight] chunk', s.activeIdx, 'of', s.chunks.length - 1, matched ? 'underline applied' : 'NOT matched');
    }
    // v0.33.5: 進捗更新は overlay の document.body 上 span を直接 query
    // 進捗は overlay 全体の表示なので view に依存しない
    if (overlayCleanup) {
      const progressSpan = document.querySelector<HTMLElement>('[data-cb-md-read-progress]');
      if (progressSpan && s.chunks) {
        progressSpan.textContent = `${s.activeIdx + 1}/${s.chunks.length}`;
      }
    }
  });

  return () => {
    app.workspace.offref(layoutChangeRef);
    offState();
    overlayCleanup?.();
    overlayCleanup = null;
  };
}
