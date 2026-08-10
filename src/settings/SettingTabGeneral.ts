import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import type { ClaudianBridgeSettings } from '../core/settings';
import { getLocaleStrings } from '../core/i18n';

export class SettingTabGeneral extends PluginSettingTab {
  private pluginRef: Plugin;

  constructor(app: App, plugin: Plugin, private store: ConfigStore, private resetMigration: () => Promise<void>) {
    super(app, plugin);
    this.pluginRef = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const lang = (this.pluginRef as unknown as { env?: { language?: string } }).env?.language ?? 'en';
    const strings = getLocaleStrings(lang);
    const cfg = this.store.load();

    containerEl.createEl('h2', { text: strings.tabGeneral });

    new Setting(containerEl)
      .setName('🌐 プラグイン有効化')
      .setDesc('Claudian Bridge 全体を ON/OFF')
      .addToggle((t) => t.setValue(cfg.general.enabled).onChange((v) => {
        try {
          this.store.save({ ...cfg, general: { ...cfg.general, enabled: v } });
          new Notice('✅ 保存しました');
        } catch (e) {
          new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
          this.display();
        }
      }));

    containerEl.createEl('h3', { text: strings.migratedFrom });
    const ul = containerEl.createEl('ul');
    ul.createEl('li', { text: `claudian-selection-bridge: ${cfg.general.migratedFrom.claudianSelectionBridge ? strings.migrated : strings.notMigrated}` });
    ul.createEl('li', { text: `vault-office-bridge: ${cfg.general.migratedFrom.vaultOfficeBridge ? strings.migrated : strings.notMigrated}` });
    ul.createEl('li', { text: `extension-whitelist: ${cfg.general.migratedFrom.extensionWhitelist ? strings.migrated : strings.notMigrated}` });

    if (cfg.general.migrationResetAvailable) {
      new Setting(containerEl)
        .setName(strings.resetMigration)
        .setDesc(strings.resetMigrationDesc)
        .addButton((b) => b.setButtonText(strings.resetMigrationButton).setWarning().onClick(async () => {
          await this.resetMigration();
          new Notice(strings.resetMigrationNotice);
          this.display();
        }));
    }
  }
}
