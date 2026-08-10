import type { ClaudianBridgeSettings } from '../core/settings';

export function convertFromClaudianSelectionBridge(raw: unknown): Partial<ClaudianBridgeSettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ttsRaw = (r.tts as Record<string, unknown>) ?? {};
  const voicesRaw = (ttsRaw.voices as Record<string, string>) ?? { zh: '', ja: '', en: '' };
  const minimaxRaw = (ttsRaw.minimax as Record<string, unknown>) ?? {};
  return {
    selection: {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      folderEnabled: true,
      delayMs: typeof r.delayMs === 'number' ? r.delayMs : 300,
    },
    tts: {
      enabled: true,
      engine: (['edge', 'claudetts', 'auto', 'webspeech', 'minimax'].includes(ttsRaw.engine as string)
        ? (ttsRaw.engine as 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax')
        : 'edge'),
      voices: {
        zh: voicesRaw.zh ?? '',
        ja: voicesRaw.ja ?? '',
        en: voicesRaw.en ?? '',
      },
      minimax: {
        enabled: typeof minimaxRaw.enabled === 'boolean' ? minimaxRaw.enabled : false,
        showInEngineList: typeof minimaxRaw.showInEngineList === 'boolean' ? minimaxRaw.showInEngineList : false,
        apiKey: typeof minimaxRaw.apiKey === 'string' ? minimaxRaw.apiKey : '',
        voiceIdZh: typeof minimaxRaw.voiceIdZh === 'string' ? minimaxRaw.voiceIdZh : '',
        voiceIdJa: typeof minimaxRaw.voiceIdJa === 'string' ? minimaxRaw.voiceIdJa : '',
        voiceIdEn: typeof minimaxRaw.voiceIdEn === 'string' ? minimaxRaw.voiceIdEn : '',
        speed: typeof minimaxRaw.speed === 'number' ? minimaxRaw.speed : 1,
        vol: typeof minimaxRaw.vol === 'number' ? minimaxRaw.vol : 1,
        pitch: typeof minimaxRaw.pitch === 'number' ? minimaxRaw.pitch : 0,
        audioFormat: typeof minimaxRaw.audioFormat === 'string' ? minimaxRaw.audioFormat : 'mp3',
      },
      voice: typeof ttsRaw.voice === 'string' ? (ttsRaw.voice as string) : '',
    },
  };
}
