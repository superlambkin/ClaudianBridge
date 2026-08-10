import type { App, TFolder } from 'obsidian';
import { Notice } from 'obsidian';

type NoticeFn = (message: string, timeout?: number) => void;

interface RealClaudianPlugin {
  activateView?: () => Promise<unknown>;
  getView?: () => { appendToActiveInput?: (text: string) => boolean } | null;
}

export async function addTextToClaudian(app: App, text: string, noticeFn: NoticeFn = (m) => new Notice(m)): Promise<boolean> {
  // obsidian の App 型定義に plugins が無いため runtime アクセスはキャストで行う
  const p = (app as unknown as { plugins?: { plugins?: Record<string, RealClaudianPlugin | undefined> } })
    ?.plugins?.plugins?.['realclaudian'];
  if (!p) {
    noticeFn('⚠️ Claudian プラグインが見つかりません');
    return false;
  }
  try {
    if (typeof p.activateView === 'function') await p.activateView();
    const view = typeof p.getView === 'function' ? p.getView() : null;
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
