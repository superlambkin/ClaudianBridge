import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VoiceConfigSync } from '../../../src/features/tts/voice-config-sync';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, type ClaudianBridgeSettings } from '../../../src/core/settings';
import { ConfigStore } from '../../../src/core/config-store';

function makeStore(tmp: string): ConfigStore {
  return new ConfigStore(path.join(tmp, 'data.json'));
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vc-sync-'));
}

describe('VoiceConfigSync', () => {
  let tmp: string;
  let vcPath: string;

  beforeEach(() => {
    tmp = tmpdir();
    vcPath = path.join(tmp, 'voice-config.json');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('importFromVoiceConfig', () => {
    it('ファイルが無ければ null を返す', async () => {
      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      expect(await sync.importFromVoiceConfig()).toBeNull();
    });

    it('既存 voice-config.json から tts 設定へ変換する', async () => {
      fs.writeFileSync(vcPath, JSON.stringify({
        enabled: true,
        voice: 'xiaoxiao',
        max_chars: 500,
        debounce_ms: 1000,
        lang_strategy: 'auto',
        engine_priority: ['edge-tts', 'pyttsx3', 'system'],
        voice_overrides: { 'zh-CN': 'xiaoxiao', 'ja-JP': 'keita', 'en-US': 'guy' },
        speech_filter: { emoji: false, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
        full_text: true,
      }));

      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      const partial = await sync.importFromVoiceConfig();
      expect(partial).not.toBeNull();
      expect(partial?.tts?.enabled).toBe(true);
      expect(partial?.tts?.engine).toBe('edge');
      expect(partial?.tts?.voices?.edge.ja).toBe('keita');
      expect(partial?.tts?.voices?.edge.en).toBe('guy');
      expect(partial?.tts?.cli?.max_chars).toBe(500);
      expect(partial?.tts?.cli?.full_text).toBe(true);
      expect(partial?.tts?.cli?.speech_filter?.emoji).toBe(false);
    });

    it('engine_priority が pyttsx3 先頭なら webspeech に変換', async () => {
      fs.writeFileSync(vcPath, JSON.stringify({
        enabled: true,
        voice: 'nanami',
        max_chars: 300,
        debounce_ms: 2000,
        lang_strategy: 'auto',
        engine_priority: ['pyttsx3', 'system'],
        voice_overrides: { 'zh-CN': 'xiaoxiao', 'ja-JP': 'nanami', 'en-US': 'aria' },
        speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
        full_text: false,
      }));
      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      const partial = await sync.importFromVoiceConfig();
      expect(partial?.tts?.engine).toBe('webspeech');
    });
  });

  describe('exportToVoiceConfig', () => {
    it('Claudian Bridge 設定を voice-config.json 形式で出力する', async () => {
      const store = makeStore(tmp);
      store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      const cfg: ClaudianBridgeSettings = {
        ...store.load(),
        tts: {
          enabled: true,
          engine: 'edge',
          edgeTtsModulePath: '',
          voices: { edge: { zh: 'xiaoxiao', ja: 'keita', en: 'guy' }, webspeech: { zh: '', ja: '', en: '' } },
          cli: { full_text: true, max_chars: 500, debounce_ms: 1000, speech_filter: { emoji: false, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
        },
      };
      const sync = new VoiceConfigSync(store, vcPath);
      await sync.exportToVoiceConfig(cfg);

      const written = JSON.parse(fs.readFileSync(vcPath, 'utf-8'));
      expect(written.enabled).toBe(true);
      expect(written.engine_priority).toEqual(['edge-tts', 'pyttsx3', 'system']);
      expect(written.voice_overrides).toEqual({ 'zh-CN': 'xiaoxiao', 'ja-JP': 'keita', 'en-US': 'guy' });
      expect(written.full_text).toBe(true);
      expect(written.max_chars).toBe(500);
      expect(written.debounce_ms).toBe(1000);
      expect(written.speech_filter.emoji).toBe(false);
    });

    it('engine=plachta は edge-tts 優先で出力する', async () => {
      const store = makeStore(tmp);
      store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      const cfg: ClaudianBridgeSettings = {
        ...store.load(),
        tts: { ...store.load().tts, edgeTtsModulePath: '', engine: 'plachta' },
      };
      const sync = new VoiceConfigSync(store, vcPath);
      await sync.exportToVoiceConfig(cfg);
      const written = JSON.parse(fs.readFileSync(vcPath, 'utf-8'));
      expect(written.engine_priority[0]).toBe('edge-tts');
    });
  });
});
