import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

const CONFLICT_OPTIONS = [
  { key: 'overwrite' as const, labelKey: 'officeConflictOverwrite' as const },
  { key: 'skip' as const, labelKey: 'officeConflictSkip' as const },
  { key: 'timestamp' as const, labelKey: 'officeConflictTimestamp' as const },
];

export function renderOfficeTab(_app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabOffice });

    new Setting(containerEl)
      .setName(s.officeEnabled)
      .setDesc(s.officeEnabledDesc)
      .addToggle((t) => t.setValue(cfg.office.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, office: { ...latest.office, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.officePythonPath)
      .setDesc(s.officePythonPathDesc)
      .addText((t) => t.setValue(cfg.office.pythonPath).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, office: { ...latest.office, pythonPath: v } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));

    new Setting(containerEl)
      .setName(s.officeEnabledExtensions)
      .setDesc(s.officeEnabledExtensionsDesc)
      .addText((t) => t.setValue(cfg.office.enabledExtensions.join(',')).onChange((v) => {
        try {
          const latest = store.load();
          const list = v.split(',').map((x) => x.trim()).filter(Boolean);
          store.save({ ...latest, office: { ...latest.office, enabledExtensions: list } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));

    new Setting(containerEl)
      .setName(s.officeConflictPolicy)
      .setDesc(s.officeConflictPolicyDesc)
      .addDropdown((d) => {
        for (const o of CONFLICT_OPTIONS) d.addOption(o.key, s[o.labelKey]);
        d.setValue(cfg.office.conflictPolicy).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, office: { ...latest.office, conflictPolicy: v as typeof cfg.office.conflictPolicy } });
          } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
        });
      });

    new Setting(containerEl)
      .setName(s.officeFrontmatterTemplate)
      .setDesc(s.officeFrontmatterTemplateDesc)
      .addTextArea((t) => t.setValue(cfg.office.frontmatterTemplate).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, office: { ...latest.office, frontmatterTemplate: v } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));

    new Setting(containerEl)
      .setName(s.officeOutputDirOverride)
      .setDesc(s.officeOutputDirOverrideDesc)
      .addText((t) => t.setValue(cfg.office.outputDirOverride).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, office: { ...latest.office, outputDirOverride: v } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));

    new Setting(containerEl)
      .setName(s.officeShowProgressModal)
      .setDesc(s.officeShowProgressModalDesc)
      .addToggle((t) => t.setValue(cfg.office.showProgressModal).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, office: { ...latest.office, showProgressModal: v } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));
  };

  draw();
}
