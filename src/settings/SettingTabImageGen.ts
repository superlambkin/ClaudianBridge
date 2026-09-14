import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { IMAGE_GEN_STYLES } from '../core/settings';
import type { ImageGenAspectRatio, ImageGenProviderId, ImageGenStyle } from '../core/settings';
import { getStyleLabelKey } from '../features/image-gen/style-prompts';

/**
 * v0.38.0 (F-038): 文生図機能の設定タブ。
 * SettingTabMemory.ts の draw() クロージャ・パターンを踏襲。
 */
export function renderImageGenTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabImageGen });

    new Setting(containerEl)
      .setName(s.imageGenEnabled)
      .setDesc(s.imageGenEnabledDesc)
      .addToggle((t) => t.setValue(cfg.imageGen.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, imageGen: { ...latest.imageGen, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.imageGenProvider)
      .setDesc(s.imageGenProviderDesc)
      .addDropdown((d) => {
        d.addOption('minimax', s.imageGenProviderMinimax);
        d.addOption('zhipu', s.imageGenProviderZhipu);
        d.setValue(cfg.imageGen.provider).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, imageGen: { ...latest.imageGen, provider: v as ImageGenProviderId } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    new Setting(containerEl)
      .setName(s.imageGenAspectRatio)
      .setDesc(s.imageGenAspectRatioDesc)
      .addDropdown((d) => {
        d.addOption('1:1', s.imageGenAspectRatio_1_1);
        d.addOption('16:9', s.imageGenAspectRatio_16_9);
        d.addOption('9:16', s.imageGenAspectRatio_9_16);
        d.addOption('4:3', s.imageGenAspectRatio_4_3);
        d.setValue(cfg.imageGen.aspectRatio).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, imageGen: { ...latest.imageGen, aspectRatio: v as ImageGenAspectRatio } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    new Setting(containerEl)
      .setName(s.imageGenPromptMaxChars)
      .setDesc(s.imageGenPromptMaxCharsDesc)
      .addText((t) => t
        .setPlaceholder('2000')
        .setValue(String(cfg.imageGen.promptMaxChars))
        .onChange((v) => {
          const n = parseInt(v, 10);
          if (!Number.isFinite(n) || n < 100 || n > 8000) return;
          try {
            const latest = store.load();
            store.save({ ...latest, imageGen: { ...latest.imageGen, promptMaxChars: n } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }),
      );

    new Setting(containerEl)
      .setName(s.imageGenAutoInsert)
      .setDesc(s.imageGenAutoInsertDesc)
      .addToggle((t) => t.setValue(cfg.imageGen.autoInsertToActive).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, imageGen: { ...latest.imageGen, autoInsertToActive: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.imageGenStyle)
      .setDesc(s.imageGenStyleDesc)
      .addDropdown((d) => {
        for (const style of IMAGE_GEN_STYLES) {
          d.addOption(style, s[getStyleLabelKey(style) as keyof typeof s] as string);
        }
        d.setValue(cfg.imageGen.style).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, imageGen: { ...latest.imageGen, style: v as ImageGenStyle } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });
  };

  draw();
}
