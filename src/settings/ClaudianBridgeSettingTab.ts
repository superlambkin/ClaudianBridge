import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { renderGeneralTab } from './SettingTabGeneral';
import { renderSelectionTab } from './SettingTabSelection';
import { renderTtsTab } from './SettingTabTts';
import { renderOfficeTab } from './SettingTabOffice';
import { renderWhitelistTab } from './SettingTabWhitelist';

interface TabDef {
  id: string;
  labelKey: 'tabGeneral' | 'tabSelection' | 'tabTts' | 'tabOffice' | 'tabWhitelist';
  render: (el: HTMLElement, store: ConfigStore, resetMigration?: () => Promise<void>) => void;
}

const TABS: TabDef[] = [
  { id: 'general', labelKey: 'tabGeneral', render: renderGeneralTab },
  { id: 'selection', labelKey: 'tabSelection', render: renderSelectionTab },
  { id: 'tts', labelKey: 'tabTts', render: renderTtsTab },
  { id: 'office', labelKey: 'tabOffice', render: renderOfficeTab },
  { id: 'whitelist', labelKey: 'tabWhitelist', render: renderWhitelistTab },
];

export class ClaudianBridgeSettingTab extends PluginSettingTab {
  private current = 'general';

  constructor(app: App, plugin: Plugin, private store: ConfigStore, private resetMigration: () => Promise<void>) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = getLocaleStrings(getUILanguage());
    const header = containerEl.createDiv('cb-tabs');
    for (const tab of TABS) {
      const btn = header.createEl('button', {
        text: s[tab.labelKey],
        cls: 'cb-tab-btn' + (tab.id === this.current ? ' is-active' : ''),
      });
      btn.addEventListener('click', () => { this.current = tab.id; this.display(); });
    }
    const content = containerEl.createDiv('cb-tab-content');
    const tab = TABS.find((t) => t.id === this.current)!;
    tab.render(content, this.store, this.resetMigration);
  }
}
