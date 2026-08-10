import type { App, TFolder } from 'obsidian';
import { Notice } from 'obsidian';

type NoticeFn = (message: string, timeout?: number) => void;

export function addTextToClaudian(app: App, text: string, noticeFn: NoticeFn = (m) => new Notice(m)): boolean {
  const view = app.workspace.getActiveViewOfType('claudian' as never) as { editor?: { setValue: (v: string) => void } } | null;
  if (!view || !view.editor) {
    noticeFn('⚠️ Claudian チャットが開いていません');
    return false;
  }
  view.editor.setValue(text);
  noticeFn('✅ Claudian に挿入しました');
  return true;
}

export function addFolderToClaudian(app: App, folder: TFolder, noticeFn: NoticeFn = (m) => new Notice(m)): boolean {
  const ref = `[[${folder.path}]]`;
  const view = app.workspace.getActiveViewOfType('claudian' as never) as { editor?: { setValue: (v: string) => void } } | null;
  if (!view || !view.editor) {
    noticeFn('⚠️ Claudian チャットが開いていません');
    return false;
  }
  view.editor.setValue(ref);
  noticeFn('📁 フォルダ参照を挿入しました');
  return true;
}
