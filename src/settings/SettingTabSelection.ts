import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

export function renderSelectionTab(_app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabSelection });

    new Setting(containerEl)
      .setName(s.selectionEnabled)
      .setDesc(s.selectionEnabledDesc)
      .addToggle((t) => t.setValue(cfg.selection.enabled).onChange((v) => {
        try {
          store.save({ ...cfg, selection: { ...cfg.selection, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.selectionFolderEnabled)
      .setDesc(s.selectionFolderEnabledDesc)
      .addToggle((t) => t.setValue(cfg.selection.folderEnabled).onChange((v) => {
        try {
          store.save({ ...cfg, selection: { ...cfg.selection, folderEnabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.selectionDelayMs)
      .setDesc(s.selectionDelayMsDesc)
      .addText((t) => t.setValue(String(cfg.selection.delayMs)).onChange((v) => {
        if (v === '') return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return;
        try {
          store.save({ ...cfg, selection: { ...cfg.selection, delayMs: n } });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // Object context menu
    containerEl.createEl('h3', { text: s.objectMenuHeading });

    new Setting(containerEl)
      .setName(s.objectMenuEnabled)
      .setDesc(s.objectMenuEnabledDesc)
      .addToggle((t) => t.setValue(cfg.selection.objectMenuEnabled).onChange((v) => {
        try {
          store.save({ ...cfg, selection: { ...cfg.selection, objectMenuEnabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    const excludeSetting = new Setting(containerEl)
      .setName(s.objectMenuExcludeHeading)
      .setDesc(s.objectMenuExcludeDesc)
      .addText((text) => {
        text.setPlaceholder(s.objectMenuExcludePlaceholder);
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            void addExcludeSelector((e.target as HTMLInputElement).value);
          }
        });
      })
      .addButton((button) =>
        button.setButtonText(s.objectMenuExcludeButton).onClick(() => {
          const input = excludeSetting.controlEl.querySelector('input');
          if (input) void addExcludeSelector(input.value);
        })
      );

    if (cfg.selection.objectMenuExcludeSelectors.length === 0) {
      containerEl.createEl('p', {
        text: s.objectMenuExcludeEmpty,
        attr: { style: 'color: var(--text-muted); font-style: italic;' },
      });
    } else {
      const tagContainer = containerEl.createDiv('cb-object-exclude-tags');
      cfg.selection.objectMenuExcludeSelectors.forEach((selector) => {
        const tag = tagContainer.createEl('span', { cls: 'cb-object-exclude-tag' });
        tag.createEl('span', { text: selector });
        const removeBtn = tag.createEl('span', { cls: 'cb-object-exclude-tag-remove', text: '✕' });
        removeBtn.addEventListener('click', () => {
          void (async () => {
            try {
              const latest = store.load();
              store.save({
                ...latest,
                selection: {
                  ...latest.selection,
                  objectMenuExcludeSelectors: latest.selection.objectMenuExcludeSelectors.filter((s) => s !== selector),
                },
              });
              draw();
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })();
        });
      });
    }
  };

  const addExcludeSelector = async (raw: string): Promise<void> => {
    const selector = raw.trim();
    if (!selector) return;
    try {
      const latest = store.load();
      if (latest.selection.objectMenuExcludeSelectors.includes(selector)) return;
      store.save({
        ...latest,
        selection: {
          ...latest.selection,
          objectMenuExcludeSelectors: [...latest.selection.objectMenuExcludeSelectors, selector],
        },
      });
      draw();
    } catch (e) {
      new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
      draw();
    }
  };

  draw();
}
