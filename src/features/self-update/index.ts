export * from './types';
export * from './update-checker';
export * from './backup-manager';
export * from './update-downloader';
export * from './reloader';

/**
 * 更新フロー全体: チェック -> バックアップ -> DL -> リロード（D6-D8）。
 * UI からはこの関数だけを呼ぶ。
 */
import { Notice } from 'obsidian';
import type { App, DataAdapter } from 'obsidian';
import { checkForUpdate } from './update-checker';
import { backupPluginFiles } from './backup-manager';
import { downloadAssets } from './update-downloader';
import { reloadPlugin } from './reloader';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';

export async function runSelfUpdate(
  app: App,
  pluginId: string,
  localVersion: string,
  pluginDir: string,
  adapter: DataAdapter,
  notice: (msg: string) => void = (m) => new Notice(m),
): Promise<void> {
  const s = getLocaleStrings(getUILanguage());
  const fail = (template: string, e: unknown): void => {
    notice(template.replace('{msg}', (e as Error).message));
  };
  try {
    notice(s.updateChecking);
    const result = await checkForUpdate(localVersion);
    if (!result.updateAvailable) {
      notice(s.updateUpToDate);
      return;
    }
    let backupPath: string;
    try {
      backupPath = await backupPluginFiles(pluginDir, adapter);
    } catch (e) {
      return fail(s.updateBackupFailed, e);
    }
    try {
      await downloadAssets(result.assets, pluginDir, adapter);
    } catch (e) {
      fail(s.updateDownloadFailed.replace('{msg}', `${backupPath} から復元可 — {msg}`).replace('{msg}', (e as Error).message), e);
      return;
    }
    try {
      await reloadPlugin(app, pluginId);
      notice(s.updateSuccess.replace('{version}', result.tagName));
    } catch (e) {
      return fail(s.updateReloadFailed, e);
    }
  } catch (e) {
    return fail(s.updateCheckFailed, e);
  }
}
