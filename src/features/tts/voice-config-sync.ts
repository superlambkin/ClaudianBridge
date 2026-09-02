import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings, TtsCliSettings, TtsEngine } from '../../core/settings';
import { DEFAULT_TTS_CLI_SETTINGS, DEFAULT_CHUNK_MAX_CHARS, DEFAULT_EDGE_CHUNK_MAX_CHARS, DEFAULT_SPEECH_FILTER_OPTIONS } from '../../core/settings';

/** voice-config.json（Claude Code CLI 側）のスキーマ */
interface VoiceConfigJson {
  enabled: boolean;
  voice: string;
  max_chars: number;
  debounce_ms: number;
  lang_strategy: string;
  engine_priority: string[];
  voice_overrides: Record<string, string>;
  speech_filter: { emoji: boolean; kaomoji: boolean; ascii_emoticon: boolean; emoji_shortcode: boolean };
  full_text: boolean;
}

/** エンジン別 engine_priority マッピング */
const ENGINE_PRIORITY: Record<TtsEngine, string[]> = {
  edge: ['edge-tts', 'pyttsx3', 'system'],
  webspeech: ['pyttsx3', 'system'],
  plachta: ['edge-tts', 'pyttsx3', 'system'],
  'edge-local': ['edge-tts', 'pyttsx3', 'system'],
};

/**
 * Claudian Bridge と Claude Code CLI（voice-config.json）の双方向同期。
 * Claudian Bridge を SSOT とし、保存時に export、初回起動時に import する。
 */
export class VoiceConfigSync {
  static readonly VOICE_CONFIG_PATH = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'voice-config.json');

  constructor(
    private readonly store: ConfigStore,
    private readonly voiceConfigPath: string = VoiceConfigSync.VOICE_CONFIG_PATH,
  ) {}

  /** 既存 voice-config.json を Claudian Bridge 設定へ変換（無ければ null） */
  async importFromVoiceConfig(): Promise<Partial<ClaudianBridgeSettings> | null> {
    if (!fs.existsSync(this.voiceConfigPath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(this.voiceConfigPath, 'utf-8')) as Partial<VoiceConfigJson>;
      const priority = raw.engine_priority ?? ['edge-tts', 'pyttsx3', 'system'];
      const engine: TtsEngine = priority[0] === 'edge-tts' ? 'edge' : priority[0] === 'pyttsx3' ? 'webspeech' : 'edge';
      const overrides = raw.voice_overrides ?? {};
      const cli: TtsCliSettings = {
        full_text: raw.full_text ?? DEFAULT_TTS_CLI_SETTINGS.full_text,
        max_chars: typeof raw.max_chars === 'number' ? raw.max_chars : DEFAULT_TTS_CLI_SETTINGS.max_chars,
        debounce_ms: typeof raw.debounce_ms === 'number' ? raw.debounce_ms : DEFAULT_TTS_CLI_SETTINGS.debounce_ms,
        speech_filter: {
          emoji: raw.speech_filter?.emoji ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji,
          kaomoji: raw.speech_filter?.kaomoji ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.kaomoji,
          ascii_emoticon: raw.speech_filter?.ascii_emoticon ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.ascii_emoticon,
          emoji_shortcode: raw.speech_filter?.emoji_shortcode ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji_shortcode,
        },
      };
      return {
        tts: {
          enabled: raw.enabled ?? true,
          engine,
          edgeTtsModulePath: '',
          voices: {
            edge: {
              zh: overrides['zh-CN'] ?? raw.voice ?? 'xiaoxiao',
              ja: overrides['ja-JP'] ?? raw.voice ?? 'nanami',
              en: overrides['en-US'] ?? raw.voice ?? 'aria',
            },
            webspeech: { zh: '', ja: '', en: '' },
          },
          cli,
          chunkMaxChars: { edge: DEFAULT_EDGE_CHUNK_MAX_CHARS, webspeech: DEFAULT_CHUNK_MAX_CHARS, plachta: DEFAULT_CHUNK_MAX_CHARS },
          speechFilter: {
            selection: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
            autoRead: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
            message: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
            inputAi: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
          },
          // v0.27.0 フィールド（addToTtsLanguageMode / autoReadLanguageMode / edgeCloud）は optional。
          // voice-config.json には存在しないため未設定で返し、normalize 時に補填される。
          // v0.31.0 (F-028): mdReadHighlight は normalize で補填される。
          mdReadHighlight: { enabled: true, highlightColor: '' },
        },
      };
    } catch {
      return null;
    }
  }

  /** Claudian Bridge 設定を voice-config.json に出力 */
  async exportToVoiceConfig(cfg: ClaudianBridgeSettings): Promise<void> {
    const tts = cfg.tts;
    const cli = tts.cli ?? DEFAULT_TTS_CLI_SETTINGS;
    const vc: VoiceConfigJson = {
      enabled: tts.enabled,
      voice: tts.voices.edge.zh || 'xiaoxiao',
      max_chars: cli.max_chars,
      debounce_ms: cli.debounce_ms,
      lang_strategy: 'auto',
      engine_priority: ENGINE_PRIORITY[tts.engine],
      voice_overrides: {
        'zh-CN': tts.voices.edge.zh || 'xiaoxiao',
        'ja-JP': tts.voices.edge.ja || 'nanami',
        'en-US': tts.voices.edge.en || 'aria',
      },
      speech_filter: { ...cli.speech_filter },
      full_text: cli.full_text,
    };
    await fs.promises.mkdir(path.dirname(this.voiceConfigPath), { recursive: true });
    const tmp = this.voiceConfigPath + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(vc, null, 2) + '\n', 'utf-8');
    await fs.promises.rename(tmp, this.voiceConfigPath);
  }
}
