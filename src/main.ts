import { Plugin } from 'obsidian';
import { ConfigStore } from './core/config-store';
import { SettingTabGeneral } from './settings/SettingTabGeneral';
import { SettingTabSelection } from './settings/SettingTabSelection';
import { SettingTabTts } from './settings/SettingTabTts';
import { SettingTabOffice } from './settings/SettingTabOffice';
import { SettingTabWhitelist } from './settings/SettingTabWhitelist';
import { setupSelectionWatcher } from './features/selection/watcher';
import { addTextToTTS } from './features/tts/core';
import { migrateFromLegacy } from './legacy/migration';
import { disableLegacyPluginsOnce } from './legacy/disable-legacy';
import * as path from 'path';

export default class ClaudianBridgePlugin extends Plugin {
  private store!: ConfigStore;

  async onload(): Promise<void> {
    // vault ルート解決（__dirname / process.cwd() は信用しない → app.vault.adapter.getBasePath()）
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    const vaultRoot = adapter.getBasePath ? adapter.getBasePath() : process.cwd();
    const pluginDataDir = path.join(vaultRoot, this.app.vault.configDir, 'plugins', 'claudian-bridge');
    this.store = new ConfigStore(path.join(pluginDataDir, 'data.json'));

    // 1. 旧 data.json → 新形式 自動取り込み（旧プラグインのリネームより先に実施）
    try {
      const pluginsDir = path.join(vaultRoot, this.app.vault.configDir, 'plugins');
      const result = migrateFromLegacy(this.store, pluginsDir);
      if (result.migrated.length > 0) {
        console.warn('[claudian-bridge] migrated:', result.migrated);
      }
    } catch (e) {
      console.warn('[claudian-bridge] migrateFromLegacy error:', e);
    }

    // 2. 旧プラグイン無効化（1度だけ）
    try {
      disableLegacyPluginsOnce(vaultRoot);
    } catch (e) {
      console.warn('[claudian-bridge] disableLegacyPluginsOnce error:', e);
    }

    // 3. 設定タブ登録（5タブ）
    this.addSettingTab(new SettingTabGeneral(this.app, this, this.store, async () => {
      // 移行リセット：フラグをクリアして migration やり直し可能に
      const cfg = this.store.load();
      this.store.save({
        ...cfg,
        general: {
          ...cfg.general,
          migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false },
          migrationResetAvailable: true,
        },
      });
    }));
    this.addSettingTab(new SettingTabSelection(this.app, this, this.store));
    this.addSettingTab(new SettingTabTts(this.app, this, this.store));
    this.addSettingTab(new SettingTabOffice(this.app, this, this.store));
    this.addSettingTab(new SettingTabWhitelist(this.app, this));

    // 4. 機能登録
    const cleanupSelection = setupSelectionWatcher(this.app, this.store, async (text) => {
      const cfg = this.store.load();
      await addTextToTTS(this.app, text, { engine: cfg.tts.engine });
    });
    this.register(cleanupSelection);
    // 外部変更検知（UI 更新は SettingTab の onChange で実施済み）。close は onunload で実施
    this.store.watch(() => {
      /* 外部変更時のフック */
    });

    console.log('[claudian-bridge] loaded');
  }

  onunload(): void {
    this.store.close();
    console.log('[claudian-bridge] unloaded');
  }
}
