import { App, Plugin, PluginSettingTab } from 'obsidian';
import { getLocaleStrings } from '../core/i18n';

export class SettingTabOffice extends PluginSettingTab {
  private pluginRef: Plugin;

  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
    this.pluginRef = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const lang = (this.pluginRef as unknown as { env?: { language?: string } }).env?.language ?? 'en';
    const strings = getLocaleStrings(lang);
    containerEl.createEl('h2', { text: strings.tabOffice });
    containerEl.createEl('p', { text: strings.comingSoon, cls: 'cb-empty' });
  }
}
