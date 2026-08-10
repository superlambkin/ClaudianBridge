export type OfficeConflictPolicy = 'overwrite' | 'skip' | 'timestamp';
export type OfficeLogLevel = 'debug' | 'info' | 'warn' | 'error';

// Re-export chroma clamp constants so callers (tests, settings tab) can reference a single source of truth.
export {
  MAX_QUERY_RESULTS,
  MIN_QUERY_RESULTS,
  MAX_PREVIEW_LENGTH,
  MIN_PREVIEW_LENGTH,
} from '../features/chroma/defaults';
import { MAX_QUERY_RESULTS, MIN_QUERY_RESULTS, MAX_PREVIEW_LENGTH, MIN_PREVIEW_LENGTH } from '../features/chroma/defaults';

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

export interface ChromaSettings {
  enabled: boolean;
  chromaPath: string;
  pythonPath: string;
  embeddingModel: string;
  defaultNResults: number;
  recordPreviewLength: number;
  showProgressModal: boolean;
  enableRawSql: boolean;
  scriptPath: string;
}

export const DEFAULT_CHROMA_SETTINGS: ChromaSettings = {
  enabled: false, // master switch — default OFF until user opts in
  chromaPath: 'chroma_db',
  pythonPath: typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3',
  embeddingModel: '',
  defaultNResults: 5,
  recordPreviewLength: 240,
  showProgressModal: true,
  enableRawSql: false,
  scriptPath: '',
};

export function normalizeChromaSettings(raw: unknown): ChromaSettings {
  const r = (raw ?? {}) as Partial<ChromaSettings>;
  // Clamp numeric values back into the legacy SettingsMigration safe range.
  const rawNResults = Number(r.defaultNResults);
  const rawPreview = Number(r.recordPreviewLength);
  const defaultNResults = Number.isFinite(rawNResults)
    ? Math.max(MIN_QUERY_RESULTS, Math.min(MAX_QUERY_RESULTS, Math.round(rawNResults)))
    : DEFAULT_CHROMA_SETTINGS.defaultNResults;
  const recordPreviewLength = Number.isFinite(rawPreview)
    ? Math.max(MIN_PREVIEW_LENGTH, Math.min(MAX_PREVIEW_LENGTH, Math.round(rawPreview)))
    : DEFAULT_CHROMA_SETTINGS.recordPreviewLength;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_CHROMA_SETTINGS.enabled,
    chromaPath: typeof r.chromaPath === 'string' ? r.chromaPath : DEFAULT_CHROMA_SETTINGS.chromaPath,
    pythonPath: typeof r.pythonPath === 'string' && r.pythonPath !== '' ? r.pythonPath : DEFAULT_CHROMA_SETTINGS.pythonPath,
    embeddingModel: typeof r.embeddingModel === 'string' ? r.embeddingModel : DEFAULT_CHROMA_SETTINGS.embeddingModel,
    defaultNResults,
    recordPreviewLength,
    showProgressModal: typeof r.showProgressModal === 'boolean' ? r.showProgressModal : DEFAULT_CHROMA_SETTINGS.showProgressModal,
    enableRawSql: typeof r.enableRawSql === 'boolean' ? r.enableRawSql : DEFAULT_CHROMA_SETTINGS.enableRawSql,
    scriptPath: typeof r.scriptPath === 'string' ? r.scriptPath : DEFAULT_CHROMA_SETTINGS.scriptPath,
  };
}

export interface ClaudianBridgeSettings {
  general: {
    enabled: boolean;
    migratedFrom: { claudianSelectionBridge: boolean; extensionWhitelist: boolean; vaultOfficeBridge: boolean; chromaInspector: boolean };
    migrationResetAvailable: boolean;
  };
  selection: { enabled: boolean; folderEnabled: boolean; delayMs: number };
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
  chroma: ChromaSettings;
}

export const DEFAULT_CLAUDIAN_BRIDGE_SETTINGS: ClaudianBridgeSettings = {
  general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false }, migrationResetAvailable: true },
  selection: { enabled: true, folderEnabled: true, delayMs: 300 },
  tts: {
    enabled: true,
    engine: 'edge',
    voices: { zh: '', ja: '', en: '' },
    minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' },
    voice: '',
  },
  office: { ...DEFAULT_OFFICE_SETTINGS },
  whitelist: { ...DEFAULT_WHITELIST_SETTINGS },
  chroma: { ...DEFAULT_CHROMA_SETTINGS },
};

export function normalizeClaudianBridgeSettings(raw: unknown): ClaudianBridgeSettings {
  const r = (raw ?? {}) as Partial<ClaudianBridgeSettings>;
  // Backfill chroma defaults first so the clamping pass has a well-defined baseline.
  const chroma = normalizeChromaSettings(r.chroma);
  // Defensive clamp in case downstream callers manipulate r.chroma after the helper ran.
  // (This is a no-op for already-normalized data, but keeps the legacy migration contract intact.)
  chroma.defaultNResults = Math.max(MIN_QUERY_RESULTS, Math.min(MAX_QUERY_RESULTS, Math.round(chroma.defaultNResults)));
  chroma.recordPreviewLength = Math.max(MIN_PREVIEW_LENGTH, Math.min(MAX_PREVIEW_LENGTH, Math.round(chroma.recordPreviewLength)));
  return {
    general: {
      enabled: r.general?.enabled ?? true,
      migratedFrom: {
        claudianSelectionBridge: r.general?.migratedFrom?.claudianSelectionBridge ?? false,
        extensionWhitelist: r.general?.migratedFrom?.extensionWhitelist ?? false,
        vaultOfficeBridge: r.general?.migratedFrom?.vaultOfficeBridge ?? false,
        chromaInspector: r.general?.migratedFrom?.chromaInspector ?? false,
      },
      migrationResetAvailable: r.general?.migrationResetAvailable ?? true,
    },
    selection: {
      enabled: r.selection?.enabled ?? true,
      folderEnabled: r.selection?.folderEnabled ?? true,
      delayMs: r.selection?.delayMs ?? 300,
    },
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
    chroma,
  };
}

export function validateClaudianBridgeSettings(cfg: ClaudianBridgeSettings): string | null {
  if (typeof cfg.general.enabled !== 'boolean') return 'general.enabled は boolean である必要があります';
  if (typeof cfg.selection.enabled !== 'boolean') return 'selection.enabled は boolean である必要があります';
  if (typeof cfg.selection.folderEnabled !== 'boolean') return 'selection.folderEnabled は boolean である必要があります';
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
  if (typeof cfg.chroma.enabled !== 'boolean') return 'chroma.enabled は boolean である必要があります';
  if (typeof cfg.chroma.chromaPath !== 'string') return 'chroma.chromaPath は文字列である必要があります';
  if (typeof cfg.chroma.pythonPath !== 'string') return 'chroma.pythonPath は文字列である必要があります';
  if (typeof cfg.chroma.embeddingModel !== 'string') return 'chroma.embeddingModel は文字列である必要があります';
  if (!Number.isFinite(cfg.chroma.defaultNResults)) return 'chroma.defaultNResults は数値である必要があります';
  if (!Number.isFinite(cfg.chroma.recordPreviewLength)) return 'chroma.recordPreviewLength は数値である必要があります';
  if (typeof cfg.chroma.showProgressModal !== 'boolean') return 'chroma.showProgressModal は boolean である必要があります';
  if (typeof cfg.chroma.enableRawSql !== 'boolean') return 'chroma.enableRawSql は boolean である必要があります';
  if (typeof cfg.chroma.scriptPath !== 'string') return 'chroma.scriptPath は文字列である必要があります';
  return null;
}
