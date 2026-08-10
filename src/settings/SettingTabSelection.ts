import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings } from '../core/i18n';

export class SettingTabSelection extends PluginSettingTab {
  private pluginRef: Plugin;

  constructor(app: App, plugin: Plugin, private store: ConfigStore) {
    super(app, plugin);
    this.pluginRef = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const lang = (this.pluginRef as unknown as { env?: { language?: string } }).env?.language ?? 'en';
    const s = getLocaleStrings(lang);
    const cfg = this.store.load();

    containerEl.createEl('h2', { text: s.tabSelection });

    new Setting(containerEl)
      .setName(s.selectionEnabled)
      .setDesc(s.selectionEnabledDesc)
      .addToggle((t) => t.setValue(cfg.selection.enabled).onChange((v) => {
        try {
          this.store.save({ ...cfg, selection: { ...cfg.selection, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          this.display();
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
          this.store.save({ ...cfg, selection: { ...cfg.selection, delayMs: n } });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          this.display();
        }
      }));
  }
}
