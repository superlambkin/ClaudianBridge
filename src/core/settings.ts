export type OfficeConflictPolicy = 'overwrite' | 'skip' | 'timestamp';
export type OfficeLogLevel = 'debug' | 'info' | 'warn' | 'error';

// Local clamp helper for general.quotaRefreshSec.
// Defined here (not imported from src/features/quota/types) to avoid a circular dependency:
// quota/types.ts is intentionally decoupled from core/settings.ts so that the quota feature
// can be developed in isolation. If the canonical helper ever needs to move, prefer
// keeping the boundary one-way (core → features).
const QUOTA_REFRESH_MIN_SEC_LOCAL = 10;
const QUOTA_REFRESH_MAX_SEC_LOCAL = 600;
const QUOTA_REFRESH_DEFAULT_SEC_LOCAL = 60;

// v0.4.0: Multi-provider quota switch interval
const QUOTA_SWITCH_MIN_SEC_LOCAL = 5;
const QUOTA_SWITCH_MAX_SEC_LOCAL = 600;
const QUOTA_SWITCH_DEFAULT_SEC_LOCAL = 5;

export function clampRefreshSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return QUOTA_REFRESH_DEFAULT_SEC_LOCAL;
  const floored = Math.floor(v);
  if (floored === 0) return 0;
  return Math.max(
    QUOTA_REFRESH_MIN_SEC_LOCAL,
    Math.min(QUOTA_REFRESH_MAX_SEC_LOCAL, floored)
  );
}

export function clampSwitchSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return QUOTA_SWITCH_DEFAULT_SEC_LOCAL;
  const floored = Math.floor(v);
  if (floored === 0) return 0;
  return Math.max(
    QUOTA_SWITCH_MIN_SEC_LOCAL,
    Math.min(QUOTA_SWITCH_MAX_SEC_LOCAL, floored)
  );
}

// === v0.2.0: Object context menu defaults ===
export const DEFAULT_OBJECT_EXCLUDE_SELECTORS: string[] = [
  '.cb-popup',
  '.claudian-popup',
  '.menu',
  '.suggestion-container',
];

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

// === v0.8.0: Plachta Cloud TTS 設定 ===
export type PlachtaLanguage = '日本語' | '简体中文' | 'English' | 'Mix';

export interface PlachtaSettings {
  speaker: string;
  language: PlachtaLanguage;
  speed: number;
}

/** TTS エンジン識別子。v0.8.0: spawn ベースのローカル VITS を完全削除しクラウド Plachta に置換。 */
export type TtsEngine = 'edge' | 'webspeech' | 'plachta';

export const PLACHTA_DEFAULT_SPEAKER = '特别周 Special Week (Umamusume Pretty Derby)';
export const PLACHTA_DEFAULT_LANGUAGE: PlachtaLanguage = '日本語';
export const PLACHTA_DEFAULT_SPEED = 1.0;

export const DEFAULT_PLACHTA_SETTINGS: PlachtaSettings = {
  speaker: PLACHTA_DEFAULT_SPEAKER,
  language: PLACHTA_DEFAULT_LANGUAGE,
  speed: PLACHTA_DEFAULT_SPEED,
};

export const PLACHTA_LANGUAGES: readonly PlachtaLanguage[] = ['日本語', '简体中文', 'English', 'Mix'];
export const PLACHTA_SPEED_MIN = 0.5;
export const PLACHTA_SPEED_MAX = 2.0;

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

/** Claude Code の設定ファイル既定パス（ホームディレクトリ解決） */
export function defaultClaudeSettingsPath(): string {
  try {
    const os = require('os') as typeof import('os');
    return require('path').join(os.homedir(), '.claude', 'settings.json') as string;
  } catch {
    return 'C:\\Users\\superlambkin\\.claude\\settings.json';
  }
}

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

export interface QuotaDisplayFlags {
  claude: boolean;
  deepseek: boolean;
  kimi: boolean;
  minimax: boolean;
}

export interface QuotaSettings {
  /** Claude Code の設定ファイル（LLM 情報の読み取り元） */
  claudeSettingsPath: string;
  /** DeepSeek API キー */
  deepseekApiKey: string;
  /** KIMI CODE API キー */
  kimiApiKey: string;
  /** MINIMAX API キー */
  minimaxApiKey: string;
  /** 表示モデル個別ON/OFF（v0.5.0） */
  displayModels: QuotaDisplayFlags;
}

export const DEFAULT_QUOTA_DISPLAY_MODELS: QuotaDisplayFlags = {
  claude: true,
  deepseek: true,
  kimi: true,
  minimax: true,
};

export interface ClaudianBridgeSettings {
  general: {
    enabled: boolean;
    migratedFrom: { claudianSelectionBridge: boolean; extensionWhitelist: boolean; vaultOfficeBridge: boolean; chromaInspector: boolean };
    migrationResetAvailable: boolean;
    quotaEnabled: boolean;
    quotaRefreshSec: number;
    quotaSwitchSec: number;  // v0.4.0: provider rotation interval
    // v0.9.0: Claudian チャットのコードブロックコピー時に ``` フェンスを付与
    codeCopyFence: boolean;
  };
  quota: QuotaSettings;
  selection: {
    enabled: boolean;
    folderEnabled: boolean;
    delayMs: number;
    // === v0.2.0: Object context menu ===
    objectMenuEnabled: boolean;
    objectMenuExcludeSelectors: string[];
    // === v0.5.0: Object context menu granular toggles ===
    objectMenuTypeFlags: { button: boolean; input: boolean; link: boolean; element: boolean };
    objectMenuContextFlags: { ribbon: boolean; sidebar: boolean; modal: boolean; settings: boolean; menu: boolean; workspace: boolean };
  };
  tts: {
    enabled: boolean;
    engine: TtsEngine;
    voices: {
      edge:      { zh: string; ja: string; en: string };
      webspeech: { zh: string; ja: string; en: string };
    };
    /** v0.8.0: Plachta Cloud TTS の設定。engine === 'plachta' のとき使用。 */
    plachta?: PlachtaSettings;
  };
  office: OfficeSettings;
  whitelist: WhitelistSettings;
  chroma: ChromaSettings;
}

export const DEFAULT_CLAUDIAN_BRIDGE_SETTINGS: ClaudianBridgeSettings = {
  general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false }, migrationResetAvailable: true, quotaEnabled: false, quotaRefreshSec: 60, quotaSwitchSec: 5, codeCopyFence: true },
  quota: {
    claudeSettingsPath: defaultClaudeSettingsPath(),
    deepseekApiKey: '',
    kimiApiKey: '',
    minimaxApiKey: '',
    displayModels: { ...DEFAULT_QUOTA_DISPLAY_MODELS },
  },
  selection: {
    enabled: true,
    folderEnabled: true,
    delayMs: 300,
    objectMenuEnabled: true,
    objectMenuExcludeSelectors: [...DEFAULT_OBJECT_EXCLUDE_SELECTORS],
    objectMenuTypeFlags: { button: true, input: true, link: true, element: true },
    objectMenuContextFlags: { ribbon: true, sidebar: true, modal: true, settings: true, menu: true, workspace: true },
  },
  tts: {
    enabled: true,
    engine: 'edge',
    voices: {
      edge:      { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' },
      webspeech: { zh: '',         ja: '',       en: '' },
    },
    plachta: { ...DEFAULT_PLACHTA_SETTINGS },
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
      quotaEnabled: typeof r.general?.quotaEnabled === 'boolean' ? r.general.quotaEnabled : false,
      quotaRefreshSec: clampRefreshSec(r.general?.quotaRefreshSec),
      quotaSwitchSec: clampSwitchSec(r.general?.quotaSwitchSec),
      codeCopyFence: typeof r.general?.codeCopyFence === 'boolean' ? r.general.codeCopyFence : true,
    },
    quota: {
      claudeSettingsPath: typeof r.quota?.claudeSettingsPath === 'string' && r.quota.claudeSettingsPath.trim() !== ''
        ? r.quota.claudeSettingsPath
        : defaultClaudeSettingsPath(),
      deepseekApiKey: typeof r.quota?.deepseekApiKey === 'string' ? r.quota.deepseekApiKey : '',
      kimiApiKey: typeof r.quota?.kimiApiKey === 'string' ? r.quota.kimiApiKey : '',
      minimaxApiKey: typeof r.quota?.minimaxApiKey === 'string' ? r.quota.minimaxApiKey : '',
      displayModels: {
        claude: typeof r.quota?.displayModels?.claude === 'boolean' ? r.quota.displayModels.claude : true,
        deepseek: typeof r.quota?.displayModels?.deepseek === 'boolean' ? r.quota.displayModels.deepseek : true,
        kimi: typeof r.quota?.displayModels?.kimi === 'boolean' ? r.quota.displayModels.kimi : true,
        minimax: typeof r.quota?.displayModels?.minimax === 'boolean' ? r.quota.displayModels.minimax : true,
      },
    },
    selection: {
      enabled: r.selection?.enabled ?? true,
      folderEnabled: r.selection?.folderEnabled ?? true,
      delayMs: r.selection?.delayMs ?? 300,
      objectMenuEnabled: typeof r.selection?.objectMenuEnabled === 'boolean' ? r.selection.objectMenuEnabled : true,
      objectMenuExcludeSelectors: Array.isArray(r.selection?.objectMenuExcludeSelectors)
        ? r.selection.objectMenuExcludeSelectors.filter((s): s is string => typeof s === 'string')
        : [...DEFAULT_OBJECT_EXCLUDE_SELECTORS],
      objectMenuTypeFlags: {
        button: typeof r.selection?.objectMenuTypeFlags?.button === 'boolean' ? r.selection.objectMenuTypeFlags.button : true,
        input: typeof r.selection?.objectMenuTypeFlags?.input === 'boolean' ? r.selection.objectMenuTypeFlags.input : true,
        link: typeof r.selection?.objectMenuTypeFlags?.link === 'boolean' ? r.selection.objectMenuTypeFlags.link : true,
        element: typeof r.selection?.objectMenuTypeFlags?.element === 'boolean' ? r.selection.objectMenuTypeFlags.element : true,
      },
      objectMenuContextFlags: {
        ribbon: typeof r.selection?.objectMenuContextFlags?.ribbon === 'boolean' ? r.selection.objectMenuContextFlags.ribbon : true,
        sidebar: typeof r.selection?.objectMenuContextFlags?.sidebar === 'boolean' ? r.selection.objectMenuContextFlags.sidebar : true,
        modal: typeof r.selection?.objectMenuContextFlags?.modal === 'boolean' ? r.selection.objectMenuContextFlags.modal : true,
        settings: typeof r.selection?.objectMenuContextFlags?.settings === 'boolean' ? r.selection.objectMenuContextFlags.settings : true,
        menu: typeof r.selection?.objectMenuContextFlags?.menu === 'boolean' ? r.selection.objectMenuContextFlags.menu : true,
        workspace: typeof r.selection?.objectMenuContextFlags?.workspace === 'boolean' ? r.selection.objectMenuContextFlags.workspace : true,
      },
    },
    tts: {
      enabled: r.tts?.enabled ?? true,
      engine: r.tts?.engine === 'webspeech' ? 'webspeech'
            : r.tts?.engine === 'plachta' ? 'plachta'
            : 'edge',
      voices: (() => {
        // v0.6.0 migration: 旧平型 { voices: { zh, ja, en } } → ネスト型 { voices: { edge, webspeech } }
        const rawVoices = (r.tts?.voices ?? {}) as Record<string, unknown>;
        const flat = {
          zh: typeof rawVoices.zh === 'string' ? (rawVoices.zh as string) : '',
          ja: typeof rawVoices.ja === 'string' ? (rawVoices.ja as string) : '',
          en: typeof rawVoices.en === 'string' ? (rawVoices.en as string) : '',
        };
        const edgeRaw = (rawVoices.edge ?? {}) as Record<string, unknown>;
        const webRaw  = (rawVoices.webspeech ?? {}) as Record<string, unknown>;
        const readEngine = (raw: Record<string, unknown>, fallback: string) => ({
          zh: typeof raw.zh === 'string' && (raw.zh as string) !== '' ? (raw.zh as string) : fallback,
          ja: typeof raw.ja === 'string' && (raw.ja as string) !== '' ? (raw.ja as string) : fallback,
          en: typeof raw.en === 'string' && (raw.en as string) !== '' ? (raw.en as string) : fallback,
        });
        return {
          edge: {
            // 優先順位: edge.{lang} > 平型.{lang} > default
            ...readEngine(edgeRaw, '__SENTINEL__'),
            zh: typeof edgeRaw.zh === 'string' && (edgeRaw.zh as string) !== ''
                  ? (edgeRaw.zh as string)
                  : (flat.zh !== '' ? flat.zh : 'xiaoxiao'),
            ja: typeof edgeRaw.ja === 'string' && (edgeRaw.ja as string) !== ''
                  ? (edgeRaw.ja as string)
                  : (flat.ja !== '' ? flat.ja : 'nanami'),
            en: typeof edgeRaw.en === 'string' && (edgeRaw.en as string) !== ''
                  ? (edgeRaw.en as string)
                  : (flat.en !== '' ? flat.en : 'aria'),
          },
          webspeech: readEngine(webRaw, ''),
        };
      })(),
      plachta: (() => {
        // v0.8.0: Plachta 設定の正規化。型・範囲外は default にフォールバック。
        const raw = (r.tts?.plachta ?? {}) as Partial<PlachtaSettings>;
        const speaker = typeof raw.speaker === 'string' && raw.speaker.trim() !== ''
          ? raw.speaker
          : DEFAULT_PLACHTA_SETTINGS.speaker;
        const language = (typeof raw.language === 'string' && (PLACHTA_LANGUAGES as readonly string[]).includes(raw.language))
          ? raw.language
          : DEFAULT_PLACHTA_SETTINGS.language;
        const speed = typeof raw.speed === 'number' && Number.isFinite(raw.speed) && raw.speed >= PLACHTA_SPEED_MIN && raw.speed <= PLACHTA_SPEED_MAX
          ? raw.speed
          : DEFAULT_PLACHTA_SETTINGS.speed;
        return { speaker, language: language as PlachtaLanguage, speed };
      })(),
    },
    office: normalizeOfficeSettings(r.office),
    whitelist: normalizeWhitelistSettings(r.whitelist),
    chroma,
  };
}

export function validateClaudianBridgeSettings(cfg: ClaudianBridgeSettings): string | null {
  if (typeof cfg.general.enabled !== 'boolean') return 'general.enabled は boolean である必要があります';
  if (typeof cfg.general.codeCopyFence !== 'boolean') return 'general.codeCopyFence は boolean である必要があります';
  if (typeof cfg.selection.enabled !== 'boolean') return 'selection.enabled は boolean である必要があります';
  if (typeof cfg.selection.folderEnabled !== 'boolean') return 'selection.folderEnabled は boolean である必要があります';
  if (!Number.isInteger(cfg.selection.delayMs) || cfg.selection.delayMs < 0) return 'selection.delayMs は 0 以上の整数である必要があります';
  if (typeof cfg.selection.objectMenuEnabled !== 'boolean') return 'selection.objectMenuEnabled は boolean である必要があります';
  if (!Array.isArray(cfg.selection.objectMenuExcludeSelectors)) return 'selection.objectMenuExcludeSelectors は配列である必要があります';
  if (typeof cfg.selection.objectMenuTypeFlags !== 'object' || cfg.selection.objectMenuTypeFlags === null) return 'selection.objectMenuTypeFlags はオブジェクトである必要があります';
  for (const k of ['button', 'input', 'link', 'element'] as const) {
    if (typeof cfg.selection.objectMenuTypeFlags[k] !== 'boolean') return `selection.objectMenuTypeFlags.${k} は boolean である必要があります`;
  }
  if (typeof cfg.selection.objectMenuContextFlags !== 'object' || cfg.selection.objectMenuContextFlags === null) return 'selection.objectMenuContextFlags はオブジェクトである必要があります';
  for (const k of ['ribbon', 'sidebar', 'modal', 'settings', 'menu', 'workspace'] as const) {
    if (typeof cfg.selection.objectMenuContextFlags[k] !== 'boolean') return `selection.objectMenuContextFlags.${k} は boolean である必要があります`;
  }
  if (typeof cfg.tts.enabled !== 'boolean') return 'tts.enabled は boolean である必要があります';
  const engines: readonly TtsEngine[] = ['edge', 'webspeech', 'plachta'];
  if (!engines.includes(cfg.tts.engine)) return `tts.engine が未知です: ${cfg.tts.engine}`;
  if (cfg.tts.plachta !== undefined) {
    if (typeof cfg.tts.plachta.speaker !== 'string') return 'tts.plachta.speaker は文字列である必要があります';
    if (!PLACHTA_LANGUAGES.includes(cfg.tts.plachta.language)) return `tts.plachta.language が未知です: ${cfg.tts.plachta.language}`;
    if (typeof cfg.tts.plachta.speed !== 'number' || !Number.isFinite(cfg.tts.plachta.speed)) return 'tts.plachta.speed は数値である必要があります';
  }
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
  if (typeof cfg.quota?.claudeSettingsPath !== 'string') return 'quota.claudeSettingsPath は文字列である必要があります';
  if (typeof cfg.quota?.deepseekApiKey !== 'string') return 'quota.deepseekApiKey は文字列である必要があります';
  if (typeof cfg.quota?.kimiApiKey !== 'string') return 'quota.kimiApiKey は文字列である必要があります';
  if (typeof cfg.quota?.minimaxApiKey !== 'string') return 'quota.minimaxApiKey は文字列である必要があります';
  for (const k of ['claude', 'deepseek', 'kimi', 'minimax'] as const) {
    if (typeof cfg.quota?.displayModels?.[k] !== 'boolean') return `quota.displayModels.${k} は boolean である必要があります`;
  }
  return null;
}
