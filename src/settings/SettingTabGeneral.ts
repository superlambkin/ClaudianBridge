import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

export function renderGeneralTab(_app: App, containerEl: HTMLElement, store: ConfigStore, resetMigration?: () => Promise<void>, pluginId?: string): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabGeneral });

    new Setting(containerEl)
      .setName(s.generalEnabled)
      .setDesc(s.generalEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.enabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, enabled: v } });
          new Notice(s.noticeSaved);
          // 即時反映のためプラグインを再読み込み（onload が enabled を尊重する）
          if (pluginId) {
            const plugins = (_app as unknown as { plugins?: { enablePlugin?: (id: string) => Promise<void>; disablePlugin?: (id: string) => Promise<void> } }).plugins;
            if (v) {
              await plugins?.enablePlugin?.(pluginId);
            } else {
              await plugins?.disablePlugin?.(pluginId);
            }
          }
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    containerEl.createEl('h3', { text: s.migratedFrom });
    const ul = containerEl.createEl('ul');
    ul.createEl('li', { text: `claudian-selection-bridge: ${cfg.general.migratedFrom.claudianSelectionBridge ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `vault-office-bridge: ${cfg.general.migratedFrom.vaultOfficeBridge ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `extension-whitelist: ${cfg.general.migratedFrom.extensionWhitelist ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `chroma-inspector: ${cfg.general.migratedFrom.chromaInspector ? s.migrated : s.notMigrated}` });

    if (cfg.general.migrationResetAvailable) {
      new Setting(containerEl)
        .setName(s.resetMigration)
        .setDesc(s.resetMigrationDesc)
        .addButton((b) => b.setButtonText(s.resetMigrationButton).setWarning().onClick(async () => {
          await resetMigration?.();
          new Notice(s.resetMigrationNotice);
          draw();
        }));
    }
  };

  draw();
}
