import { App, Menu, MenuItem, TFile, TFolder } from 'obsidian';
import type { ClaudianBridgeSettings } from '../../core/settings';
import { runBackup } from './backup-runner';

type PluginHost = { registerEvent(e: unknown): void };
type BackupTarget = TFile | TFolder;

/**
 * ファイル/フォルダ右クリックメニューに「💾 バックアップ」を追加する。
 * 設定 `general.backupEnabled=false` のとき非表示。
 */
export class BackupMenuRegistrar {
  static register(
    plugin: PluginHost,
    app: App,
    settingsRef: () => ClaudianBridgeSettings,
    pluginDir?: string,
  ): void {
    const handler = (menu: Menu, file: unknown): void => {
      if (!settingsRef().general.backupEnabled) return;
      if (!(file instanceof TFile) && !(file instanceof TFolder)) return;

      const target = file as BackupTarget;
      menu.addItem((item: MenuItem) =>
        item.setTitle('💾 バックアップ').setIcon('save').onClick(() => {
          void runBackup(app, target, pluginDir);
        })
      );
    };

    plugin.registerEvent(
      (app.workspace as unknown as {
        on: (event: string, cb: (...a: unknown[]) => void) => unknown;
      }).on('file-menu', handler as unknown as (...a: unknown[]) => void)
    );
  }
}
