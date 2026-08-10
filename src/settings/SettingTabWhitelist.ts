import { Notice, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { DEFAULT_WHITELIST_SETTINGS } from '../core/settings';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { WHITELIST_PRESETS } from '../features/whitelist/presets';

export function renderWhitelistTab(containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

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
