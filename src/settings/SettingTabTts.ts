import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { addTextToTTS, SAMPLE_TEXT } from '../features/tts/core';

const EDGE_VOICE_PRESETS: Record<'zh' | 'ja' | 'en', string[]> = {
  zh: ['xiaoxiao', 'yunxi', 'yunyang', 'yunjian', 'xiaoyi', 'yunxia'],
  ja: ['nanami', 'keita'],
  en: ['aria', 'guy', 'jenny'],
};

type EngineKey = 'edge' | 'webspeech';

export function renderTtsTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabTts });

    // 1. TTS 有効化
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

    // 2. エンジン選択（edge / webspeech の 2 択）
    new Setting(containerEl)
      .setName(s.ttsEngine)
      .setDesc(s.ttsEngineDesc)
      .addDropdown((d) => {
        d.addOption('edge', s.ttsEngineEdge);
        d.addOption('webspeech', s.ttsEngineWebspeech);
        d.setValue(cfg.tts.engine).onChange((v) => {
          try {
            const latest = store.load();
            const next = { ...latest, tts: { ...latest.tts, engine: v as EngineKey } };
            store.save(next);
            draw(); // 音色ドロップダウンとテストボタンを再描画
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    // 3. 言語別音色 + テストボタン（選択中エンジンに従属）
    const voiceTable = containerEl.createDiv({ cls: 'cb-tts-voices' });
    voiceTable.createEl('p', { text: s.ttsVoicesHint, cls: 'setting-item-description' });

    const currentEngineVoices = cfg.tts.voices[cfg.tts.engine];
    const renderVoiceRow = (langKey: 'zh' | 'ja' | 'en', label: string): void => {
      const presets = EDGE_VOICE_PRESETS[langKey];
      const current = currentEngineVoices[langKey] || '';
      new Setting(voiceTable)
        .setName(label)
        .addDropdown((d) => {
          // 空文字 = ブラウザ標準
          d.addOption('', `(${s.ttsBrowserDefault ?? 'browser default'})`);
          for (const v of presets) d.addOption(v, v);
          // 現在の値が presets にない場合は先頭に挿入
          if (current && !presets.includes(current)) d.addOption(current, `🔧 ${current}`);
          d.setValue(current && (presets.includes(current) || current === '') ? current : '');
        })
        .addButton((b) => b
          .setButtonText(s.ttsTestButton)
          .onClick(async () => {
            const latest = store.load();
            await addTextToTTS(app, SAMPLE_TEXT[langKey], latest.tts);
          })
        );
    };
    renderVoiceRow('zh', s.ttsVoiceZh);
    renderVoiceRow('ja', s.ttsVoiceJa);
    renderVoiceRow('en', s.ttsVoiceEn);

    // 4. 削除注意文（旧 minimax 設定について）
    const noteBox = containerEl.createDiv({ cls: 'setting-item-description' });
    noteBox.createEl('p', {
      text: s.ttsMinimaxRemovalNote,
    });
  };

  draw();
}
