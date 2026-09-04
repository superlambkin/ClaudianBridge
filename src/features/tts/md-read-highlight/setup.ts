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
import { getPlaybackController } from '../playback-controller';
import { abortCurrentLlm } from '../llm-session';

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

  // v0.35.2: 読み上げ中（再生/一時停止/スキップ中を含む）に**別の MD を開いて表示した場合**は
  // 現在の読み上げを中止する（新しい MD の表示を妨げない）
  const fileOpenRef = app.workspace.on('file-open', (file) => {
    const s = mdReadState.get();
    if (!s || !file) return;
    if (file.path !== s.filePath) {
      // v0.37.1 (H1): LLM 原稿生成中も中断（claude 子プロセス kill）
      abortCurrentLlm();
      getPlaybackController().stop();
      stopAllPlayback();
      clearAllForFile(app);
    }
  });

  // overlay の unmount ハンドル
  let overlayCleanup: (() => void) | null = null;
  let mountedFilePath: string | null = null;
  let lastHighlightIdx = -1; // v0.35.2: 同一チャンクの連続 DOM 更新（forced reflow）を抑制

  const offState = mdReadState.subscribe((s) => {
    // phase='cleared' → overlay を unmount して終了
    if (s.phase === 'cleared') {
      overlayCleanup?.();
      overlayCleanup = null;
      mountedFilePath = null;
      lastHighlightIdx = -1;
      return;
    }
    // v0.35.2: 同一チャンクへの複数回発火（state reactive 通知）を抑制
    if (s.activeIdx === lastHighlightIdx) return;

    // filePath 変化時 → overlay を再 mount（古いものは unmount）
    if (s.filePath !== mountedFilePath) {
      overlayCleanup?.();
      overlayCleanup = null;
      // v0.35.2: 新しい MD の読上げ開始前に**スクロールバーを先頭へ戻す**
      // （下線/overlay が DOM に挿入されたあとに実行することで、リセット後の位置が上書きされない）
      const resetView = findPreviewViewForFile(app, s.filePath);
      const scroller = (resetView?.previewMode?.containerEl?.querySelector('.markdown-preview-view, .markdown-reading-view') as HTMLElement | null)
        ?? (resetView?.previewMode?.containerEl as HTMLElement | null);
      if (scroller) {
        // v0.35.2: 一部の jsdom 環境では scrollTo が存在しないため
        // 直接代入と window 経由の両方を試みる
        try { scroller.scrollTop = 0; } catch { /* ignore */ }
        const fn = (scroller as unknown as { scrollTo?: (x?: number, y?: number) => void }).scrollTo;
        if (typeof fn === 'function') {
          try { fn.call(scroller, 0, 0); } catch { /* ignore */ }
        }
      }
      window.scrollTo({ top: 0 });
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
        // ミュート: LLM 生成中断 + 全 TTS 停止 + state クリア
        onMute: () => {
          abortCurrentLlm();
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
      // v0.35.2: 初回ハイライト時（idx=0）は user 設定より**先頭固定**で描画・スクロール
      // （スクロールバー先頭へ戻す → ここから順次%位置へ移る、という意図的な順序）
      const pct = s.activeIdx === 0 ? 0 : (store?.load?.()?.tts?.mdReadHighlight?.scrollPositionPct ?? 40);
      const matched = highlightChunkInPreview(view as never, s.chunks[s.activeIdx], pct, s.chunks[s.activeIdx + 1]);
      // v0.35.2: ハイライト適用後に最終 idx を記録し、次回同一 idx 発火を抑止
      lastHighlightIdx = s.activeIdx;
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
    app.workspace.offref(fileOpenRef);
    offState();
    overlayCleanup?.();
    overlayCleanup = null;
  };
}
