import { App, PluginSettingTab, Setting } from 'obsidian';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type { ConfigStore } from '../core/config-store';
import type ClaudianBridgePlugin from '../main';
import { FolderBridgeModal, FolderBridgeFormValue } from './FolderBridgeModal';
import { computeDefaultShadowPath } from '../features/folder-bridge/validation';
import type { FolderBridge } from '../features/folder-bridge/types';

// === v0.53.0 (F-052): 設定画面整理 — Bridge タブを本体設定にマージ ===
// renderBridgeTab は ClaudianBridgeSettingTab の TABS から呼び出される関数。
// Plugin インスタンスは app.plugins.plugins['ClaudianBridge'] 経由で解決する。
// DI 用に optional 第7引数 plugin を受け取れる形にしてテスト容易性を確保。

/** v0.53.0 (F-052): Bridge サブタブ描画。ClaudianBridgeSettingTab の TABS から呼ばれる。 */
export function renderBridgeTab(
  app: App,
  containerEl: HTMLElement,
  _store: ConfigStore,
  _resetMigration?: () => Promise<void>,
  _pluginId?: string,
  _pluginDir?: string,
  injectedPlugin?: ClaudianBridgePlugin,
): void {
  const plugin: ClaudianBridgePlugin | undefined = injectedPlugin
    ?? (app as unknown as { plugins: { plugins: Record<string, ClaudianBridgePlugin> } })
      .plugins.plugins['ClaudianBridge'];

  containerEl.empty();

  if (!plugin) {
    containerEl.createEl('p', {
      text: 'ClaudianBridge プラグインインスタンスが取得できませんでした。',
      attr: { style: 'color: var(--text-error);' },
    });
    return;
  }

  const s = getLocaleStrings(getUILanguage());

  // 再描画用クロージャ — toggle / edit / delete / add 後に同じ containerEl を再描画する
  const draw = (): void => {
    containerEl.empty();
    containerEl.createEl('h2', { text: s.folderBridge });

    containerEl.createEl('p', {
      text: 'NAS 等の外部フォルダを Vault のシャドウディレクトリへ同期し、ジャンクションで橋渡しします（Phase 1: NAS → シャドウ 読み取り専用）。',
      attr: { style: 'color: var(--text-muted); font-size: 0.9em;' },
    });

    const bridges = plugin.getSettings().general.folderBridges ?? [];

    if (bridges.length === 0) {
      containerEl.createEl('p', {
        text: 'まだブリッジがありません。「＋ 追加」から登録してください。',
        attr: { style: 'color: var(--text-muted); font-style: italic;' },
      });
    }

    for (const bridge of bridges) {
      renderRow(containerEl, plugin, bridge, s, draw);
    }

    new Setting(containerEl)
      .addButton((b) => b
        .setButtonText(s.folderBridgeAdd)
        .setCta()
        .onClick(() => addBridge(plugin, draw)));
  };

  draw();
}

function renderRow(
  containerEl: HTMLElement,
  plugin: ClaudianBridgePlugin,
  bridge: FolderBridge,
  s: ReturnType<typeof getLocaleStrings>,
  draw: () => void,
): void {
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
      const latest = plugin.getSettings();
      const updated = (latest.general.folderBridges ?? []).map((x) =>
        x.id === bridge.id ? { ...x, enabled: v, updatedAt: Date.now() } : x,
      );
      latest.general.folderBridges = updated;
      await plugin.saveSettings(latest);
      plugin.restartBridges();
      draw();
    }))
    .addButton((b) => b.setButtonText('編集').onClick(() => editBridge(plugin, bridge, draw)))
    .addButton((b) => b.setButtonText('削除').setWarning().onClick(async () => {
      const ok = confirm(
        `🌉 ${bridge.vaultSubpath}/${bridge.linkName} のブリッジを削除しますか？シャドウのファイルは削除されません。`,
      );
      if (!ok) return;
      plugin.disableBridge(bridge.id, bridge);
      const latest = plugin.getSettings();
      latest.general.folderBridges = (latest.general.folderBridges ?? []).filter(
        (x) => x.id !== bridge.id,
      );
      await plugin.saveSettings(latest);
      plugin.restartBridges();
      draw();
    }));
}

function addBridge(plugin: ClaudianBridgePlugin, draw: () => void): void {
  const app = (plugin as unknown as { app: App }).app;
  new FolderBridgeModal(app, {
    onSave: async (value: FolderBridgeFormValue) => {
      await persistNew(plugin, value);
      draw();
    },
  }).open();
}

function editBridge(plugin: ClaudianBridgePlugin, bridge: FolderBridge, draw: () => void): void {
  const app = (plugin as unknown as { app: App }).app;
  new FolderBridgeModal(app, {
    editing: bridge,
    onSave: async (value: FolderBridgeFormValue) => {
      const latest = plugin.getSettings();
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
      await plugin.saveSettings(latest);
      plugin.restartBridges();
      draw();
    },
  }).open();
}

async function persistNew(plugin: ClaudianBridgePlugin, value: FolderBridgeFormValue): Promise<void> {
  const id = value.id ?? `b${Date.now()}`;
  const now = Date.now();
  const app = (plugin as unknown as { app: App }).app;
  const vaultBase = (app.vault.adapter as unknown as { getBasePath?: () => string })
    .getBasePath?.() ?? '';
  const latest = plugin.getSettings();
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
  await plugin.saveSettings(latest);
  plugin.restartBridges();
}

// 後方互換：旧 SettingTabBridge クラスは内部参照ゼロになったが、テストや外部参照が残っている
// 可能性があるため export 維持（addSettingTab からは削除済）。
export class SettingTabBridge extends PluginSettingTab {
  constructor(app: App, private plugin: ClaudianBridgePlugin) {
    super(app, plugin);
  }

  display(): void {
    renderBridgeTab(
      this.app,
      this.containerEl,
      (this.plugin as unknown as { store: ConfigStore }).store,
      undefined,
      undefined,
      undefined,
      this.plugin,
    );
  }
}