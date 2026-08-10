import { Notice, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

export function renderSelectionTab(containerEl: HTMLElement, store: ConfigStore): void {
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
  };

  draw();
}
