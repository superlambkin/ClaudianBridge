import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings } from '../core/i18n';

const CONFLICT_OPTIONS = [
  { key: 'overwrite' as const, labelKey: 'officeConflictOverwrite' as const },
  { key: 'skip' as const, labelKey: 'officeConflictSkip' as const },
  { key: 'timestamp' as const, labelKey: 'officeConflictTimestamp' as const },
];

export class SettingTabOffice extends PluginSettingTab {
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

    containerEl.createEl('h2', { text: s.tabOffice });

    new Setting(containerEl)
      .setName(s.officeEnabled)
      .setDesc(s.officeEnabledDesc)
      .addToggle((t) => t.setValue(cfg.office.enabled).onChange((v) => {
        try {
          this.store.save({ ...cfg, office: { ...cfg.office, enabled: v } });
          new Notice('✅ 保存しました');
        } catch (e) {
          new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
          this.display();
        }
      }));

    new Setting(containerEl)
      .setName(s.officePythonPath)
      .setDesc(s.officePythonPathDesc)
      .addText((t) => t.setValue(cfg.office.pythonPath).onChange((v) => {
        try { this.store.save({ ...cfg, office: { ...cfg.office, pythonPath: v } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
      }));

    new Setting(containerEl)
      .setName(s.officeEnabledExtensions)
      .setDesc(s.officeEnabledExtensionsDesc)
      .addText((t) => t.setValue(cfg.office.enabledExtensions.join(',')).onChange((v) => {
        try {
          const list = v.split(',').map((x) => x.trim()).filter(Boolean);
          this.store.save({ ...cfg, office: { ...cfg.office, enabledExtensions: list } });
        } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
      }));

    new Setting(containerEl)
      .setName(s.officeConflictPolicy)
      .setDesc(s.officeConflictPolicyDesc)
      .addDropdown((d) => {
        for (const o of CONFLICT_OPTIONS) d.addOption(o.key, s[o.labelKey]);
        d.setValue(cfg.office.conflictPolicy).onChange((v) => {
          try {
            this.store.save({ ...cfg, office: { ...cfg.office, conflictPolicy: v as typeof cfg.office.conflictPolicy } });
          } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
        });
      });

    new Setting(containerEl)
      .setName(s.officeFrontmatterTemplate)
      .setDesc(s.officeFrontmatterTemplateDesc)
      .addTextArea((t) => t.setValue(cfg.office.frontmatterTemplate).onChange((v) => {
        try { this.store.save({ ...cfg, office: { ...cfg.office, frontmatterTemplate: v } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
      }));

    new Setting(containerEl)
      .setName(s.officeOutputDirOverride)
      .setDesc(s.officeOutputDirOverrideDesc)
      .addText((t) => t.setValue(cfg.office.outputDirOverride).onChange((v) => {
        try { this.store.save({ ...cfg, office: { ...cfg.office, outputDirOverride: v } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
      }));

    new Setting(containerEl)
      .setName(s.officeShowProgressModal)
      .setDesc(s.officeShowProgressModalDesc)
      .addToggle((t) => t.setValue(cfg.office.showProgressModal).onChange((v) => {
        try { this.store.save({ ...cfg, office: { ...cfg.office, showProgressModal: v } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
      }));
  }
}
