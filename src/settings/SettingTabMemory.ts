import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type { MemoryScope } from '../core/settings';

export function renderMemoryTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabMemory });

    new Setting(containerEl)
      .setName(s.memoryEnabled)
      .setDesc(s.memoryEnabledDesc)
      .addToggle((t) => t.setValue(cfg.memory.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, memory: { ...latest.memory, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.memoryScope)
      .setDesc(s.memoryScopeDesc)
      .addDropdown((d) => {
        d.addOption('pair', s.memoryScopePair);
        d.addOption('conversation', s.memoryScopeConversation);
        d.setValue(cfg.memory.scope).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, memory: { ...latest.memory, scope: v as MemoryScope } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    new Setting(containerEl)
      .setName(s.memoryFolder)
      .setDesc(s.memoryFolderDesc)
      .addText((t) => t
        .setPlaceholder('Memory/')
        .setValue(cfg.memory.folder)
        .onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, memory: { ...latest.memory, folder: v } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }),
      );
  };

  draw();
}
