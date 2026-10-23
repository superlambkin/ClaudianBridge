import type { App, TFolder } from 'obsidian';
import { Notice } from 'obsidian';

type NoticeFn = (message: string, timeout?: number) => void;

interface RealClaudianPlugin {
  activateView?: () => Promise<unknown>;
  getView?: () => { appendToActiveInput?: (text: string) => boolean } | null;
  /** v2.3.29 以降: ビュー操作 API（activateView / getView）はここに移された */
  views?: RealClaudianPlugin;
}

/**
 * ビュー操作 API を持つオブジェクトを解決する。
 * Claudian 2.3.29 で plugin 直下から plugin.views へ移動したため両対応する。
 */
export function resolveClaudianViewApi(p: RealClaudianPlugin): RealClaudianPlugin {
  return typeof p.getView === 'function' ? p : (p.views ?? p);
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
    const api = resolveClaudianViewApi(p);
    if (typeof api.activateView === 'function') await api.activateView();
    const view = typeof api.getView === 'function' ? api.getView() : null;
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
