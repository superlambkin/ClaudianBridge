/**
 * v0.31.0 (F-028): MD 読み上げハイライト機能の setup 関数。
 *
 * main.ts から呼ばれ、workspace.on('layout-change') と mdReadState.subscribe を
 * 登録して、ライフサイクルイベントに応じたクリア処理を行う。
 *
 * 注: 当初 design.md では 'file-close' だったが、Obsidian の Workspace.on は
 * 'file-close' を公開していない（API 型に存在しない）。タブクローズも含む
 * 'layout-change' で代替し、state が残っているときだけクリアする安全側実装。
 */
import type { App } from 'obsidian';
import type { ConfigStore } from '../../../core/config-store';
import { mdReadState } from './state';
import { clearAllForFile } from './cleanup';

/**
 * setupMdReadHighlight を main.ts から呼ぶ。
 * 返り値の cleanup 関数でイベントリスナを解除する。
 */
export function setupMdReadHighlight(app: App, store: ConfigStore): () => void {
  // layout-change: レイアウト変化（タブクローズ等）で state があればクリア
  const layoutChangeRef = app.workspace.on('layout-change', () => {
    if (mdReadState.get()) clearAllForFile(app);
  });

  // state 変化購読: 再生完了 (phase='completed') でクリア
  const offState = mdReadState.subscribe((s) => {
    if (s.phase === 'completed') clearAllForFile(app);
  });

  return () => {
    // Obsidian の EventRef は関数ではない（offref で解除）
    app.workspace.offref(layoutChangeRef);
    offState();
  };
}
