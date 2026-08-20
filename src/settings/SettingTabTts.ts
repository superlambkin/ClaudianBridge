import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import * as path from 'path';
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
import type { TtsCliSettings, TtsAutoReadSettings } from '../core/settings';
import { withFullTextState, DEFAULT_SPEECH_FILTER_OPTIONS } from '../core/settings';
import { CHUNK_MAX_CHARS_MIN, CHUNK_MAX_CHARS_MAX, DEFAULT_CHUNK_MAX_CHARS, EDGE_CHUNK_MAX_CHARS_MIN, EDGE_CHUNK_MAX_CHARS_MAX, DEFAULT_EDGE_CHUNK_MAX_CHARS } from '../core/settings';
import type { TtsChunkMaxChars } from '../core/settings';
import type { TtsSpeechFilterSection, SpeechFilterOptions } from '../core/settings';

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

    // 2. エンジン選択（edge / webspeech / plachta / edge-local の 4 択）
    new Setting(containerEl)
      .setName(s.ttsEngine)
      .setDesc(s.ttsEngineDesc)
      .addDropdown((d) => {
        d.addOption('edge', s.ttsEngineEdge);
        d.addOption('webspeech', s.ttsEngineWebspeech);
        d.addOption('plachta', s.ttsEnginePlachta);
        d.addOption('edge-local', s.ttsEngineEdgeLocal);
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

    // 2.5 v0.20.0: ローカル EdgeTTS のモジュール場所（edge-local 選択時のみ表示）
    if (cfg.tts.engine === 'edge-local') {
      const folderSetting = new Setting(containerEl)
        .setName(s.ttsEdgeTtsModulePath)
        .setDesc(s.ttsEdgeTtsModulePathDesc)
        .addText((t) => t
          .setPlaceholder(s.ttsEdgeTtsModulePathPlaceholder)
          .setValue(cfg.tts.edgeTtsModulePath ?? '')
          .onChange(async (v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, tts: { ...latest.tts, edgeTtsModulePath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          }),
        );
      // v0.27.0: 📂 ボタンで electron shell.openPath を呼び OS のファイルマネージャを開く
      folderSetting.addButton((b) => b
        .setButtonText('📂')
        .setTooltip(s.ttsOpenFolderTooltip ?? 'モジュール場所をエクスプローラで開く')
        .onClick(async () => {
          const configured = (cfg.tts.edgeTtsModulePath ?? '').trim();
          let displayPath = configured;
          if (!displayPath) {
            const pluginDir = (app as unknown as { vault?: { adapter?: { basePath?: string } } }).vault?.adapter?.basePath ?? '';
            displayPath = path.join(pluginDir, 'py', 'edge_tts');
          }
          const exists = await app.vault.adapter.exists(displayPath);
          if (!exists) {
            new Notice(s.ttsEdgeModuleNotFound?.replace('{path}', displayPath) ?? `⚠️ モジュールが見つかりません: ${displayPath}`);
            return;
          }
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { shell } = require('electron') as { shell: { openPath: (p: string) => Promise<string> } };
            await shell.openPath(displayPath);
          } catch (e) {
            new Notice(`⚠️ フォルダを開けません: ${(e as Error).message}`);
          }
        }),
      );
    }

    // 3. 言語別音色 + テストボタン（edge / webspeech / edge-local のみ）
    if (cfg.tts.engine === 'edge' || cfg.tts.engine === 'webspeech' || cfg.tts.engine === 'edge-local') {
      const voiceTable = containerEl.createDiv({ cls: 'cb-tts-voices' });
      voiceTable.createEl('p', { text: s.ttsVoicesHint, cls: 'setting-item-description' });

      const voiceEngine = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
      const currentEngineVoices = cfg.tts.voices[voiceEngine];
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
                const engine = (latest.tts.engine === 'edge-local' ? 'edge' : latest.tts.engine) as 'edge' | 'webspeech';
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

    // 5.5 v0.16.0: AI読み上げボタン（✨ 入力文を整形して読み上げ）
    new Setting(containerEl)
      .setName(s.ttsInputAiEnabled)
      .setDesc(s.ttsInputAiEnabledDesc)
      .addToggle((t) => t
        .setValue(cfg.tts.inputAi?.enabled ?? true)
        .onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, tts: { ...latest.tts, inputAi: { enabled: v } } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          }
        }),
      );

    // 5.6 v0.18.0: チャンク上限（エンジン別）
    {
      const chunkRows: Array<{ key: keyof TtsChunkMaxChars; label: string; desc: string; min: number; max: number; def: number; step: number }> = [
        { key: 'edge', label: s.ttsChunkMaxCharsEdge, desc: s.ttsChunkMaxCharsEdgeDesc, min: EDGE_CHUNK_MAX_CHARS_MIN, max: EDGE_CHUNK_MAX_CHARS_MAX, def: DEFAULT_EDGE_CHUNK_MAX_CHARS, step: 50 },
        { key: 'webspeech', label: s.ttsChunkMaxCharsWebspeech, desc: s.ttsChunkMaxCharsWebspeechDesc, min: CHUNK_MAX_CHARS_MIN, max: CHUNK_MAX_CHARS_MAX, def: DEFAULT_CHUNK_MAX_CHARS, step: 5 },
        { key: 'plachta', label: s.ttsChunkMaxCharsPlachta, desc: s.ttsChunkMaxCharsPlachtaDesc, min: CHUNK_MAX_CHARS_MIN, max: CHUNK_MAX_CHARS_MAX, def: DEFAULT_CHUNK_MAX_CHARS, step: 5 },
      ];
      for (const row of chunkRows) {
        new Setting(containerEl)
          .setName(row.label)
          .setDesc(row.desc)
          .addSlider((sl) => sl
            .setLimits(row.min, row.max, row.step)
            .setValue(cfg.tts.chunkMaxChars?.[row.key] ?? row.def)
            .setDynamicTooltip()
            .onChange(async (v) => {
              try {
                const latest = store.load();
                store.save({ ...latest, tts: { ...latest.tts, chunkMaxChars: { ...latest.tts.chunkMaxChars, [row.key]: v } } });
              } catch (e) {
                new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              }
            }),
          );
      }
    }

    // 5.7 v0.17.0: 読み上げ内容フィルタ（タイプ別・チェック=読む）
    {
      containerEl.createEl('h3', { text: s.ttsSpeechFilterHeading });
      containerEl.createEl('p', { text: s.ttsSpeechFilterHint, cls: 'cb-setting-hint' });
      const FILTER_ROWS: Array<{ key: keyof SpeechFilterOptions; label: string }> = [
        { key: 'emoji', label: s.ttsSpeechFilterEmoji },
        { key: 'kaomoji', label: s.ttsSpeechFilterKaomoji },
        { key: 'ascii_emoticon', label: s.ttsSpeechFilterAscii },
        { key: 'emoji_shortcode', label: s.ttsSpeechFilterShortcode },
        { key: 'callout', label: s.ttsSpeechFilterCallout },
        { key: 'table', label: s.ttsSpeechFilterTable },
        { key: 'code', label: s.ttsSpeechFilterCode },
        { key: 'thinking', label: s.ttsSpeechFilterThinking },
        { key: 'toolCommands', label: s.ttsSpeechFilterToolCommands },
      ];
      const TYPES: Array<{ key: TtsSpeechFilterSection; label: string }> = [
        { key: 'selection', label: s.ttsSpeechFilterTypeSelection },
        { key: 'autoRead', label: s.ttsSpeechFilterTypeAutoRead },
        { key: 'message', label: s.ttsSpeechFilterTypeMessage },
        { key: 'inputAi', label: s.ttsSpeechFilterTypeInputAi },
      ];
      const table = containerEl.createEl('table', { cls: 'cb-speech-filter-table' });
      const thead = table.createEl('thead');
      const headRow = thead.createEl('tr');
      headRow.createEl('th', { text: s.ttsSpeechFilterItemHeader });
      for (const t of TYPES) headRow.createEl('th', { text: t.label });
      const tbody = table.createEl('tbody');
      for (const row of FILTER_ROWS) {
        const tr = tbody.createEl('tr');
        tr.createEl('td', { text: row.label });
        for (const t of TYPES) {
          const td = tr.createEl('td');
          const cur = cfg.tts.speechFilter?.[t.key]?.[row.key] ?? false;
          new Setting(td).setClass('cb-speech-filter-cell').addToggle((tg) => {
            tg.setValue(cur).onChange(async (v) => {
              try {
                const latest = store.load();
                const sec = latest.tts.speechFilter?.[t.key] ?? { ...DEFAULT_SPEECH_FILTER_OPTIONS };
                store.save({
                  ...latest,
                  tts: { ...latest.tts, speechFilter: { ...latest.tts.speechFilter, [t.key]: { ...sec, [row.key]: v } } },
                });
              } catch (e) {
                new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              }
            });
          });
        }
      }
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
        .addToggle((t) => t.setValue(cfg.tts.cli?.full_text ?? false).onChange((v) => {
          try {
            // v0.12.0: autoRead.scope と統一同期（full_text ⟺ scope）
            store.save(withFullTextState(store.load(), v));
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }));

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

    // 7. v0.11.0: タスク終了時の自動読み上げ
    {
      const arBox = containerEl.createDiv({ cls: 'cb-tts-autoread' });
      arBox.createEl('h3', { text: s.ttsAutoReadHeading });

      const saveAutoRead = (patch: Partial<TtsAutoReadSettings>): void => {
        const latest = store.load();
        const base = latest.tts.autoRead ?? { enabled: true, scope: 'header' as const };
        store.save({ ...latest, tts: { ...latest.tts, autoRead: { ...base, ...patch } } });
        draw();
      };

      new Setting(arBox)
        .setName(s.ttsAutoReadEnabled)
        .setDesc(s.ttsAutoReadEnabledDesc)
        .addToggle((t) => t.setValue(cfg.tts.autoRead?.enabled ?? true).onChange((v) => saveAutoRead({ enabled: v })));

      new Setting(arBox)
        .setName(s.ttsAutoReadScope)
        .setDesc(s.ttsAutoReadScopeDesc)
        .addDropdown((d) => {
          d.addOption('header', s.ttsAutoReadScopeHeader);
          d.addOption('full', s.ttsAutoReadScopeFull);
          d.setValue(cfg.tts.autoRead?.scope ?? 'header');
          d.onChange((v) => {
            try {
              // v0.12.0: cli.full_text と統一同期（scope ⟺ full_text）
              store.save(withFullTextState(store.load(), (v as 'header' | 'full') === 'full'));
              draw();
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          });
        });

      new Setting(arBox)
        .setName(s.ttsExcludeCallouts)
        .setDesc(s.ttsExcludeCalloutsDesc)
        .addToggle((t) => t.setValue(cfg.tts.excludeCallouts ?? true).onChange((v) => {
          const latest = store.load();
          store.save({ ...latest, tts: { ...latest.tts, excludeCallouts: v } });
          draw();
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
