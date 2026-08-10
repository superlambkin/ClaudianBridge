export interface ClaudianBridgeSettings {
  general: {
    enabled: boolean;
    migratedFrom: { claudianSelectionBridge: boolean; extensionWhitelist: boolean; vaultOfficeBridge: boolean };
    migrationResetAvailable: boolean;
  };
  selection: { enabled: boolean; delayMs: number };
  tts: {
    enabled: boolean;
    engine: 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax';
    voices: { zh: string; ja: string; en: string };
    minimax: {
      enabled: boolean;
      showInEngineList: boolean;
      apiKey: string;
      voiceIdZh: string;
      voiceIdJa: string;
      voiceIdEn: string;
      speed: number;
      vol: number;
      pitch: number;
      audioFormat: string;
    };
    voice: string;
  };
  office: Record<string, never>;
  whitelist: Record<string, never>;
}

export const DEFAULT_CLAUDIAN_BRIDGE_SETTINGS: ClaudianBridgeSettings = {
  general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false }, migrationResetAvailable: true },
  selection: { enabled: true, delayMs: 300 },
  tts: {
    enabled: true,
    engine: 'edge',
    voices: { zh: '', ja: '', en: '' },
    minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' },
    voice: '',
  },
  office: {},
  whitelist: {},
};

export function normalizeClaudianBridgeSettings(raw: unknown): ClaudianBridgeSettings {
  const r = (raw ?? {}) as Partial<ClaudianBridgeSettings>;
  return {
    general: {
      enabled: r.general?.enabled ?? true,
      migratedFrom: {
        claudianSelectionBridge: r.general?.migratedFrom?.claudianSelectionBridge ?? false,
        extensionWhitelist: r.general?.migratedFrom?.extensionWhitelist ?? false,
        vaultOfficeBridge: r.general?.migratedFrom?.vaultOfficeBridge ?? false,
      },
      migrationResetAvailable: r.general?.migrationResetAvailable ?? true,
    },
    selection: { enabled: r.selection?.enabled ?? true, delayMs: r.selection?.delayMs ?? 300 },
    tts: {
      enabled: r.tts?.enabled ?? true,
      engine: r.tts?.engine ?? 'edge',
      voices: { zh: r.tts?.voices?.zh ?? '', ja: r.tts?.voices?.ja ?? '', en: r.tts?.voices?.en ?? '' },
      minimax: {
        enabled: r.tts?.minimax?.enabled ?? false,
        showInEngineList: r.tts?.minimax?.showInEngineList ?? false,
        apiKey: r.tts?.minimax?.apiKey ?? '',
        voiceIdZh: r.tts?.minimax?.voiceIdZh ?? '',
        voiceIdJa: r.tts?.minimax?.voiceIdJa ?? '',
        voiceIdEn: r.tts?.minimax?.voiceIdEn ?? '',
        speed: r.tts?.minimax?.speed ?? 1,
        vol: r.tts?.minimax?.vol ?? 1,
        pitch: r.tts?.minimax?.pitch ?? 0,
        audioFormat: r.tts?.minimax?.audioFormat ?? 'mp3',
      },
      voice: r.tts?.voice ?? '',
    },
    office: {},
    whitelist: {},
  };
}

export function validateClaudianBridgeSettings(cfg: ClaudianBridgeSettings): string | null {
  if (typeof cfg.general.enabled !== 'boolean') return 'general.enabled は boolean である必要があります';
  if (typeof cfg.selection.enabled !== 'boolean') return 'selection.enabled は boolean である必要があります';
  if (!Number.isInteger(cfg.selection.delayMs) || cfg.selection.delayMs < 0) return 'selection.delayMs は 0 以上の整数である必要があります';
  if (typeof cfg.tts.enabled !== 'boolean') return 'tts.enabled は boolean である必要があります';
  const engines = ['edge', 'claudetts', 'auto', 'webspeech', 'minimax'];
  if (!engines.includes(cfg.tts.engine)) return `tts.engine が未知です: ${cfg.tts.engine}`;
  return null;
}
