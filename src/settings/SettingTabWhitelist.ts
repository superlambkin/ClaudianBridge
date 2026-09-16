import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { DEFAULT_WHITELIST_SETTINGS } from '../core/settings';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { WHITELIST_PRESETS } from '../features/whitelist/presets';
import { OutputsMirrorManager } from '../features/outputs-mirror/manager';
import { FolderMappingManager } from '../features/folder-mapping/manager';
import type { FolderMappingFs } from '../features/folder-mapping/types';
import { FolderMappingModal } from './FolderMappingModal';

function getVaultBasePath(app: App): string {
  const adapter = app.vault.adapter as unknown as { getBasePath?: () => string; basePath?: string };
  return adapter.getBasePath ? adapter.getBasePath() : adapter.basePath ?? '';
}

export function renderWhitelistTab(_app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());
  const mirror = new OutputsMirrorManager({
    vaultBasePath: (_app.vault.adapter as unknown as { getBasePath?: () => string; basePath?: string }).getBasePath
      ? (_app.vault.adapter as unknown as { getBasePath: () => string }).getBasePath()
      : (_app.vault.adapter as unknown as { basePath?: string }).basePath ?? '',
  });

  const draw = (): void => {
    containerEl.empty();

    containerEl.createEl('h2', { text: s.tabWhitelist });
    containerEl.createEl('p', {
      text: s.whitelistExtensionsDesc,
      attr: { style: 'color: var(--text-muted); margin-bottom: 2em;' },
    });

    const cfg = store.load();

    // 有効化
    new Setting(containerEl)
      .setName(s.whitelistEnabled)
      .setDesc(s.whitelistEnabledDesc)
      .addToggle((t) => t.setValue(cfg.whitelist.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, whitelist: { ...latest.whitelist, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // 拡張子追加
    containerEl.createEl('h3', { text: s.whitelistExtensionsHeading });

    const addSetting = new Setting(containerEl)
      .setName(s.whitelistAddExtension)
      .setDesc(s.whitelistAddExtensionDesc)
      .addText((text) => {
        text.setPlaceholder(s.whitelistAddExtensionPlaceholder);
        text.inputEl.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            await addExtension((e.target as HTMLInputElement).value);
          }
        });
      })
      .addButton((button) =>
        button.setButtonText(s.whitelistAddExtensionButton).onClick(async () => {
          const input = addSetting.controlEl.querySelector('input');
          if (input) await addExtension(input.value);
        })
      );

    // タグ
    if (cfg.whitelist.extensions.length === 0) {
      containerEl.createEl('p', {
        text: s.whitelistAllFilesShown,
        attr: { style: 'color: var(--text-muted); font-style: italic;' },
      });
    } else {
      const tagContainer = containerEl.createDiv('cb-whitelist-tags');
      cfg.whitelist.extensions.forEach((ext) => {
        const tag = tagContainer.createEl('span', { cls: 'cb-whitelist-tag' });
        tag.createEl('span', { text: `.${ext}` });
        const removeBtn = tag.createEl('span', { cls: 'cb-whitelist-tag-remove', text: '✕' });
        removeBtn.addEventListener('click', async () => {
          try {
            const latest = store.load();
            store.save({
              ...latest,
              whitelist: {
                ...latest.whitelist,
                extensions: latest.whitelist.extensions.filter((e) => e !== ext),
              },
            });
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });
    }

    // プリセット
    containerEl.createEl('h3', { text: s.whitelistPresetsHeading });
    containerEl.createEl('p', {
      text: s.whitelistPresetsDesc,
      attr: { style: 'color: var(--text-muted); font-size: 0.85em;' },
    });
    const presetGrid = containerEl.createDiv('cb-whitelist-presets');
    WHITELIST_PRESETS.forEach((preset) => {
      const card = presetGrid.createDiv('cb-whitelist-preset-card');
      card.createEl('div', { text: preset.name, attr: { style: 'font-weight: bold;' } });
      card.createEl('div', {
        text: preset.desc,
        attr: { style: 'font-size: 0.8em; color: var(--text-muted);' },
      });
      const btn = card.createEl('button', { text: s.whitelistApplyButton, attr: { style: 'margin-top: 6px; cursor: pointer;' } });
      btn.addEventListener('click', async () => {
        try {
          const latest = store.load();
          const next = preset.extensions[0] === '*'
            ? []
            : Array.from(new Set([...latest.whitelist.extensions, ...preset.extensions])).sort();
          store.save({ ...latest, whitelist: { ...latest.whitelist, extensions: next } });
          draw();
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      });
    });

    // フォルダ常時表示
    containerEl.createEl('h3', { text: s.whitelistOptionsHeading });
    new Setting(containerEl)
      .setName(s.whitelistAlwaysShowFolders)
      .setDesc(s.whitelistAlwaysShowFoldersDesc)
      .addToggle((t) => t.setValue(cfg.whitelist.alwaysShowFolders).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, whitelist: { ...latest.whitelist, alwaysShowFolders: v } });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.22.0: _ で始まるフォルダを非表示（既定 ON）
    new Setting(containerEl)
      .setName(s.whitelistHideUnderscoreFolders)
      .setDesc(s.whitelistHideUnderscoreFoldersDesc)
      .addToggle((t) => t.setValue(cfg.whitelist.hideUnderscoreFolders).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, whitelist: { ...latest.whitelist, hideUnderscoreFolders: v } });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.41.0: . で始まるフォルダを非表示（既定 ON）
    new Setting(containerEl)
      .setName(s.hideDotFolders)
      .setDesc(s.hideDotFoldersDesc)
      .addToggle((t) => t.setValue(cfg.general.hideDotFolders).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, hideDotFolders: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.50.0 (F-049): フォルダマッピング
    containerEl.createEl('h3', { text: s.folderMappingHeading });
    containerEl.createEl('p', {
      text: s.folderMappingDesc,
      attr: { style: 'color: var(--text-muted); font-size: 0.9em;' },
    });

    const fmList = cfg.general.folderMappings ?? [];
    if (fmList.length === 0) {
      containerEl.createEl('p', {
        text: s.folderMappingEmpty,
        attr: { style: 'color: var(--text-muted); font-style: italic;' },
      });
    } else {
      for (const m of fmList) {
        const row = containerEl.createDiv('cb-folder-mapping-row');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr 2fr auto auto auto auto';
        row.style.gap = '6px';
        row.style.alignItems = 'center';
        row.createEl('span', { text: `🔗 ${m.vaultSubpath}/${m.linkName}` });
        row.createEl('span', { text: m.externalPath, attr: { style: 'font-family: monospace; font-size: 0.85em;' } });
        // Toggle
        new Setting(row).addToggle((t) =>
          t.setValue(m.enabled).onChange(async (v) => {
            const latest = store.load();
            const updated = latest.general.folderMappings.map((x) =>
              x.id === m.id ? { ...x, enabled: v, updatedAt: Date.now() } : x,
            );
            store.save({ ...latest, general: { ...latest.general, folderMappings: updated } });
            const fm = new FolderMappingManager({
              vaultBasePath: getVaultBasePath(_app),
              fs: require('fs') as FolderMappingFs,
              notice: (msg: string) => new Notice(msg),
            });
            fm.apply({ ...m, enabled: v });
            draw();
          }),
        );
        // Open
        const openBtn = row.createEl('button', { text: '📂' });
        openBtn.title = 'open external';
        openBtn.addEventListener('click', async () => {
          const electron = require('electron');
          await electron.shell.openPath(m.externalPath);
        });
        // Remove
        const removeBtn = row.createEl('button', { text: '✕', attr: { style: 'color: var(--text-error);' } });
        removeBtn.title = 'remove';
        removeBtn.addEventListener('click', () => {
          const ok = confirm(s.folderMappingRemoveConfirm
            .replace('{vaultSubpath}', m.vaultSubpath)
            .replace('{linkName}', m.linkName)
            .replace('{externalPath}', m.externalPath));
          if (!ok) return;
          const fm = new FolderMappingManager({
            vaultBasePath: getVaultBasePath(_app),
            fs: require('fs') as FolderMappingFs,
            notice: (msg: string) => new Notice(msg),
          });
          fm.apply({ ...m, enabled: false });
          const latest = store.load();
          store.save({
            ...latest,
            general: {
              ...latest.general,
              folderMappings: latest.general.folderMappings.filter((x) => x.id !== m.id),
            },
          });
          draw();
        });
      }
    }

    // Add button (placeholder for Task 9)
    const addBtn = new Setting(containerEl)
      .setName(s.folderMappingAdd)
      .addButton((b) => b.setButtonText(s.folderMappingAdd).onClick(() => {
        new FolderMappingModal(_app, store, draw).open();
      }));

    // v0.41.0: Outputs フォルダミラリング
    containerEl.createEl('h3', { text: s.outputsMirrorHeading });
    const vaultOutputsReal = mirror.vaultOutputsIsRealFolder();

    const mirrorToggle = new Setting(containerEl)
      .setName(s.outputsMirrorEnabled)
      .setDesc(vaultOutputsReal ? s.outputsMirrorVaultExists : s.outputsMirrorEnabledDesc)
      .addToggle((t) => {
        if (vaultOutputsReal) t.setDisabled(true);
        t.setValue(cfg.general.outputsMirrorEnabled).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, general: { ...latest.general, outputsMirrorEnabled: v } });
            const state = mirror.apply(v, latest.general.outputsMirrorPath);
            if (state === 'error') new Notice(s.noticeSaveFailed.replace('{msg}', 'outputs mirror'));
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });
    if (vaultOutputsReal) mirrorToggle.setClass('cb-outputs-mirror-disabled');

    // ミラー元パス + 開くボタン
    const mirrorPathSetting = new Setting(containerEl)
      .setName(s.outputsMirrorPath)
      .setDesc(s.outputsMirrorPathDesc)
      .addText((text) => {
        text.setPlaceholder('Documents/ObsidainOutputs');
        text.setValue(cfg.general.outputsMirrorPath);
        text.inputEl.addEventListener('change', () => {
          try {
            const latest = store.load();
            store.save({ ...latest, general: { ...latest.general, outputsMirrorPath: text.getValue() } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          }
        });
      })
      .addButton((b) => b.setButtonText(s.outputsMirrorOpen).onClick(async () => {
        const latest = store.load();
        await mirror.openExternal(latest.general.outputsMirrorPath);
      }));
    if (vaultOutputsReal) mirrorPathSetting.setClass('cb-outputs-mirror-disabled');

    // 状態表示
    const st = mirror.status();
    containerEl.createEl('p', {
      text: st.linked && st.target
        ? s.outputsMirrorStateLinked.replace('{target}', st.target)
        : s.outputsMirrorStateNone,
      attr: { style: 'color: var(--text-muted); font-size: 0.85em;' },
    });

    // リセット
    containerEl.createEl('hr');
    new Setting(containerEl)
      .setName(s.whitelistReset)
      .setDesc(s.whitelistResetDesc)
      .addButton((b) => b.setButtonText(s.whitelistResetButton).setWarning().onClick(() => {
        try {
          const latest = store.load();
          store.save({ ...latest, whitelist: { ...DEFAULT_WHITELIST_SETTINGS } });
          draw();
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));
  };

  const addExtension = async (raw: string): Promise<void> => {
    const ext = raw.trim().toLowerCase().replace(/^\./, '');
    if (!ext) return;
    try {
      const latest = store.load();
      if (latest.whitelist.extensions.includes(ext)) return;
      store.save({
        ...latest,
        whitelist: { ...latest.whitelist, extensions: [...latest.whitelist.extensions, ext] },
      });
      draw();
    } catch (e) {
      new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
      draw();
    }
  };

  draw();
}
