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

// === v0.10.0: Claude Code CLI 用 TTS 設定（voice-config.json と同期） ===
export interface TtsCliSpeechFilter {
  emoji: boolean;
  kaomoji: boolean;
  ascii_emoticon: boolean;
  emoji_shortcode: boolean;
}

export interface TtsCliSettings {
  full_text: boolean;
  max_chars: number;
  debounce_ms: number;
  speech_filter: TtsCliSpeechFilter;
}

export const DEFAULT_TTS_CLI_SPEECH_FILTER: TtsCliSpeechFilter = {
  emoji: true,
  kaomoji: true,
  ascii_emoticon: true,
  emoji_shortcode: true,
};

export const DEFAULT_TTS_CLI_SETTINGS: TtsCliSettings = {
  full_text: false,
  max_chars: 300,
  debounce_ms: 2000,
  speech_filter: { ...DEFAULT_TTS_CLI_SPEECH_FILTER },
};

// === v0.17.0: 読み上げタイプ別フィルタ（speechFilter）とチャンク上限 ===
export const CHUNK_MAX_CHARS_MIN = 50;
export const CHUNK_MAX_CHARS_MAX = 140;
export const DEFAULT_CHUNK_MAX_CHARS = 140;

// === v0.18.0: エンジン別チャンク上限 ===
export const EDGE_CHUNK_MAX_CHARS_MIN = 100;
export const EDGE_CHUNK_MAX_CHARS_MAX = 2000;
export const DEFAULT_EDGE_CHUNK_MAX_CHARS = 500;

/** v0.18.0: エンジン別チャンク上限（edge: 100〜2000 既定500 / webspeech・plachta: 50〜140 既定140） */
export interface TtsChunkMaxChars {
  edge: number;
  webspeech: number;
  plachta: number;
}

/** v0.17.0: 読み上げタイプ別フィルタ（チェック=含めて読む。true の項目は除去しない） */
export interface SpeechFilterOptions {
  emoji: boolean;
  kaomoji: boolean;
  ascii_emoticon: boolean;
  emoji_shortcode: boolean;
  callout: boolean;
  table: boolean;
  code: boolean;
  thinking: boolean;
}

export const DEFAULT_SPEECH_FILTER_OPTIONS: SpeechFilterOptions = {
  emoji: false,
  kaomoji: false,
  ascii_emoticon: false,
  emoji_shortcode: false,
  callout: false,
  table: true,
  code: false,
  thinking: false,
};

export type TtsSpeechFilterSection = 'selection' | 'autoRead' | 'message' | 'inputAi';
export type TtsSpeechFilters = Record<TtsSpeechFilterSection, SpeechFilterOptions>;

export function normalizeTtsCliSettings(raw: unknown): TtsCliSettings {
  const r = (raw ?? {}) as Partial<TtsCliSettings>;
  const maxChars = Number(r.max_chars);
  const debounceMs = Number(r.debounce_ms);
  const sf = (r.speech_filter ?? {}) as Partial<TtsCliSpeechFilter>;
  return {
    full_text: typeof r.full_text === 'boolean' ? r.full_text : DEFAULT_TTS_CLI_SETTINGS.full_text,
    max_chars: Number.isInteger(maxChars) && maxChars > 0 ? maxChars : DEFAULT_TTS_CLI_SETTINGS.max_chars,
    debounce_ms: Number.isInteger(debounceMs) && debounceMs >= 0 ? debounceMs : DEFAULT_TTS_CLI_SETTINGS.debounce_ms,
    speech_filter: {
      emoji: typeof sf.emoji === 'boolean' ? sf.emoji : DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji,
      kaomoji: typeof sf.kaomoji === 'boolean' ? sf.kaomoji : DEFAULT_TTS_CLI_SETTINGS.speech_filter.kaomoji,
      ascii_emoticon: typeof sf.ascii_emoticon === 'boolean' ? sf.ascii_emoticon : DEFAULT_TTS_CLI_SETTINGS.speech_filter.ascii_emoticon,
      emoji_shortcode: typeof sf.emoji_shortcode === 'boolean' ? sf.emoji_shortcode : DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji_shortcode,
    },
  };
}

// === v0.11.0: タスク終了時の自動読み上げ ===
export type TtsAutoReadScope = 'header' | 'full';

export interface TtsAutoReadSettings {
  /** タスク終了報告（📢）の自動読み上げ（デフォルト true） */
  enabled: boolean;
  /** header = 📢 blockquote のみ / full = 報告メッセージ全文 */
  scope: TtsAutoReadScope;
}

export const DEFAULT_TTS_AUTO_READ_SETTINGS: TtsAutoReadSettings = {
  enabled: true,
  scope: 'header',
};

export function normalizeTtsAutoReadSettings(raw: unknown): TtsAutoReadSettings {
  const r = (raw ?? {}) as Partial<TtsAutoReadSettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_TTS_AUTO_READ_SETTINGS.enabled,
    scope: r.scope === 'full' ? 'full' : DEFAULT_TTS_AUTO_READ_SETTINGS.scope,
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

/** 既定の Python インタプリタ（office / chroma と同じ導出） */
const DEFAULT_PYTHON_PATH = typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3';

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
  zhipu: boolean;
}

/** クォータ表示窓。'5h' = 5時間窓、'week' = 週間窓（Claude は sevenDay に対応） */
export type QuotaWindow = '5h' | 'week';

/** プロバイダ毎の表示窓設定（Kimi は 5h 固定・DeepSeek は残金表示のため対象外） */
export interface QuotaWindowSettings {
  zhipu: QuotaWindow;
  claude: QuotaWindow;
  minimax: QuotaWindow;
}

export const DEFAULT_QUOTA_WINDOWS: QuotaWindowSettings = {
  zhipu: '5h',
  claude: '5h',
  minimax: '5h',
};

export interface QuotaSettings {
  /** Claude Code の設定ファイル（LLM 情報の読み取り元） */
  claudeSettingsPath: string;
  /** DeepSeek API キー */
  deepseekApiKey: string;
  /** KIMI CODE API キー */
  kimiApiKey: string;
  /** MINIMAX API キー */
  minimaxApiKey: string;
  /** 智譜（Zhipu）API キー */
  zhipuApiKey: string;
  /** 智譜クォータ取得用 Python インタプリタ */
  zhipuPythonPath: string;
  /** 表示モデル個別ON/OFF（v0.5.0） */
  displayModels: QuotaDisplayFlags;
  /** 表示窓（5時間 / 週間） */
  windows: QuotaWindowSettings;
}

export const DEFAULT_QUOTA_DISPLAY_MODELS: QuotaDisplayFlags = {
  claude: true,
  deepseek: true,
  kimi: true,
  minimax: true,
  zhipu: true,
};

// === v0.17.0: MD保存ボタン設定 ===
export type MemoryScope = 'pair' | 'conversation';

export interface MemorySettings {
  /** MD保存ボタン全体の有効/無効（既定 true） */
  enabled: boolean;
  /** ツールバーボタンの保存範囲（既定 pair）。ブロックボタンは常に block */
  scope: MemoryScope;
  /** メモリフォルダ。相対= Vault 内 / 絶対= ファイルシステム（既定 'Memory/'） */
  folder: string;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  scope: 'pair',
  folder: 'Memory/',
};

export function normalizeMemorySettings(raw: unknown): MemorySettings {
  const r = (raw ?? {}) as Partial<MemorySettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_MEMORY_SETTINGS.enabled,
    scope: r.scope === 'conversation' ? 'conversation' : DEFAULT_MEMORY_SETTINGS.scope,
    folder: typeof r.folder === 'string' && r.folder.trim() !== '' ? r.folder : DEFAULT_MEMORY_SETTINGS.folder,
  };
}

export interface ClaudianBridgeSettings {
  general: {
    enabled: boolean;
    migratedFrom: { claudianSelectionBridge: boolean; extensionWhitelist: boolean; vaultOfficeBridge: boolean; chromaInspector: boolean; claudeTtsSettings: boolean };
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
    /** v0.10.0: Claude Code CLI 用 TTS 設定（voice-config.json と同期）。 */
    cli?: TtsCliSettings;
    /** v0.11.0: タスク終了時の自動読み上げ。 */
    autoRead?: TtsAutoReadSettings;
    /** v0.15.0: コールアウト（> [!type]）を読み上げ対象から除外するか。 */
    excludeCallouts?: boolean;
    /** v0.16.0: AI読み上げボタン（入力文をAIで整形して読み上げ）。 */
    inputAi?: { enabled: boolean };
    /** v0.18.0: エンジン別の1チャンク上限 */
    chunkMaxChars: TtsChunkMaxChars;
    /** v0.17.0: 読み上げタイプ別フィルタ（チェック=含めて読む） */
    speechFilter: TtsSpeechFilters;
  };
  office: OfficeSettings;
  whitelist: WhitelistSettings;
  chroma: ChromaSettings;
  memory: MemorySettings;
}

export const DEFAULT_CLAUDIAN_BRIDGE_SETTINGS: ClaudianBridgeSettings = {
  general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false, claudeTtsSettings: false }, migrationResetAvailable: true, quotaEnabled: false, quotaRefreshSec: 60, quotaSwitchSec: 5, codeCopyFence: true },
  quota: {
    claudeSettingsPath: defaultClaudeSettingsPath(),
    deepseekApiKey: '',
    kimiApiKey: '',
    minimaxApiKey: '',
    zhipuApiKey: '',
    zhipuPythonPath: DEFAULT_PYTHON_PATH,
    displayModels: { ...DEFAULT_QUOTA_DISPLAY_MODELS },
    windows: { ...DEFAULT_QUOTA_WINDOWS },
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
    cli: { ...DEFAULT_TTS_CLI_SETTINGS },
    autoRead: { ...DEFAULT_TTS_AUTO_READ_SETTINGS },
    excludeCallouts: true,
    inputAi: { enabled: true },
    chunkMaxChars: { edge: DEFAULT_EDGE_CHUNK_MAX_CHARS, webspeech: DEFAULT_CHUNK_MAX_CHARS, plachta: DEFAULT_CHUNK_MAX_CHARS },
    speechFilter: {
      selection: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
      autoRead: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
      message: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
      inputAi: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
    },
  },
  office: { ...DEFAULT_OFFICE_SETTINGS },
  whitelist: { ...DEFAULT_WHITELIST_SETTINGS },
  chroma: { ...DEFAULT_CHROMA_SETTINGS },
  memory: { ...DEFAULT_MEMORY_SETTINGS },
};

export function normalizeClaudianBridgeSettings(raw: unknown): ClaudianBridgeSettings {
  const r = (raw ?? {}) as Partial<ClaudianBridgeSettings>;
  // Backfill chroma defaults first so the clamping pass has a well-defined baseline.
  const chroma = normalizeChromaSettings(r.chroma);
  // Defensive clamp in case downstream callers manipulate r.chroma after the helper ran.
  // (This is a no-op for already-normalized data, but keeps the legacy migration contract intact.)
  chroma.defaultNResults = Math.max(MIN_QUERY_RESULTS, Math.min(MAX_QUERY_RESULTS, Math.round(chroma.defaultNResults)));
  chroma.recordPreviewLength = Math.max(MIN_PREVIEW_LENGTH, Math.min(MAX_PREVIEW_LENGTH, Math.round(chroma.recordPreviewLength)));
  const cli = normalizeTtsCliSettings(r.tts?.cli);
  const autoRead = normalizeTtsAutoReadSettings(r.tts?.autoRead);
  // v0.12.0: 旧 v0.11.1 からの整合化 — autoRead 未設定（旧構成）で full_text=true なら
  // scope=full に引き継ぐ（旧📖ボタンが ON だったユーザーの意図を尊重）。
  if (r.tts?.autoRead === undefined && cli.full_text && autoRead.scope !== 'full') {
    autoRead.scope = 'full';
  }
  return {
    general: {
      enabled: r.general?.enabled ?? true,
      migratedFrom: {
        claudianSelectionBridge: r.general?.migratedFrom?.claudianSelectionBridge ?? false,
        extensionWhitelist: r.general?.migratedFrom?.extensionWhitelist ?? false,
        vaultOfficeBridge: r.general?.migratedFrom?.vaultOfficeBridge ?? false,
        chromaInspector: r.general?.migratedFrom?.chromaInspector ?? false,
        claudeTtsSettings: r.general?.migratedFrom?.claudeTtsSettings ?? false,
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
      zhipuApiKey: typeof r.quota?.zhipuApiKey === 'string' ? r.quota.zhipuApiKey : '',
      zhipuPythonPath: typeof r.quota?.zhipuPythonPath === 'string' && r.quota.zhipuPythonPath.trim() !== ''
        ? r.quota.zhipuPythonPath
        : DEFAULT_PYTHON_PATH,
      displayModels: {
        claude: typeof r.quota?.displayModels?.claude === 'boolean' ? r.quota.displayModels.claude : true,
        deepseek: typeof r.quota?.displayModels?.deepseek === 'boolean' ? r.quota.displayModels.deepseek : true,
        kimi: typeof r.quota?.displayModels?.kimi === 'boolean' ? r.quota.displayModels.kimi : true,
        minimax: typeof r.quota?.displayModels?.minimax === 'boolean' ? r.quota.displayModels.minimax : true,
        zhipu: typeof r.quota?.displayModels?.zhipu === 'boolean' ? r.quota.displayModels.zhipu : true,
      },
      windows: {
        zhipu: r.quota?.windows?.zhipu === 'week' ? 'week' : '5h',
        claude: r.quota?.windows?.claude === 'week' ? 'week' : '5h',
        minimax: r.quota?.windows?.minimax === 'week' ? 'week' : '5h',
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
      cli,
      autoRead,
      excludeCallouts: typeof r.tts?.excludeCallouts === 'boolean' ? r.tts.excludeCallouts : true,
      inputAi: {
        enabled: typeof r.tts?.inputAi?.enabled === 'boolean' ? r.tts.inputAi.enabled : true,
      },
      chunkMaxChars: normalizeTtsChunkMaxChars(r.tts?.chunkMaxChars),
      speechFilter: normalizeTtsSpeechFilters(r),
    },
    office: normalizeOfficeSettings(r.office),
    whitelist: normalizeWhitelistSettings(r.whitelist),
    chroma,
    memory: normalizeMemorySettings(r.memory),
  };
}

function clampNum(v: unknown, min: number, max: number, def: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeTtsChunkMaxChars(raw: unknown): TtsChunkMaxChars {
  // v0.18.0: 既存 number（v0.17）は webspeech/plachta に引き継ぎ・edge は 500 に初期化
  const legacy = typeof raw === 'number' ? raw : undefined;
  const obj = (typeof raw === 'object' && raw !== null) ? raw as Partial<TtsChunkMaxChars> : {};
  return {
    edge: clampNum(obj.edge, EDGE_CHUNK_MAX_CHARS_MIN, EDGE_CHUNK_MAX_CHARS_MAX, DEFAULT_EDGE_CHUNK_MAX_CHARS),
    webspeech: clampNum(obj.webspeech, CHUNK_MAX_CHARS_MIN, CHUNK_MAX_CHARS_MAX, legacy ?? DEFAULT_CHUNK_MAX_CHARS),
    plachta: clampNum(obj.plachta, CHUNK_MAX_CHARS_MIN, CHUNK_MAX_CHARS_MAX, legacy ?? DEFAULT_CHUNK_MAX_CHARS),
  };
}

function normalizeSpeechFilterOptions(
  raw: Partial<SpeechFilterOptions> | undefined,
  legacy?: Partial<SpeechFilterOptions>,
): SpeechFilterOptions {
  const base = { ...DEFAULT_SPEECH_FILTER_OPTIONS };
  for (const k of Object.keys(base) as (keyof SpeechFilterOptions)[]) {
    // レガシー値（旧 cli.speech_filter / excludeCallouts 由来・ON=除去）を反転して反映。
    // undefined のキーはスキップ（!undefined === true の誤マッピングを防ぐ）。
    if (legacy && typeof legacy[k] === 'boolean') base[k] = !(legacy[k] as boolean);
    // 新フィールドの明示値はそのまま採用（不正な undefined はデフォルトのまま）
    if (raw && typeof raw[k] === 'boolean') base[k] = raw[k] as boolean;
  }
  return base;
}

function normalizeTtsSpeechFilters(r: { tts?: unknown }): TtsSpeechFilters {
  const tts = (r.tts ?? {}) as {
    speechFilter?: Partial<Record<TtsSpeechFilterSection, Partial<SpeechFilterOptions>>>;
    cli?: { speech_filter?: Partial<SpeechFilterOptions> };
    excludeCallouts?: unknown;
  };
  const hasNew = typeof tts.speechFilter === 'object' && tts.speechFilter !== null;
  // レガシー値を合成（undefined はスキップされるためそのまま含めて良い）。
  // excludeCallouts は旧値そのまま（ON=除去）を渡し、normalizeSpeechFilterOptions 側で反転する。
  const legacyCombined: Partial<SpeechFilterOptions> = {
    emoji: tts.cli?.speech_filter?.emoji,
    kaomoji: tts.cli?.speech_filter?.kaomoji,
    ascii_emoticon: tts.cli?.speech_filter?.ascii_emoticon,
    emoji_shortcode: tts.cli?.speech_filter?.emoji_shortcode,
    callout: typeof tts.excludeCallouts === 'boolean' ? tts.excludeCallouts : undefined,
  };
  const sections: TtsSpeechFilterSection[] = ['selection', 'autoRead', 'message', 'inputAi'];
  const out = {} as TtsSpeechFilters;
  for (const sec of sections) {
    const rawSec = hasNew ? tts.speechFilter?.[sec] : undefined;
    // 新フィールドが一部でも存在するタイプは新値優先、無ければレガシー値で初期化
    out[sec] = hasNew && rawSec !== undefined
      ? normalizeSpeechFilterOptions(rawSec, undefined)
      : normalizeSpeechFilterOptions(undefined, legacyCombined);
  }
  return out;
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
  if (cfg.tts.cli !== undefined) {
    if (typeof cfg.tts.cli.full_text !== 'boolean') return 'tts.cli.full_text は boolean である必要があります';
    if (!Number.isInteger(cfg.tts.cli.max_chars) || cfg.tts.cli.max_chars <= 0) return 'tts.cli.max_chars は正の整数である必要があります';
    if (!Number.isInteger(cfg.tts.cli.debounce_ms) || cfg.tts.cli.debounce_ms < 0) return 'tts.cli.debounce_ms は 0 以上の整数である必要があります';
    for (const k of ['emoji', 'kaomoji', 'ascii_emoticon', 'emoji_shortcode'] as const) {
      if (typeof cfg.tts.cli.speech_filter?.[k] !== 'boolean') return `tts.cli.speech_filter.${k} は boolean である必要があります`;
    }
  }
  if (cfg.tts.autoRead !== undefined) {
    if (typeof cfg.tts.autoRead.enabled !== 'boolean') return 'tts.autoRead.enabled は boolean である必要があります';
    if (cfg.tts.autoRead.scope !== 'header' && cfg.tts.autoRead.scope !== 'full') return `tts.autoRead.scope が未知です: ${cfg.tts.autoRead.scope}`;
  }
  if (cfg.tts.inputAi !== undefined && typeof cfg.tts.inputAi.enabled !== 'boolean') return 'tts.inputAi.enabled は boolean である必要があります';
  if (typeof cfg.tts.chunkMaxChars !== 'object' || cfg.tts.chunkMaxChars === null) return 'tts.chunkMaxChars はオブジェクトである必要があります';
  const chunkRanges: Record<keyof TtsChunkMaxChars, [number, number]> = {
    edge: [EDGE_CHUNK_MAX_CHARS_MIN, EDGE_CHUNK_MAX_CHARS_MAX],
    webspeech: [CHUNK_MAX_CHARS_MIN, CHUNK_MAX_CHARS_MAX],
    plachta: [CHUNK_MAX_CHARS_MIN, CHUNK_MAX_CHARS_MAX],
  };
  for (const k of ['edge', 'webspeech', 'plachta'] as const) {
    const [min, max] = chunkRanges[k];
    const v = cfg.tts.chunkMaxChars?.[k];
    if (typeof v !== 'number' || v < min || v > max) return `tts.chunkMaxChars.${k} は ${min}〜${max} の数値である必要があります`;
  }
  if (typeof cfg.tts.speechFilter !== 'object' || cfg.tts.speechFilter === null) return 'tts.speechFilter はオブジェクトである必要があります';
  for (const sec of ['selection', 'autoRead', 'message', 'inputAi'] as const) {
    const f = cfg.tts.speechFilter?.[sec];
    if (typeof f !== 'object' || f === null) return `tts.speechFilter.${sec} はオブジェクトである必要があります`;
    for (const k of ['emoji', 'kaomoji', 'ascii_emoticon', 'emoji_shortcode', 'callout', 'table', 'code', 'thinking'] as const) {
      if (typeof f[k] !== 'boolean') return `tts.speechFilter.${sec}.${k} は boolean である必要があります`;
    }
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
  if (typeof cfg.memory?.enabled !== 'boolean') return 'memory.enabled は boolean である必要があります';
  if (cfg.memory?.scope !== 'pair' && cfg.memory?.scope !== 'conversation') return `memory.scope が未知です: ${cfg.memory?.scope}`;
  if (typeof cfg.memory?.folder !== 'string') return 'memory.folder は文字列である必要があります';
  if (typeof cfg.quota?.claudeSettingsPath !== 'string') return 'quota.claudeSettingsPath は文字列である必要があります';
  if (typeof cfg.quota?.deepseekApiKey !== 'string') return 'quota.deepseekApiKey は文字列である必要があります';
  if (typeof cfg.quota?.kimiApiKey !== 'string') return 'quota.kimiApiKey は文字列である必要があります';
  if (typeof cfg.quota?.minimaxApiKey !== 'string') return 'quota.minimaxApiKey は文字列である必要があります';
  if (typeof cfg.quota?.zhipuApiKey !== 'string') return 'quota.zhipuApiKey は文字列である必要があります';
  if (typeof cfg.quota?.zhipuPythonPath !== 'string') return 'quota.zhipuPythonPath は文字列である必要があります';
  for (const k of ['claude', 'deepseek', 'kimi', 'minimax', 'zhipu'] as const) {
    if (typeof cfg.quota?.displayModels?.[k] !== 'boolean') return `quota.displayModels.${k} は boolean である必要があります`;
  }
  for (const k of ['zhipu', 'claude', 'minimax'] as const) {
    if (cfg.quota?.windows?.[k] !== '5h' && cfg.quota?.windows?.[k] !== 'week') return `quota.windows.${k} は 5h または week である必要があります`;
  }
  return null;
}

// === v0.12.0: 全文読み上げ状態の統一同期ヘルパー ===
/**
 * 全文読み上げ状態を autoRead.scope と cli.full_text に同時反映する。
 * 不変条件: scope === 'full' ⟺ full_text === true
 */
export function withFullTextState(cfg: ClaudianBridgeSettings, fullText: boolean): ClaudianBridgeSettings {
  return {
    ...cfg,
    tts: {
      ...cfg.tts,
      autoRead: { ...(cfg.tts.autoRead ?? DEFAULT_TTS_AUTO_READ_SETTINGS), scope: fullText ? 'full' : 'header' },
      cli: { ...(cfg.tts.cli ?? DEFAULT_TTS_CLI_SETTINGS), full_text: fullText },
    },
  };
}

/** 現在の全文読み上げ状態を autoRead.scope から判定 */
export function isFullTextState(cfg: ClaudianBridgeSettings): boolean {
  return (cfg.tts.autoRead?.scope ?? DEFAULT_TTS_AUTO_READ_SETTINGS.scope) === 'full';
}
