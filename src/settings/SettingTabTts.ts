import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { addTextToTTS, SAMPLE_TEXT } from '../features/tts/core';
import {
  PLACHTA_PRESETS,
  PLACHTA_DEFAULT_SPEAKER,
  PLACHTA_DEFAULT_LANGUAGE,
  PLACHTA_DEFAULT_SPEED,
  PLACHTA_SPEED_MIN,
  PLACHTA_SPEED_MAX,
} from '../features/tts/plachta-tts';
import type { TtsEngine, PlachtaLanguage } from '../core/settings';
import type { TtsCliSettings } from '../core/settings';

const EDGE_VOICE_PRESETS: Record<'zh' | 'ja' | 'en', string[]> = {
  zh: ['xiaoxiao', 'yunxi', 'yunyang', 'yunjian', 'xiaoyi', 'yunxia'],
  ja: ['nanami', 'keita'],
  en: ['aria', 'guy', 'jenny'],
};

// v0.8.0: spawn ベースのローカル VITS を削除し Plachta Cloud に置換。plachta 専用 UI（プリセット・カスタム・言語・速度）を追加。
type EngineKey = TtsEngine;

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

    // 2. エンジン選択（edge / webspeech / plachta の 3 択）
    new Setting(containerEl)
      .setName(s.ttsEngine)
      .setDesc(s.ttsEngineDesc)
      .addDropdown((d) => {
        d.addOption('edge', s.ttsEngineEdge);
        d.addOption('webspeech', s.ttsEngineWebspeech);
        d.addOption('plachta', s.ttsEnginePlachta);
        d.setValue(cfg.tts.engine).onChange((v) => {
          try {
            const latest = store.load();
            const next = { ...latest, tts: { ...latest.tts, engine: v as EngineKey } };
            store.save(next);
            draw(); // 音色セクションを再描画
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    // 3. 言語別音色 + テストボタン（edge / webspeech のみ）
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
            // ★ v0.10.0 UAT fix: 音色変更を保存（onChange が欠落していた表示専用バグ）
            d.onChange(async (v) => {
              try {
                const latest = store.load();
                // この行は edge / webspeech エンジンのみ描画されるため型を絞る
                const engine = latest.tts.engine as 'edge' | 'webspeech';
                store.save({
                  ...latest,
                  tts: {
                    ...latest.tts,
                    voices: {
                      ...latest.tts.voices,
                      [engine]: {
                        ...latest.tts.voices[engine],
                        [langKey]: v,
                      },
                    },
                  },
                });
                new Notice(s.noticeSaved);
                draw();
              } catch (e) {
                new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
                draw();
              }
            });
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

    // 4. plachta 専用 UI（プリセット・カスタム speaker・言語・速度・テストボタン）
    if (cfg.tts.engine === 'plachta') {
      const plachtaBox = containerEl.createDiv({ cls: 'cb-tts-plachta' });
      const currentPlachta = cfg.tts.plachta;

      // 4a. クイックプリセット（9 個）— 選ぶと speaker/language が自動セット
      new Setting(plachtaBox)
        .setName(s.ttsPlachtaPreset)
        .addDropdown((d) => {
          d.addOption('', '—');
          PLACHTA_PRESETS.forEach((preset, i) => {
            d.addOption(String(i), preset.label);
          });
          // 現在の speaker+language と一致するプリセットがあればその index を選択
          let matchedIdx = '';
          if (currentPlachta) {
            const idx = PLACHTA_PRESETS.findIndex(
              (p) => p.speaker === currentPlachta.speaker && p.language === currentPlachta.language,
            );
            if (idx >= 0) matchedIdx = String(idx);
          }
          d.setValue(matchedIdx);
          d.onChange(async (v) => {
            const preset = PLACHTA_PRESETS[Number(v)];
            if (!preset) return;
            try {
              const latest = store.load();
              const prev = latest.tts.plachta;
              store.save({
                ...latest,
                tts: {
                  ...latest.tts,
                  plachta: {
                    speaker: preset.speaker,
                    language: preset.language,
                    speed: prev?.speed ?? PLACHTA_DEFAULT_SPEED,
                  },
                },
              });
              new Notice(s.noticeSaved);
              draw();
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          });
        });

      // 4b. カスタム speaker（自由記述・Plachta API のキャラクター名と完全一致）
      new Setting(plachtaBox)
        .setName(s.ttsPlachtaSpeaker)
        .addText((t) => t
          .setPlaceholder(PLACHTA_DEFAULT_SPEAKER)
          .setValue(currentPlachta?.speaker ?? '')
          .onChange(async (v) => {
            try {
              const latest = store.load();
              const prev = latest.tts.plachta;
              store.save({
                ...latest,
                tts: {
                  ...latest.tts,
                  plachta: {
                    speaker: v.trim() || PLACHTA_DEFAULT_SPEAKER,
                    language: prev?.language ?? PLACHTA_DEFAULT_LANGUAGE,
                    speed: prev?.speed ?? PLACHTA_DEFAULT_SPEED,
                  },
                },
              });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          }),
        );

      // 4c. 言語 dropdown
      new Setting(plachtaBox)
        .setName(s.ttsPlachtaLanguage)
        .addDropdown((d) => {
          const langs: PlachtaLanguage[] = ['日本語', '简体中文', 'English', 'Mix'];
          for (const lg of langs) d.addOption(lg, lg);
          d.setValue(currentPlachta?.language ?? PLACHTA_DEFAULT_LANGUAGE);
          d.onChange(async (v) => {
            try {
              const latest = store.load();
              const prev = latest.tts.plachta;
              store.save({
                ...latest,
                tts: {
                  ...latest.tts,
                  plachta: {
                    speaker: prev?.speaker ?? PLACHTA_DEFAULT_SPEAKER,
                    language: v as PlachtaLanguage,
                    speed: prev?.speed ?? PLACHTA_DEFAULT_SPEED,
                  },
                },
              });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          });
        });

      // 4d. 速度 slider（0.5〜2.0）
      new Setting(plachtaBox)
        .setName(s.ttsPlachtaSpeed)
        .addSlider((sl) => sl
          .setLimits(PLACHTA_SPEED_MIN, PLACHTA_SPEED_MAX, 0.1)
          .setValue(currentPlachta?.speed ?? PLACHTA_DEFAULT_SPEED)
          .setDynamicTooltip()
          .onChange(async (v) => {
            try {
              const latest = store.load();
              const prev = latest.tts.plachta;
              store.save({
                ...latest,
                tts: {
                  ...latest.tts,
                  plachta: {
                    speaker: prev?.speaker ?? PLACHTA_DEFAULT_SPEAKER,
                    language: prev?.language ?? PLACHTA_DEFAULT_LANGUAGE,
                    speed: v,
                  },
                },
              });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          }),
        );

      // 4e. テストボタン
      new Setting(plachtaBox)
        .setName(s.ttsPlachtaTest)
        .addButton((b) => b
          .setButtonText('▶')
          .onClick(async () => {
            const latest = store.load();
            await addTextToTTS(app, SAMPLE_TEXT.ja, latest.tts);
          }),
        );
    }

    // 6. v0.10.0: Claude Code CLI 用設定（voice-config.json と同期）
    {
      const cliBox = containerEl.createDiv({ cls: 'cb-tts-cli' });
      cliBox.createEl('h3', { text: s.ttsCliHeading });

      const saveCli = (patch: Partial<TtsCliSettings>): void => {
        const latest = store.load();
        const base = latest.tts.cli ?? { full_text: false, max_chars: 300, debounce_ms: 2000, speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } };
        store.save({ ...latest, tts: { ...latest.tts, cli: { ...base, ...patch } } });
        draw();
      };

      new Setting(cliBox)
        .setName(s.ttsCliFullText)
        .setDesc(s.ttsCliFullTextDesc)
        .addToggle((t) => t.setValue(cfg.tts.cli?.full_text ?? false).onChange((v) => saveCli({ full_text: v })));

      new Setting(cliBox)
        .setName(s.ttsCliMaxChars)
        .setDesc(s.ttsCliMaxCharsDesc)
        .addText((t) => t
          .setValue(String(cfg.tts.cli?.max_chars ?? 300))
          .onChange((v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n <= 0) return;
            saveCli({ max_chars: n });
          }),
        );

      new Setting(cliBox)
        .setName(s.ttsCliDebounceMs)
        .setDesc(s.ttsCliDebounceMsDesc)
        .addText((t) => t
          .setValue(String(cfg.tts.cli?.debounce_ms ?? 2000))
          .onChange((v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0) return;
            saveCli({ debounce_ms: n });
          }),
        );

      const sf = cfg.tts.cli?.speech_filter ?? { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true };
      cliBox.createEl('h4', { text: s.ttsCliFilterHeading });
      const filterItems: Array<[keyof typeof sf, string]> = [
        ['emoji', s.ttsCliFilterEmoji],
        ['kaomoji', s.ttsCliFilterKaomoji],
        ['ascii_emoticon', s.ttsCliFilterAscii],
        ['emoji_shortcode', s.ttsCliFilterShortcode],
      ];
      for (const [key, label] of filterItems) {
        new Setting(cliBox)
          .setName(`🔇 ${label}`)
          .addToggle((t) => t.setValue(sf[key]).onChange((v) => saveCli({ speech_filter: { ...sf, [key]: v } })));
      }
    }

    // 5. 削除注意文（旧 minimax 設定について）
    const noteBox = containerEl.createDiv({ cls: 'setting-item-description' });
    noteBox.createEl('p', {
      text: s.ttsMinimaxRemovalNote,
    });
  };

  draw();
}
