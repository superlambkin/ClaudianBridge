export type OfficeConflictPolicy = 'overwrite' | 'skip' | 'timestamp';
export type OfficeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface OfficeSettings {
  enabled: boolean;
  pythonPath: string;
  markitdownArgs: string;
  enabledExtensions: string[];
  conflictPolicy: OfficeConflictPolicy;
  frontmatterTemplate: string;
  logLevel: OfficeLogLevel;
  showProgressModal: boolean;
  outputDirOverride: string;
}

export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  enabled: true,
  pythonPath: typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3',
  markitdownArgs: '',
  enabledExtensions: ['docx', 'xlsx', 'pptx', 'pdf', 'html', 'htm', 'csv'],
  conflictPolicy: 'overwrite',
  frontmatterTemplate:
    '---\n' +
    'title: {{title}}\n' +
    'type: office-conversion\n' +
    'language: Japanese\n' +
    'version: 1.0.0\n' +
    'created: {{date}}\n' +
    'modified: {{date}}\n' +
    'tags:\n' +
    '  - office\n' +
    '  - {{ext}}\n' +
    '  - converted\n' +
    'source_file: {{sourcePath}}\n' +
    'aliases:\n' +
    '  - {{title}}\n' +
    '---',
  logLevel: 'info',
  showProgressModal: true,
  outputDirOverride: '',
};

export function normalizeOfficeSettings(raw: unknown): OfficeSettings {
  const r = (raw ?? {}) as Partial<OfficeSettings>;
  return {
    enabled: r.enabled ?? DEFAULT_OFFICE_SETTINGS.enabled,
    pythonPath: typeof r.pythonPath === 'string' && r.pythonPath !== '' ? r.pythonPath : DEFAULT_OFFICE_SETTINGS.pythonPath,
    markitdownArgs: typeof r.markitdownArgs === 'string' ? r.markitdownArgs : '',
    enabledExtensions: Array.isArray(r.enabledExtensions)
      ? r.enabledExtensions.filter((e) => typeof e === 'string')
      : [...DEFAULT_OFFICE_SETTINGS.enabledExtensions],
    conflictPolicy: r.conflictPolicy && ['overwrite', 'skip', 'timestamp'].includes(r.conflictPolicy)
      ? (r.conflictPolicy as OfficeConflictPolicy)
      : DEFAULT_OFFICE_SETTINGS.conflictPolicy,
    frontmatterTemplate: typeof r.frontmatterTemplate === 'string' ? r.frontmatterTemplate : DEFAULT_OFFICE_SETTINGS.frontmatterTemplate,
    logLevel: r.logLevel && ['debug', 'info', 'warn', 'error'].includes(r.logLevel)
      ? (r.logLevel as OfficeLogLevel)
      : DEFAULT_OFFICE_SETTINGS.logLevel,
    showProgressModal: typeof r.showProgressModal === 'boolean' ? r.showProgressModal : DEFAULT_OFFICE_SETTINGS.showProgressModal,
    outputDirOverride: typeof r.outputDirOverride === 'string' ? r.outputDirOverride : DEFAULT_OFFICE_SETTINGS.outputDirOverride,
  };
}

export interface WhitelistSettings {
  enabled: boolean;
  extensions: string[];
  alwaysShowFolders: boolean;
}

export const DEFAULT_WHITELIST_SETTINGS: WhitelistSettings = {
  enabled: true,
  extensions: ['md', 'canvas', 'pdf', 'png', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  alwaysShowFolders: true,
};

export function normalizeWhitelistSettings(raw: unknown): WhitelistSettings {
  const r = (raw ?? {}) as Partial<WhitelistSettings>;
  return {
    enabled: r.enabled ?? DEFAULT_WHITELIST_SETTINGS.enabled,
    extensions: Array.isArray(r.extensions)
      ? r.extensions
          .filter((e): e is string => typeof e === 'string')
          .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
          .filter((e) => e.length > 0)
      : [...DEFAULT_WHITELIST_SETTINGS.extensions],
    alwaysShowFolders: r.alwaysShowFolders ?? DEFAULT_WHITELIST_SETTINGS.alwaysShowFolders,
  };
}

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
  office: OfficeSettings;
  whitelist: WhitelistSettings;
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
  office: { ...DEFAULT_OFFICE_SETTINGS },
  whitelist: { ...DEFAULT_WHITELIST_SETTINGS },
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
    office: normalizeOfficeSettings(r.office),
    whitelist: normalizeWhitelistSettings(r.whitelist),
  };
}

export function validateClaudianBridgeSettings(cfg: ClaudianBridgeSettings): string | null {
  if (typeof cfg.general.enabled !== 'boolean') return 'general.enabled は boolean である必要があります';
  if (typeof cfg.selection.enabled !== 'boolean') return 'selection.enabled は boolean である必要があります';
  if (!Number.isInteger(cfg.selection.delayMs) || cfg.selection.delayMs < 0) return 'selection.delayMs は 0 以上の整数である必要があります';
  if (typeof cfg.tts.enabled !== 'boolean') return 'tts.enabled は boolean である必要があります';
  const engines = ['edge', 'claudetts', 'auto', 'webspeech', 'minimax'];
  if (!engines.includes(cfg.tts.engine)) return `tts.engine が未知です: ${cfg.tts.engine}`;
  if (typeof cfg.office.enabled !== 'boolean') return 'office.enabled は boolean である必要があります';
  if (!Array.isArray(cfg.office.enabledExtensions)) return 'office.enabledExtensions は配列である必要があります';
  if (!['overwrite', 'skip', 'timestamp'].includes(cfg.office.conflictPolicy)) return 'office.conflictPolicy が未知です';
  if (typeof cfg.whitelist.enabled !== 'boolean') return 'whitelist.enabled は boolean である必要があります';
  if (!Array.isArray(cfg.whitelist.extensions)) return 'whitelist.extensions は配列である必要があります';
  if (typeof cfg.whitelist.alwaysShowFolders !== 'boolean') return 'whitelist.alwaysShowFolders は boolean である必要があります';
  return null;
}
