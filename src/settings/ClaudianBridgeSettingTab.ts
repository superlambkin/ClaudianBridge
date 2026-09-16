import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { getPluginDir } from '../core/plugin-dir';
import { renderGeneralTab } from './SettingTabGeneral';
import { renderNetworkTab } from './SettingTabNetwork';
import { renderSelectionTab } from './SettingTabSelection';
import { renderTtsTab } from './SettingTabTts';
import { renderOfficeTab } from './SettingTabOffice';
import { renderWhitelistTab } from './SettingTabWhitelist';
import { renderBridgeTab } from './SettingTabBridge';
import { renderQuotaTab } from './SettingTabQuota';
import { renderChromaTab } from '../features/chroma/settings/ChromaSettingsTab';
import { renderMemoryTab } from './SettingTabMemory';
import { renderImageGenTab } from './SettingTabImageGen';
import { SettingTabChangelog } from './SettingTabChangelog';
// v0.41.0: 改定履歴タブ（CHANGELOG.md を SSOT として同梱）
import changelogText from '../../CHANGELOG.md';

const renderChangelogTab = (_app: App, el: HTMLElement, _store: ConfigStore): void => {
  new SettingTabChangelog(el, changelogText).render();
};

type RenderFn = (app: App, el: HTMLElement, store: ConfigStore, resetMigration?: () => Promise<void>, pluginId?: string, pluginDir?: string) => void;

interface TabDef {
  id: string;
  labelKey: 'tabGeneral' | 'tabNetwork' | 'tabSelection' | 'tabTts' | 'tabOffice' | 'tabWhitelist' | 'tabBridge' | 'tabQuota' | 'tabChroma' | 'tabMemory' | 'tabImageGen' | 'tabChangelog';
  render: RenderFn;
}

// v0.53.0 (F-052): 設定画面整理 — Bridge タブを本体設定（Vault表示直後）にマージ
export const TABS: TabDef[] = [
  { id: 'general', labelKey: 'tabGeneral', render: renderGeneralTab },
  { id: 'network', labelKey: 'tabNetwork', render: renderNetworkTab },
  { id: 'selection', labelKey: 'tabSelection', render: renderSelectionTab },
  { id: 'tts', labelKey: 'tabTts', render: renderTtsTab },
  { id: 'office', labelKey: 'tabOffice', render: renderOfficeTab },
  { id: 'whitelist', labelKey: 'tabWhitelist', render: renderWhitelistTab },
  // v0.53.0 (F-052): 設定画面整理 — Bridge タブを本体設定（Vault表示直後）にマージ
  { id: 'bridge', labelKey: 'tabBridge', render: renderBridgeTab },
  { id: 'quota', labelKey: 'tabQuota', render: renderQuotaTab },
  { id: 'chroma', labelKey: 'tabChroma', render: renderChromaTab },
  { id: 'memory', labelKey: 'tabMemory', render: renderMemoryTab },
  { id: 'imageGen', labelKey: 'tabImageGen', render: renderImageGenTab },
  { id: 'changelog', labelKey: 'tabChangelog', render: renderChangelogTab },
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
    const plugin = (this as unknown as { plugin?: { manifest?: { id: string; dir?: string } } }).plugin;
    const pluginId = plugin?.manifest?.id;
    const pluginDir = plugin?.manifest ? getPluginDir(this.app, plugin.manifest) : undefined;
    tab.render(this.app, content, this.store, this.resetMigration, pluginId, pluginDir);
  }
}
