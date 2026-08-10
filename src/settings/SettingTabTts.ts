import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';

const ENGINES: Array<{ key: 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax'; label: string }> = [
  { key: 'edge', label: 'ClaudeTTS (edge-tts → pyttsx3 → system.speech)' },
  { key: 'claudetts', label: 'ClaudeTTS HTTP bridge' },
  { key: 'auto', label: '自動 (ClaudeTTS → Web Speech フォールバック)' },
  { key: 'webspeech', label: 'Web SpeechSynthesis API' },
  { key: 'minimax', label: 'MiniMax クラウド TTS' },
];

export class SettingTabTts extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private store: ConfigStore) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const cfg = this.store.load();

    new Setting(containerEl)
      .setName('🌐 機能 ON/OFF')
      .setDesc('Add to TTS を有効化')
      .addToggle((t) => t.setValue(cfg.tts.enabled).onChange((v) => {
        try {
          this.store.save({ ...cfg, tts: { ...cfg.tts, enabled: v } });
          new Notice('✅ 保存しました');
        } catch (e) {
          new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
          this.display();
        }
      }));

    new Setting(containerEl)
      .setName('🔊 TTS エンジン')
      .setDesc('音声合成エンジンを選択')
      .addDropdown((d) => {
        for (const e of ENGINES) d.addOption(e.key, e.label);
        d.setValue(cfg.tts.engine).onChange((v) => {
          try {
            this.store.save({ ...cfg, tts: { ...cfg.tts, engine: v as typeof cfg.tts.engine } });
          } catch (e) {
            new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
            this.display();
          }
        });
      });

    // MiniMax 詳細設定
    containerEl.createEl('h3', { text: '🎤 MiniMax クラウド TTS' });
    new Setting(containerEl).setName('有効化').addToggle((t) => t.setValue(cfg.tts.minimax.enabled).onChange((v) => {
      try {
        this.store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, enabled: v } } });
      } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); this.display(); }
    }));
    new Setting(containerEl).setName('API Key').addText((t) => t.setValue(cfg.tts.minimax.apiKey).onChange((v) => {
      try { this.store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, apiKey: v } } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
    }));
    new Setting(containerEl).setName('Chinese voice ID').addText((t) => t.setValue(cfg.tts.minimax.voiceIdZh).onChange((v) => {
      try { this.store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdZh: v } } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
    }));
    new Setting(containerEl).setName('Japanese voice ID').addText((t) => t.setValue(cfg.tts.minimax.voiceIdJa).onChange((v) => {
      try { this.store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdJa: v } } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
    }));
    new Setting(containerEl).setName('English voice ID').addText((t) => t.setValue(cfg.tts.minimax.voiceIdEn).onChange((v) => {
      try { this.store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdEn: v } } }); } catch (e) { new Notice(`⚠️ ${(e as Error).message}`); }
    }));
  }
}
