import type { ClaudianBridgeSettings } from '../core/settings';
import { DEFAULT_OBJECT_EXCLUDE_SELECTORS, DEFAULT_CHUNK_MAX_CHARS, DEFAULT_EDGE_CHUNK_MAX_CHARS, DEFAULT_SPEECH_FILTER_OPTIONS } from '../core/settings';

export function convertFromClaudianSelectionBridge(raw: unknown): Partial<ClaudianBridgeSettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ttsRaw = (r.tts as Record<string, unknown>) ?? {};
  const voicesRaw = (ttsRaw.voices as Record<string, unknown>) ?? {};
  // v0.6.0: 旧 engine 列挙 → 'edge' | 'webspeech' に絞る（非対応は 'edge' にフォールバック）
  const legacyEngine = ttsRaw.engine as string | undefined;
  const newEngine: 'edge' | 'webspeech' =
    legacyEngine === 'webspeech' ? 'webspeech' : 'edge';
  // 旧データ: 平型 voices.{zh,ja,en} / 新データ: ネスト voices.edge.* を両対応
  const isNested = voicesRaw && ('edge' in voicesRaw || 'webspeech' in voicesRaw);
  const edgeVoices = isNested
    ? ((voicesRaw.edge as Record<string, unknown>) ?? {})
    : voicesRaw;
  const webVoices  = isNested ? ((voicesRaw.webspeech as Record<string, unknown>) ?? {}) : { zh: '', ja: '', en: '' };
  return {
    selection: {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      folderEnabled: true,
      delayMs: typeof r.delayMs === 'number' ? r.delayMs : 300,
      objectMenuEnabled: true,
      objectMenuExcludeSelectors: [...DEFAULT_OBJECT_EXCLUDE_SELECTORS],
      objectMenuTypeFlags: { button: true, input: true, link: true, element: true },
      objectMenuContextFlags: { ribbon: true, sidebar: true, modal: true, settings: true, menu: true, workspace: true },
    },
    tts: {
      enabled: true,
      engine: newEngine,
      voices: {
        edge: {
          zh: typeof edgeVoices.zh === 'string' ? (edgeVoices.zh as string) : '',
          ja: typeof edgeVoices.ja === 'string' ? (edgeVoices.ja as string) : '',
          en: typeof edgeVoices.en === 'string' ? (edgeVoices.en as string) : '',
        },
        webspeech: {
          zh: typeof webVoices.zh === 'string' ? (webVoices.zh as string) : '',
          ja: typeof webVoices.ja === 'string' ? (webVoices.ja as string) : '',
          en: typeof webVoices.en === 'string' ? (webVoices.en as string) : '',
        },
      },
      chunkMaxChars: { edge: DEFAULT_EDGE_CHUNK_MAX_CHARS, webspeech: DEFAULT_CHUNK_MAX_CHARS, plachta: DEFAULT_CHUNK_MAX_CHARS },
      speechFilter: {
        selection: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        autoRead: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        message: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        inputAi: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
      },
    },
  };
}
