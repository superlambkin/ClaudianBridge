// src/features/image-gen/menu.ts — Ribbon icon + Command palette wiring.
// v0.38.0 (F-038): ClaudianMenuRegistrar パターン（src/features/chroma/views/ChromaMenuRegistrar.ts:6-20）を踏襲。

import { App, Notice, Plugin } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { getImageGenProvider } from './registry';
import { ImageGenModal } from './modal';

export class ImageGenMenuRegistrar {
  /**
   * Register the Ribbon icon and Command Palette entry.
   * 設定 imageGen.enabled = false の場合は何もしない。
   */
  static register(plugin: Plugin, store: ConfigStore): void {
    const cfg = store.load();
    if (!cfg.imageGen.enabled) return;

    plugin.addRibbonIcon('image', 'Text-to-Image', async () => {
      await ImageGenMenuRegistrar.openModal(plugin, store);
    });

    plugin.addCommand({
      id: 'open-image-gen-modal',
      name: 'Text-to-Image (generate image)',
      callback: async () => {
        await ImageGenMenuRegistrar.openModal(plugin, store);
      },
    });
  }

  /** Open the ImageGenModal. */
  static async openModal(plugin: Plugin, store: ConfigStore): Promise<void> {
    const cfg = store.load();
    const provider = getImageGenProvider(
      cfg.imageGen.provider,
      (id) => {
        if (id === 'minimax') return cfg.quota.minimaxApiKey;
        if (id === 'zhipu') return cfg.quota.zhipuApiKey;
        return undefined;
      },
    );

    if (!provider.isConfigured()) {
      const s = getLocaleStrings(getUILanguage());
      const providerLabel = provider.label;
      new Notice(s.imageGenNoticeNoKey.replace('{provider}', providerLabel));
      return;
    }

    const modal = new ImageGenModal({
      app: plugin.app,
      store,
      provider,
    });
    modal.open();
  }
}
