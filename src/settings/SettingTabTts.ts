import { Notice, Setting } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { addTextToTTS } from '../features/tts/core';

type EngineKey = 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax';
type EngineLabelKey = 'ttsEngineEdge' | 'ttsEngineClaudetts' | 'ttsEngineAuto' | 'ttsEngineWebspeech' | 'ttsEngineMinimax';

const ENGINE_KEYS: Array<{ key: EngineKey; labelKey: EngineLabelKey }> = [
  { key: 'edge', labelKey: 'ttsEngineEdge' },
  { key: 'claudetts', labelKey: 'ttsEngineClaudetts' },
  { key: 'auto', labelKey: 'ttsEngineAuto' },
  { key: 'webspeech', labelKey: 'ttsEngineWebspeech' },
  { key: 'minimax', labelKey: 'ttsEngineMinimax' },
];

const MINIMAX_VOICE_CATALOG: Record<'zh' | 'ja' | 'en', string[]> = {
  zh: [
    'moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85',
    'Chinese (Mandarin)_Lyrical_Voice',
    'Chinese (Mandarin)_HK_Flight_Attendant',
    'moss_audio_aaa1346a-7ce7-11f0-8e61-2e6e3c7ee85d',
    'Chinese (Mandarin)_Gentle_Storyteller',
    'moss_audio_4cb4dd5c-7ce3-11f0-8c1c-96e35d26fb85',
    'moss_audio_e6e9caa8-7ce3-11f0-95c5-96e35d26fb85',
    'Chinese (Mandarin)_Warm_Bestie',
  ],
  ja: [
    'Japanese_Whisper_Belle',
    'moss_audio_24875c4a-7be4-11f0-9359-4e72c55db738',
    'moss_audio_7f4ee608-78ea-11f0-bb73-1e2a4cfcd245',
    'moss_audio_c1a6a3ac-7be6-11f0-8e8e-36b92fbb4f95',
    'Japanese_News_Anchor',
    'Japanese_Anime_Character',
    'Japanese_Soft_Girl',
    'Japanese_Calm_Senior',
  ],
  en: [
    'English_Graceful_Lady',
    'English_Insightful_Speaker',
    'English_radiant_girl',
    'English_Persuasive_Man',
    'English_Lucky_Robot',
    'English_Professional_Anchor',
    'English_calm_woman',
    'English_energetic_boy',
  ],
};

export function renderTtsTab(containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabTts });

    new Setting(containerEl)
      .setName(s.ttsEnabled)
      .setDesc(s.ttsEnabledDesc)
      .addToggle((t) => t.setValue(cfg.tts.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, tts: { ...latest.tts, enabled: v } });
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
            const latest = store.load();
            store.save({ ...latest, tts: { ...latest.tts, engine: v as typeof cfg.tts.engine } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    // テスト再生ボタン（現在の UI 言語のサンプル文）
    new Setting(containerEl)
      .setName(s.ttsTestButton)
      .setDesc(s.ttsTestSample)
      .addButton((b) => b.setButtonText(s.ttsTestButton).onClick(async () => {
        const latest = store.load();
        await addTextToTTS(undefined as never, s.ttsTestSample, { engine: latest.tts.engine });
      }));

    // MiniMax 詳細設定
    containerEl.createEl('h3', { text: s.ttsMinimaxHeading });
    new Setting(containerEl)
      .setName(s.ttsMinimaxEnabled)
      .setDesc(s.ttsMinimaxEnabledDesc)
      .addToggle((t) => t.setValue(cfg.tts.minimax.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, tts: { ...latest.tts, minimax: { ...latest.tts.minimax, enabled: v } } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); draw(); }
      }));
    new Setting(containerEl)
      .setName(s.ttsMinimaxApiKey)
      .setDesc(s.ttsMinimaxApiKeyDesc)
      .addText((t) => t.setValue(cfg.tts.minimax.apiKey).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, tts: { ...latest.tts, minimax: { ...latest.tts.minimax, apiKey: v } } });
        } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
      }));

    // MiniMax voice — 言語別カタログ 8 件のドロップダウン + 自由入力
    const addMinimaxVoiceSetting = (
      langKey: 'zh' | 'ja' | 'en',
      label: string,
      desc: string,
      field: 'voiceIdZh' | 'voiceIdJa' | 'voiceIdEn',
    ): void => {
      const catalog = MINIMAX_VOICE_CATALOG[langKey];
      const current = cfg.tts.minimax[field];
      new Setting(containerEl)
        .setName(label)
        .setDesc(desc)
        .addDropdown((d) => {
          // 現在の値がカタログにない場合は先頭に挿入（自由入力値の保護）
          if (current && !catalog.includes(current)) d.addOption(current, `🔧 ${current}`);
          for (const v of catalog) d.addOption(v, v);
          d.setValue(current && catalog.includes(current) ? current : (current ?? catalog[0]))
            .onChange((v) => {
              try {
                const latest = store.load();
                store.save({ ...latest, tts: { ...latest.tts, minimax: { ...latest.tts.minimax, [field]: v } } });
              } catch (e) { new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message)); }
            });
        });
    };
    addMinimaxVoiceSetting('zh', s.ttsMinimaxVoiceZh, s.ttsMinimaxVoiceZhDesc, 'voiceIdZh');
    addMinimaxVoiceSetting('ja', s.ttsMinimaxVoiceJa, s.ttsMinimaxVoiceJaDesc, 'voiceIdJa');
    addMinimaxVoiceSetting('en', s.ttsMinimaxVoiceEn, s.ttsMinimaxVoiceEnDesc, 'voiceIdEn');
  };

  draw();
}
