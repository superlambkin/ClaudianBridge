import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';

export class SettingTabSelection extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private store: ConfigStore) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const cfg = this.store.load();

    new Setting(containerEl)
      .setName('🌐 機能 ON/OFF')
      .setDesc('選択テキストを Claudian 入力に挿入する機能を有効化')
      .addToggle((t) => t.setValue(cfg.selection.enabled).onChange((v) => {
        try {
          this.store.save({ ...cfg, selection: { ...cfg.selection, enabled: v } });
          new Notice('✅ 保存しました');
        } catch (e) {
          new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
          this.display();
        }
      }));

    new Setting(containerEl)
      .setName('⏱️ ポップアップ遅延 (ms)')
      .setDesc('選択後フローティングボタンが表示されるまでの遅延')
      .addText((t) => t.setValue(String(cfg.selection.delayMs)).onChange((v) => {
        if (v === '') return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return;
        try {
          this.store.save({ ...cfg, selection: { ...cfg.selection, delayMs: n } });
        } catch (e) {
          new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
          this.display();
        }
      }));
  }
}
