import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import manifest from '../manifest.json';

/** プラグインバージョン（SSOT: src/manifest.json — バンドル時に esbuild が埋め込む） */
export const PLUGIN_VERSION: string = manifest.version;

export function renderGeneralTab(_app: App, containerEl: HTMLElement, store: ConfigStore, resetMigration?: () => Promise<void>, pluginId?: string): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabGeneral });

    // バージョン情報
    const versionRow = containerEl.createDiv('cb-version-row');
    versionRow.createEl('span', { text: 'Claudian Bridge', cls: 'cb-version-row__name' });
    versionRow.createEl('span', { text: `v${PLUGIN_VERSION}`, cls: 'cb-version-row__version' });

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

    // v0.9.0: Claudian チャットのコードブロックコピー時に ``` フェンスを付与
    new Setting(containerEl)
      .setName(s.generalCodeCopyFence)
      .setDesc(s.generalCodeCopyFenceDesc)
      .addToggle((t) => t.setValue(cfg.general.codeCopyFence).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, codeCopyFence: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.21.0: バックアップ機能（既定 ON）
    new Setting(containerEl)
      .setName(s.generalBackupEnabled)
      .setDesc(s.generalBackupEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.backupEnabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, backupEnabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.21.1: バックアップ完了時にダイアログを自動で閉じる（既定 ON）
    new Setting(containerEl)
      .setName(s.generalBackupAutoClose)
      .setDesc(s.generalBackupAutoCloseDesc)
      .addToggle((t) => t.setValue(cfg.general.backupAutoClose).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, backupAutoClose: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.24.0: クイック返信ボタンの方案ボタンを常に表示 ===
    new Setting(containerEl)
      .setName(s.quickReplyShowAllOptions)
      .setDesc(s.quickReplyShowAllOptionsDesc)
      .addToggle((t) => t.setValue(cfg.general.quickReplyShowAllOptions).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, quickReplyShowAllOptions: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.25.0: クイック返信ボタン全体の ON/OFF ===
    new Setting(containerEl)
      .setName(s.quickReplyEnabled)
      .setDesc(s.quickReplyEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.quickReplyEnabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, quickReplyEnabled: v } });
          new Notice(s.noticeSaved);
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
