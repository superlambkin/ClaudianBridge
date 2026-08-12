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

type EngineKey = 'edge' | 'webspeech' | 'damarcreative';

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

    // 2. エンジン選択（edge / webspeech / damarcreative の 3 択）
    new Setting(containerEl)
      .setName(s.ttsEngine)
      .setDesc(s.ttsEngineDesc)
      .addDropdown((d) => {
        d.addOption('edge', s.ttsEngineEdge);
        d.addOption('webspeech', s.ttsEngineWebspeech);
        d.addOption('damarcreative', s.ttsEngineDamarcreative);
        d.setValue(cfg.tts.engine).onChange((v) => {
          try {
            const latest = store.load();
            const next = { ...latest, tts: { ...latest.tts, engine: v as EngineKey } };
            store.save(next);
            draw(); // 音色 / animeTtsDir セクションを再描画
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    // 3. 言語別音色 + テストボタン（edge / webspeech のみ。damarcreative は音色 UI なし）
    if (cfg.tts.engine === 'edge' || cfg.tts.engine === 'webspeech') {
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
    }

    // 4. damarcreative 選択時のみ: animeTtsDir 入力 + テストボタン
    if (cfg.tts.engine === 'damarcreative') {
      const dirBox = containerEl.createDiv({ cls: 'cb-tts-anime' });
      new Setting(dirBox)
        .setName(s.ttsAnimeTtsDir)
        .setDesc(s.ttsAnimeTtsDirDesc)
        .addText((tx) => tx
          .setPlaceholder('D:\\tools\\anime-tts')
          .setValue(cfg.tts.animeTtsDir ?? '')
          .onChange((v) => {
            try {
              const latest = store.load();
              const next = { ...latest, tts: { ...latest.tts, animeTtsDir: v.trim() } };
              store.save(next);
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          }));

      new Setting(dirBox)
        .setName(s.ttsAnimeTtsTest)
        .setDesc(s.ttsAnimeTtsTestDesc)
        .addButton((b) => b
          .setButtonText('▶')
          .onClick(async () => {
            const latest = store.load();
            await addTextToTTS(app, SAMPLE_TEXT.ja, latest.tts);
          }));
    }

    // 5. 削除注意文（旧 minimax 設定について）
    const noteBox = containerEl.createDiv({ cls: 'setting-item-description' });
    noteBox.createEl('p', {
      text: s.ttsMinimaxRemovalNote,
    });
  };

  draw();
}
