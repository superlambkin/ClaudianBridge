import { App, PluginSettingTab, Setting } from 'obsidian';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type ClaudianBridgePlugin from '../main';
import { FolderBridgeModal, FolderBridgeFormValue } from './FolderBridgeModal';
import { computeDefaultShadowPath } from '../features/folder-bridge/validation';
import type { FolderBridge } from '../features/folder-bridge/types';

export class SettingTabBridge extends PluginSettingTab {
  constructor(app: App, private plugin: ClaudianBridgePlugin) {
    super(app, plugin);
  }

  display(): void {
    const s = getLocaleStrings(getUILanguage());
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: s.folderBridge });

    containerEl.createEl('p', {
      text: 'NAS 等の外部フォルダを Vault のシャドウディレクトリへ同期し、ジャンクションで橋渡しします（Phase 1: NAS → シャドウ 読み取り専用）。',
      attr: { style: 'color: var(--text-muted); font-size: 0.9em;' },
    });

    const bridges = this.plugin.getSettings().general.folderBridges ?? [];

    if (bridges.length === 0) {
      containerEl.createEl('p', {
        text: 'まだブリッジがありません。「＋ 追加」から登録してください。',
        attr: { style: 'color: var(--text-muted); font-style: italic;' },
      });
    }

    for (const bridge of bridges) {
      this.renderRow(bridge, s);
    }

    new Setting(containerEl)
      .addButton((b) => b
        .setButtonText(s.folderBridgeAdd)
        .setCta()
        .onClick(() => this.addBridge(s)));
  }

  private renderRow(bridge: FolderBridge, s: ReturnType<typeof getLocaleStrings>): void {
    const { containerEl } = this;
    const row = containerEl.createDiv('cb-folder-bridge-row');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 2fr auto auto auto auto';
    row.style.gap = '6px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '6px';
    row.createEl('span', { text: `🌉 ${bridge.vaultSubpath}/${bridge.linkName}` });
    row.createEl('span', {
      text: bridge.externalPath,
      attr: { style: 'font-family: monospace; font-size: 0.85em;' },
    });

    new Setting(row)
      .addToggle((t) => t.setValue(bridge.enabled).onChange(async (v) => {
        const latest = this.plugin.getSettings();
        const updated = (latest.general.folderBridges ?? []).map((x) =>
          x.id === bridge.id ? { ...x, enabled: v, updatedAt: Date.now() } : x,
        );
        latest.general.folderBridges = updated;
        await this.plugin.saveSettings(latest);
        this.plugin.restartBridges();
        this.display();
      }))
      .addButton((b) => b.setButtonText('編集').onClick(() => this.editBridge(bridge, s)))
      .addButton((b) => b.setButtonText('削除').setWarning().onClick(async () => {
        const ok = confirm(
          `🌉 ${bridge.vaultSubpath}/${bridge.linkName} のブリッジを削除しますか？シャドウのファイルは削除されません。`,
        );
        if (!ok) return;
        this.plugin.disableBridge(bridge.id);
        const latest = this.plugin.getSettings();
        latest.general.folderBridges = (latest.general.folderBridges ?? []).filter(
          (x) => x.id !== bridge.id,
        );
        await this.plugin.saveSettings(latest);
        this.plugin.restartBridges();
        this.display();
      }));
  }

  private addBridge(s: ReturnType<typeof getLocaleStrings>): void {
    new FolderBridgeModal(this.app, {
      onSave: async (value: FolderBridgeFormValue) => {
        await this.persistNew(value);
        this.display();
      },
    }).open();
  }

  private editBridge(bridge: FolderBridge, s: ReturnType<typeof getLocaleStrings>): void {
    new FolderBridgeModal(this.app, {
      editing: bridge,
      onSave: async (value: FolderBridgeFormValue) => {
        const latest = this.plugin.getSettings();
        latest.general.folderBridges = (latest.general.folderBridges ?? []).map((b) =>
          b.id === bridge.id
            ? {
                ...b,
                linkName: value.linkName,
                vaultSubpath: value.vaultSubpath,
                externalPath: value.externalPath,
                excludePatterns: value.excludePatterns,
                enabled: value.enabled,
                updatedAt: Date.now(),
              }
            : b,
        );
        await this.plugin.saveSettings(latest);
        this.plugin.restartBridges();
        this.display();
      },
    }).open();
  }

  private async persistNew(value: FolderBridgeFormValue): Promise<void> {
    const id = value.id ?? `b${Date.now()}`;
    const now = Date.now();
    const vaultBase = (this.plugin.app.vault.adapter as unknown as { getBasePath?: () => string })
      .getBasePath?.() ?? '';
    const latest = this.plugin.getSettings();
    const newBridge: FolderBridge = {
      id,
      linkName: value.linkName,
      vaultSubpath: value.vaultSubpath,
      externalPath: value.externalPath,
      shadowPath: computeDefaultShadowPath(vaultBase, id),
      excludePatterns: value.excludePatterns,
      syncDirection: 'nas_to_shadow',
      enabled: value.enabled,
      createdAt: now,
      updatedAt: now,
    };
    latest.general.folderBridges = [...(latest.general.folderBridges ?? []), newBridge];
    await this.plugin.saveSettings(latest);
    this.plugin.restartBridges();
  }
}