import type { App, TFolder } from 'obsidian';
import { Notice } from 'obsidian';
import { getClaudianPlugin, resolveClaudianViewApi } from '../../core/claudian-api';

type NoticeFn = (message: string, timeout?: number) => void;

interface ClaudianView {
  appendToActiveInput?: (text: string) => boolean;
}

export async function addTextToClaudian(app: App, text: string, noticeFn: NoticeFn = (m) => new Notice(m)): Promise<boolean> {
  // obsidian の App 型定義に plugins が無いため runtime アクセスはキャストで行う
  const p = getClaudianPlugin(app);
  if (!p) {
    noticeFn('⚠️ Claudian プラグインが見つかりません');
    return false;
  }
  try {
    const api = resolveClaudianViewApi(p);
    if (typeof api.activateView === 'function') await api.activateView();
    const view = (typeof api.getView === 'function' ? api.getView() : null) as ClaudianView | null;
    const ok = !!(view && typeof view.appendToActiveInput === 'function' && view.appendToActiveInput(text));
    if (!ok) noticeFn('⚠️ Claudian チャットが準備できていません');
    return ok;
  } catch {
    noticeFn('⚠️ Claudian への挿入に失敗しました');
    return false;
  }
}

export async function addFolderToClaudian(app: App, folder: TFolder, noticeFn: NoticeFn = (m) => new Notice(m)): Promise<boolean> {
  const folderPath = folder?.path;
  if (!folderPath) return false;
  return addTextToClaudian(app, `@${folderPath} `, noticeFn);
}
