import { Notice, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

type EngineKey = 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax';
type EngineLabelKey = 'ttsEngineEdge' | 'ttsEngineClaudetts' | 'ttsEngineAuto' | 'ttsEngineWebspeech' | 'ttsEngineMinimax';

const ENGINE_KEYS: Array<{ key: EngineKey; labelKey: EngineLabelKey }> = [
  { key: 'edge', labelKey: 'ttsEngineEdge' },
  { key: 'claudetts', labelKey: 'ttsEngineClaudetts' },
  { key: 'auto', labelKey: 'ttsEngineAuto' },
  { key: 'webspeech', labelKey: 'ttsEngineWebspeech' },
  { key: 'minimax', labelKey: 'ttsEngineMinimax' },
];

export function renderTtsTab(containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    new Setting(containerEl)
      .setName(s.ttsEnabled)
      .setDesc(s.ttsEnabledDesc)
      .addToggle((t) => t.setValue(cfg.tts.enabled).onChange((v) => {
        try {
          store.save({ ...cfg, tts: { ...cfg.tts, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.ttsEngine)
      .setDesc(s.ttsEngineDesc)
      .addDropdown((d) => {
        for (const e of ENGINE_KEYS) d.addOption(e.key, s[e.labelKey]);
        d.setValue(cfg.tts.engine).onChange((v) => {
          try {
            store.save({ ...cfg, tts: { ...cfg.tts, engine: v as typeof cfg.tts.engine } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    // MiniMax 詳細設定
    containerEl.createEl('h3', { text: s.ttsMinimaxHeading });
    new Setting(containerEl).setName(s.ttsMinimaxEnabled).addToggle((t) => t.setValue(cfg.tts.minimax.enabled).onChange((v) => {
      try {
        store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, enabled: v } } });
      } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
    }));
    new Setting(containerEl).setName(s.ttsMinimaxApiKey).addText((t) => t.setValue(cfg.tts.minimax.apiKey).onChange((v) => {
      try { store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, apiKey: v } } }); } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
    }));
    new Setting(containerEl).setName(s.ttsMinimaxVoiceZh).addText((t) => t.setValue(cfg.tts.minimax.voiceIdZh).onChange((v) => {
      try { store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdZh: v } } }); } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
    }));
    new Setting(containerEl).setName(s.ttsMinimaxVoiceJa).addText((t) => t.setValue(cfg.tts.minimax.voiceIdJa).onChange((v) => {
      try { store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdJa: v } } }); } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
    }));
    new Setting(containerEl).setName(s.ttsMinimaxVoiceEn).addText((t) => t.setValue(cfg.tts.minimax.voiceIdEn).onChange((v) => {
      try { store.save({ ...cfg, tts: { ...cfg.tts, minimax: { ...cfg.tts.minimax, voiceIdEn: v } } }); } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
    }));
  };

  draw();
}
