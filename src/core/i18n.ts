import { moment } from 'obsidian';

export type SupportedLocale = 'ja' | 'zh' | 'en';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['ja', 'zh', 'en'];

export interface LocaleStrings {
  tabGeneral: string;
  tabSelection: string;
  tabTts: string;
  tabOffice: string;
  tabWhitelist: string;
  tabQuota: string;
  settingsTitle: string;
  noticeSaved: string;
  noticeSaveFailed: string;
  generalEnabled: string;
  generalEnabledDesc: string;
  selectionEnabled: string;
  selectionEnabledDesc: string;
  selectionFolderEnabled: string;
  selectionFolderEnabledDesc: string;
  selectionDelayMs: string;
  selectionDelayMsDesc: string;
  objectMenuHeading: string;
  objectMenuEnabled: string;
  objectMenuEnabledDesc: string;
  objectMenuExcludeHeading: string;
  objectMenuExcludeDesc: string;
  objectMenuExcludePlaceholder: string;
  objectMenuExcludeButton: string;
  objectMenuExcludeEmpty: string;
  objectMenuTypeHeading: string;
  objectMenuTypeDesc: string;
  objectMenuTypeButton: string;
  objectMenuTypeInput: string;
  objectMenuTypeLink: string;
  objectMenuTypeElement: string;
  objectMenuContextHeading: string;
  objectMenuContextDesc: string;
  objectMenuContextRibbon: string;
  objectMenuContextSidebar: string;
  objectMenuContextModal: string;
  objectMenuContextSettings: string;
  objectMenuContextMenu: string;
  objectMenuContextWorkspace: string;
  ttsEnabled: string;
  ttsEnabledDesc: string;
  ttsEngine: string;
  ttsEngineDesc: string;
  ttsEngineEdge: string;
  ttsEngineWebspeech: string;
  ttsEnginePlachta: string;
  ttsTestSample: string;
  ttsTestButton: string;
  ttsVoicesHint: string;
  ttsVoiceZh: string;
  ttsVoiceJa: string;
  ttsVoiceEn: string;
  ttsBrowserDefault: string;
  ttsMinimaxRemovalNote: string;
  ttsPlachtaPreset: string;
  ttsPlachtaSpeaker: string;
  ttsPlachtaLanguage: string;
  ttsPlachtaSpeed: string;
  ttsPlachtaTest: string;
  ttsPlachtaOffline: string;
  ttsPlachtaTimeout: string;
  ttsPlachtaTooLong: string;
  resetMigration: string;
  resetMigrationDesc: string;
  resetMigrationButton: string;
  resetMigrationNotice: string;
  migratedFrom: string;
  notMigrated: string;
  migrated: string;
  officeEnabled: string;
  officeEnabledDesc: string;
  officePythonPath: string;
  officePythonPathDesc: string;
  officeEnabledExtensions: string;
  officeEnabledExtensionsDesc: string;
  officeConflictPolicy: string;
  officeConflictPolicyDesc: string;
  officeConflictOverwrite: string;
  officeConflictSkip: string;
  officeConflictTimestamp: string;
  officeFrontmatterTemplate: string;
  officeFrontmatterTemplateDesc: string;
  officeOutputDirOverride: string;
  officeOutputDirOverrideDesc: string;
  officeShowProgressModal: string;
  officeShowProgressModalDesc: string;
  // Office / Whitelist プレースホルダー
  comingSoon: string;
  whitelistEnabled: string;
  whitelistEnabledDesc: string;
  whitelistExtensionsHeading: string;
  whitelistExtensionsDesc: string;
  whitelistAddExtension: string;
  whitelistAddExtensionDesc: string;
  whitelistAddExtensionPlaceholder: string;
  whitelistAddExtensionButton: string;
  whitelistPresetsHeading: string;
  whitelistPresetsDesc: string;
  whitelistApplyButton: string;
  whitelistAlwaysShowFolders: string;
  whitelistAlwaysShowFoldersDesc: string;
  whitelistAllFilesShown: string;
  whitelistOptionsHeading: string;
  whitelistReset: string;
  whitelistResetDesc: string;
  whitelistResetButton: string;
  // Chroma Inspector (P5 統合)
  tabChroma: string;
  chromaEnabled: string;
  chromaEnabledDesc: string;
  chromaDisabledNotice: string;
  chromaDescription: string;
  chromaChromaPath: string;
  chromaChromaPathDesc: string;
  chromaPythonPath: string;
  chromaPythonPathDesc: string;
  chromaScriptPath: string;
  chromaScriptPathDesc: string;
  chromaEmbeddingModel: string;
  chromaEmbeddingModelDesc: string;
  chromaDefaultNResults: string;
  chromaDefaultNResultsDesc: string;
  chromaRecordPreviewLength: string;
  chromaRecordPreviewLengthDesc: string;
  chromaShowProgressModal: string;
  chromaShowProgressModalDesc: string;
  chromaEnableRawSql: string;
  chromaEnableRawSqlDesc: string;
  chromaTestConnection: string;
  chromaTestOk: string; // {n}
  chromaResolvedPath: string; // {path}
  chromaScriptInfo: string; // {script}
  quotaEnabled: string;
  quotaEnabledDesc: string;
  quotaRefreshSec: string;
  quotaRefreshSecDesc: string;
  quotaFetching: string;
  quotaNotLoggedIn: string;
  quotaError: string;
  quotaUnsupportedMobile: string;
  quotaRefresh: string;
  quotaWindow5h: string;
  quotaWindow7d: string;
  // v0.4.0: Multi-provider quota switch interval
  quotaSwitchSec: string;
  quotaSwitchSecDesc: string;
  quotaNoProvider: string;
  // LLM 残量検出タブ (v0.5.0)
  quotaLlmHeading: string;
  quotaLlmDesc: string;
  quotaClaudeSettingsPath: string;
  quotaClaudeSettingsPathDesc: string;
  quotaCurrentLlm: string;
  quotaCurrentLlmEmpty: string;
  quotaProvider: string;
  quotaModel: string;
  quotaBaseUrl: string;
  quotaApiKeysHeading: string;
  quotaApiKeysDesc: string;
  quotaDeepseekApiKey: string;
  quotaKimiApiKey: string;
  quotaMinimaxApiKey: string;
  quotaApiKeyPlaceholder: string;
  quotaTestConnection: string;
  quotaTestOk: string;
  quotaTestFail: string;
  quotaSafe: string;
  quotaCaution: string;
  quotaDanger: string;
  quotaColorUnknown: string;
  quotaDeepseekValue: string;
  quotaKimiValue: string;
  quotaMinimaxValue: string;
  quotaRefreshAll: string;
  quotaDisplayModelsHeading: string;
  quotaDisplayModelsDesc: string;
  quotaDisplayClaude: string;
  quotaDisplayDeepseek: string;
  quotaDisplayKimi: string;
  quotaDisplayMinimax: string;
}

export const STRINGS: Record<SupportedLocale, LocaleStrings> = {
  ja: {
    tabGeneral: '🎛️ 一般',
    tabSelection: '📝 テキスト挿入',
    tabTts: '🔊 テキスト読み上げ',
    tabOffice: '📄 ファイル変換',
    tabWhitelist: '🗂️ 拡張子フィルタ',
    tabQuota: '🤖 LLM 残量',
    settingsTitle: 'Claudian Bridge',
    noticeSaved: '✅ 保存しました',
    noticeSaveFailed: '⚠️ 保存失敗: {msg}',
    generalEnabled: '🌐 プラグイン有効化',
    generalEnabledDesc: 'Claudian Bridge 全体を ON/OFF',
    selectionEnabled: '🌐 機能 ON/OFF',
    selectionEnabledDesc: '選択テキストを Claudian 入力に挿入する機能を有効化',
    selectionFolderEnabled: '📁 フォルダ右クリック追加',
    selectionFolderEnabledDesc: 'フォルダを右クリック → Add to Claudian を有効化',
    selectionDelayMs: '⏱️ ポップアップ遅延 (ms)',
    selectionDelayMsDesc: '選択後フローティングボタンが表示されるまでの遅延',
    objectMenuHeading: '🖱️ オブジェクト右クリックメニュー',
    objectMenuEnabled: '✅ 有効化',
    objectMenuEnabledDesc: '画像・リンク・コードブロックなどのオブジェクトを右クリックして Claudian に送信',
    objectMenuExcludeHeading: '🚫 除外セレクタ',
    objectMenuExcludeDesc: '右クリックメニューを表示しない要素の CSS セレクタ',
    objectMenuExcludePlaceholder: '例: .my-class',
    objectMenuExcludeButton: '＋ 追加',
    objectMenuExcludeEmpty: '（除外セレクタは未設定です）',
    objectMenuTypeHeading: '🧩 対象とする部品種別',
    objectMenuTypeDesc: '右クリックメニューを表示する UI 部品の種類',
    objectMenuTypeButton: 'ボタン・メニュー項目',
    objectMenuTypeInput: '入力欄・チェックボックス',
    objectMenuTypeLink: 'リンク',
    objectMenuTypeElement: 'その他の要素',
    objectMenuContextHeading: '📍 対象とする配置場所',
    objectMenuContextDesc: '右クリックメニューを表示する画面の場所',
    objectMenuContextRibbon: 'リボン（上部ツールバー）',
    objectMenuContextSidebar: 'サイドバー',
    objectMenuContextModal: 'モーダル・ダイアログ',
    objectMenuContextSettings: '設定画面',
    objectMenuContextMenu: 'コンテキストメニュー内',
    objectMenuContextWorkspace: 'ワークスペース全般',
    ttsEnabled: '🌐 機能 ON/OFF',
    ttsEnabledDesc: 'Add to TTS を有効化',
    ttsEngine: '🔊 TTS エンジン',
    ttsEngineDesc: '音声合成エンジンを選択（edge-TTS / WebSpeech の 2 択）',
    ttsEngineEdge: 'edge-TTS（クラウド・高品質）',
    ttsEngineWebspeech: 'WebSpeech（ブラウザ標準）',
    ttsEnginePlachta: 'Plachta VITS（クラウド）',
    ttsTestSample: '今日は天気がいい。山に登りたい。',
    ttsTestButton: '🔊 テスト再生',
    ttsVoicesHint: '選択中エンジンの音色。エンジンを切り替えると内容も切り替わります',
    ttsVoiceZh: '中国語 (zh)',
    ttsVoiceJa: '日本語 (ja)',
    ttsVoiceEn: '英語 (en)',
    ttsBrowserDefault: 'ブラウザ標準',
    ttsMinimaxRemovalNote: 'ℹ️ 旧バージョンに存在した MiniMax 接続設定は、接続テスト失敗のため本バージョンから削除されました。',
    ttsPlachtaPreset: 'クイック選択',
    ttsPlachtaSpeaker: 'キャラクター',
    ttsPlachtaLanguage: '言語',
    ttsPlachtaSpeed: '速度',
    ttsPlachtaTest: '▶ テスト読み上げ（Plachta）',
    ttsPlachtaOffline: '⚠️ ネット接続を確認してください',
    ttsPlachtaTimeout: '⚠️ タイムアウト（60秒）',
    ttsPlachtaTooLong: '⚠️ テキストが長いです',
    resetMigration: '🔄 旧設定をやり直す',
    resetMigrationDesc: '旧プラグインの data.json から再取り込み（実行後に Obsidian を再起動）',
    resetMigrationButton: '🔄 移行リセット',
    resetMigrationNotice: '🔄 移行リセット完了。Obsidian を再起動してください。',
    migratedFrom: '旧プラグイン移行状態',
    notMigrated: '⏳ 未移行',
    migrated: '✅ 移行済み',
    // ja
    officeEnabled: '🌐 機能 ON/OFF',
    officeEnabledDesc: 'Office/PDF/HTML/CSV → Markdown 変換を有効化',
    officePythonPath: 'Python Path',
    officePythonPathDesc: 'markitdown を呼ぶ Python 実行ファイル（例: py / python3 / フルパス）',
    officeEnabledExtensions: '有効拡張子（カンマ区切り）',
    officeEnabledExtensionsDesc: '右クリックメニューを表示する拡張子',
    officeConflictPolicy: '同名 .md 衝突時',
    officeConflictPolicyDesc: '出力先に同名 Markdown がある場合の挙動',
    officeConflictOverwrite: '上書き',
    officeConflictSkip: 'スキップ',
    officeConflictTimestamp: 'タイムスタンプ付与',
    officeFrontmatterTemplate: 'Frontmatter Template',
    officeFrontmatterTemplateDesc: 'プレースホルダ: {{title}} / {{sourcePath}} / {{date}} / {{ext}} / {{sizeBytes}} / {{sha256}}',
    officeOutputDirOverride: '出力ディレクトリ（任意・空なら元と同階層）',
    officeOutputDirOverrideDesc: '変換結果の .md を保存する絶対パス',
    officeShowProgressModal: '進捗モーダルを表示',
    officeShowProgressModalDesc: '変換中に進捗・ログを表示するモーダル',
    // ja
    whitelistEnabled: '✅ 有効化',
    whitelistEnabledDesc: '拡張子フィルターのON/OFF',
    whitelistExtensionsHeading: '📋 許可する拡張子',
    whitelistExtensionsDesc: 'ここに登録した拡張子のファイルだけが左側一覧に表示されます',
    whitelistAddExtension: '追加する拡張子',
    whitelistAddExtensionDesc: 'ドットなしで入力（例: json, yaml, js）',
    whitelistAddExtensionPlaceholder: '拡張子名',
    whitelistAddExtensionButton: '＋ 追加',
    whitelistPresetsHeading: '🎯 プリセット',
    whitelistPresetsDesc: '現在のリストに追加する形式です。「ALL」はフィルターを解除します。',
    whitelistApplyButton: '適用',
    whitelistAlwaysShowFolders: '📁 フォルダは常に表示',
    whitelistAlwaysShowFoldersDesc: 'フォルダをフィルター対象外とする',
    whitelistAllFilesShown: '（すべてのファイルが表示されます）',
    whitelistOptionsHeading: '⚙️ オプション',
    whitelistReset: '🔄 デフォルトにリセット',
    whitelistResetDesc: 'すべての設定を初期状態に戻します',
    whitelistResetButton: 'リセット',
    comingSoon: '🚧 このタブは次サブプロジェクト（P3/P4）で実装予定です。',
    // Chroma Inspector (P5 統合)
    tabChroma: '🗄️ Chroma ブラウザ',
    chromaEnabled: '🌐 Chroma 機能を有効化',
    chromaEnabledDesc: 'Chroma ブラウザ (リボン / コマンド) とこの設定画面の利用全体を ON/OFF',
    chromaDisabledNotice: '🔒 Chroma 機能は無効です。上のトグルを ON にすると設定項目とブラウザが利用可能になります。',
    chromaDescription: 'ChromaDB のコレクション閲覧・検索・詳細表示。Python CLI (_chroma_inspect.py) を Vault ルートから呼び出します。',
    chromaChromaPath: 'ChromaDB パス',
    chromaChromaPathDesc: 'Vault 相対または絶対パス。デフォルト: chroma_db',
    chromaPythonPath: 'Python インタプリタ',
    chromaPythonPathDesc: 'Windows: "py" / macOS・Linux: "python3"',
    chromaScriptPath: 'Python スクリプトパス (上書き)',
    chromaScriptPathDesc: '空欄 = <vault>/_chroma_inspect.py',
    chromaEmbeddingModel: '埋め込みモデル',
    chromaEmbeddingModelDesc: '意味検索（セマンティック検索）に使われます。コレクション作成時に使ったモデルと同じものを指定してください。空欄の場合は文書内検索として動作します。',
    chromaDefaultNResults: 'デフォルト取得件数',
    chromaDefaultNResultsDesc: '1〜100。デフォルト 5。',
    chromaRecordPreviewLength: 'レコードプレビュー長 (文字)',
    chromaRecordPreviewLengthDesc: '20〜10000。デフォルト 240。',
    chromaShowProgressModal: '長時間処理で進捗モーダルを表示',
    chromaShowProgressModalDesc: 'Chroma 操作中に進捗・ログを表示するモーダル',
    chromaEnableRawSql: 'Raw SQL を有効化 (Advanced)',
    chromaEnableRawSqlDesc: 'ON にすると Database Browser に SELECT 専用の SQL モーダルが表示されます。読み取り専用ですが USE WITH CARE。',
    chromaTestConnection: '接続テスト',
    chromaTestOk: '✅ OK — {n} 件のコレクション',
    chromaResolvedPath: '解決済み ChromaDB: {path}',
    chromaScriptInfo: 'Python スクリプト: {script}',
    quotaEnabled: 'LLM 残量検出',
    quotaEnabledDesc: 'Claude Code および各 LLM プロバイダの利用状況を表示します（デスクトップのみ）',
    quotaRefreshSec: 'データ収集周期（秒）',
    quotaRefreshSecDesc: '10〜600。0 で無効化',
    quotaFetching: '読み込み中…',
    quotaNotLoggedIn: 'Claude Code に未ログインです',
    quotaError: '残量取得に失敗しました',
    quotaUnsupportedMobile: '残量検出はデスクトップでのみ利用可能です',
    quotaRefresh: '残量を更新',
    quotaWindow5h: '5時間',
    quotaWindow7d: '7日間',
    quotaSwitchSec: '表示モデル切替周期（秒）',
    quotaSwitchSecDesc: '5〜600 の範囲。各プロバイダの表示時間',
    quotaNoProvider: '残量対象なし',
    // LLM 残量検出タブ (v0.5.0)
    quotaLlmHeading: '🤖 LLM 残量検出',
    quotaLlmDesc: 'Claude Code の設定ファイルと各 LLM プロバイダの API キーから残量を取得・表示します。',
    quotaClaudeSettingsPath: 'Claude Code 設定ファイル',
    quotaClaudeSettingsPathDesc: '現在の LLM（プロバイダ・モデル）情報の読み取り元',
    quotaCurrentLlm: '現在の LLM',
    quotaCurrentLlmEmpty: '（未検出）',
    quotaProvider: 'プロバイダ',
    quotaModel: 'モデル',
    quotaBaseUrl: 'Base URL',
    quotaApiKeysHeading: '🔑 API キー',
    quotaApiKeysDesc: '各 LLM の API キーを入力し、「接続テスト」で成功したモデルの残量を表示します。',
    quotaDeepseekApiKey: 'DeepSeek API キー',
    quotaKimiApiKey: 'KIMI CODE API キー',
    quotaMinimaxApiKey: 'MINIMAX API キー',
    quotaApiKeyPlaceholder: 'sk-...',
    quotaTestConnection: '接続テスト',
    quotaTestOk: '✅ 接続OK',
    quotaTestFail: '❌ 接続失敗: {msg}',
    quotaSafe: '安全',
    quotaCaution: '注意',
    quotaDanger: '危険',
    quotaColorUnknown: 'データなし',
    quotaDeepseekValue: 'CNY 残金',
    quotaKimiValue: '5時間使用量',
    quotaMinimaxValue: '5時間使用量',
    quotaRefreshAll: '🔄 全プロバイダ更新',
    quotaDisplayModelsHeading: '🖥️ 表示モデル',
    quotaDisplayModelsDesc: '表示するモデルを個別に ON/OFF。接続テストに失敗したモデルは表示されません。',
    quotaDisplayClaude: 'Claude を表示',
    quotaDisplayDeepseek: 'DeepSeek を表示',
    quotaDisplayKimi: 'KIMI CODE を表示',
    quotaDisplayMinimax: 'MINIMAX を表示',
  },
  en: {
    tabGeneral: '🎛️ General',
    tabSelection: '📝 Text Insertion',
    tabTts: '🔊 Text To Speech',
    tabOffice: '📄 File Conversion',
    tabWhitelist: '🗂️ Extension Filter',
    tabQuota: '🤖 LLM Quota',
    settingsTitle: 'Claudian Bridge',
    noticeSaved: '✅ Saved',
    noticeSaveFailed: '⚠️ Save failed: {msg}',
    generalEnabled: '🌐 Enable Plugin',
    generalEnabledDesc: 'Toggle Claudian Bridge globally',
    selectionEnabled: '🌐 Enable Feature',
    selectionEnabledDesc: 'Insert selected text into Claudian input',
    selectionFolderEnabled: '📁 Folder right-click add',
    selectionFolderEnabledDesc: 'Enable right-click → Add to Claudian on folders',
    selectionDelayMs: '⏱️ Popup delay (ms)',
    selectionDelayMsDesc: 'Delay before the floating button appears after selection',
    objectMenuHeading: '🖱️ Object context menu',
    objectMenuEnabled: '✅ Enable',
    objectMenuEnabledDesc: 'Right-click objects like images, links, code blocks to send to Claudian',
    objectMenuExcludeHeading: '🚫 Exclude selectors',
    objectMenuExcludeDesc: 'CSS selectors for elements that should not show the context menu',
    objectMenuExcludePlaceholder: 'e.g. .my-class',
    objectMenuExcludeButton: '+ Add',
    objectMenuExcludeEmpty: '(No exclude selectors set)',
    objectMenuTypeHeading: '🧩 Component types',
    objectMenuTypeDesc: 'UI component types that show the context menu',
    objectMenuTypeButton: 'Buttons / menu items',
    objectMenuTypeInput: 'Inputs / checkboxes',
    objectMenuTypeLink: 'Links',
    objectMenuTypeElement: 'Other elements',
    objectMenuContextHeading: '📍 Contexts',
    objectMenuContextDesc: 'Screen locations that show the context menu',
    objectMenuContextRibbon: 'Ribbon (top toolbar)',
    objectMenuContextSidebar: 'Sidebar',
    objectMenuContextModal: 'Modal / dialog',
    objectMenuContextSettings: 'Settings',
    objectMenuContextMenu: 'Inside context menus',
    objectMenuContextWorkspace: 'Workspace general',
    ttsEnabled: '🌐 Enable Feature',
    ttsEnabledDesc: 'Enable Add to TTS',
    ttsEngine: '🔊 TTS Engine',
    ttsEngineDesc: 'Select the speech synthesis engine (edge-TTS / WebSpeech)',
    ttsEngineEdge: 'edge-TTS (cloud, high quality)',
    ttsEngineWebspeech: 'WebSpeech (browser default)',
    ttsEnginePlachta: 'Plachta VITS (Cloud)',
    ttsTestSample: "The weather is nice today. I'd like to climb a mountain.",
    ttsTestButton: '🔊 Test voice',
    ttsVoicesHint: 'Voices for the selected engine. Switching engines swaps the dropdowns.',
    ttsVoiceZh: 'Chinese (zh)',
    ttsVoiceJa: 'Japanese (ja)',
    ttsVoiceEn: 'English (en)',
    ttsBrowserDefault: 'Browser default',
    ttsMinimaxRemovalNote: 'ℹ️ MiniMax settings from older versions have been removed (connection test failed).',
    ttsPlachtaPreset: 'Quick Preset',
    ttsPlachtaSpeaker: 'Character',
    ttsPlachtaLanguage: 'Language',
    ttsPlachtaSpeed: 'Speed',
    ttsPlachtaTest: '▶ Test reading (Plachta)',
    ttsPlachtaOffline: '⚠️ Check network',
    ttsPlachtaTimeout: '⚠️ Timeout (60s)',
    ttsPlachtaTooLong: '⚠️ Text too long',
    resetMigration: '🔄 Re-import Legacy Settings',
    resetMigrationDesc: 'Re-import from legacy plugin data.json (requires Obsidian restart)',
    resetMigrationButton: '🔄 Reset Migration',
    resetMigrationNotice: '🔄 Migration reset. Please restart Obsidian.',
    migratedFrom: 'Legacy plugin migration status',
    notMigrated: '⏳ Not migrated',
    migrated: '✅ Migrated',
    // en
    officeEnabled: '🌐 Enable Feature',
    officeEnabledDesc: 'Enable Office/PDF/HTML/CSV → Markdown conversion',
    officePythonPath: 'Python Path',
    officePythonPathDesc: 'Python executable for markitdown (e.g. py / python3 / full path)',
    officeEnabledExtensions: 'Enabled extensions (comma-separated)',
    officeEnabledExtensionsDesc: 'Extensions that show the context menu',
    officeConflictPolicy: 'On conflicting .md name',
    officeConflictPolicyDesc: 'Behavior when output Markdown already exists',
    officeConflictOverwrite: 'Overwrite',
    officeConflictSkip: 'Skip',
    officeConflictTimestamp: 'Add timestamp',
    officeFrontmatterTemplate: 'Frontmatter Template',
    officeFrontmatterTemplateDesc: 'Placeholders: {{title}} / {{sourcePath}} / {{date}} / {{ext}} / {{sizeBytes}} / {{sha256}}',
    officeOutputDirOverride: 'Output directory (optional, empty = same folder)',
    officeOutputDirOverrideDesc: 'Absolute path to save converted .md files',
    officeShowProgressModal: 'Show progress modal',
    officeShowProgressModalDesc: 'Show a progress/log modal during conversion',
    // en
    whitelistEnabled: '✅ Enable',
    whitelistEnabledDesc: 'Toggle the extension filter',
    whitelistExtensionsHeading: '📋 Allowed extensions',
    whitelistExtensionsDesc: 'Only files with these extensions appear in the file list',
    whitelistAddExtension: 'Add extension',
    whitelistAddExtensionDesc: 'Enter without dot (e.g. json, yaml, js)',
    whitelistAddExtensionPlaceholder: 'extension',
    whitelistAddExtensionButton: '+ Add',
    whitelistPresetsHeading: '🎯 Presets',
    whitelistPresetsDesc: 'Adds these to your current list. "ALL" disables the filter.',
    whitelistApplyButton: 'Apply',
    whitelistAlwaysShowFolders: '📁 Always show folders',
    whitelistAlwaysShowFoldersDesc: 'Folders are not affected by the filter',
    whitelistAllFilesShown: '（All files are shown）',
    whitelistOptionsHeading: '⚙️ Options',
    whitelistReset: '🔄 Reset to default',
    whitelistResetDesc: 'Restore all settings to defaults',
    whitelistResetButton: 'Reset',
    comingSoon: '🚧 This tab will be implemented in the next sub-project (P3/P4).',
    // Chroma Inspector (P5 integration)
    tabChroma: '🗄️ Chroma Browser',
    chromaEnabled: '🌐 Enable Chroma Feature',
    chromaEnabledDesc: 'Master switch for the Chroma browser (ribbon / command) and this settings tab',
    chromaDisabledNotice: '🔒 Chroma feature is disabled. Toggle ON above to expose settings and the browser.',
    chromaDescription: 'Browse, search and inspect ChromaDB collections. The Python CLI (_chroma_inspect.py) is invoked from the Vault root.',
    chromaChromaPath: 'ChromaDB path',
    chromaChromaPathDesc: 'Vault-relative or absolute. Default: chroma_db',
    chromaPythonPath: 'Python interpreter',
    chromaPythonPathDesc: 'Windows: "py" / macOS & Linux: "python3"',
    chromaScriptPath: 'Python script path (override)',
    chromaScriptPathDesc: 'Empty = <vault>/_chroma_inspect.py',
    chromaEmbeddingModel: 'Embedding model',
    chromaEmbeddingModelDesc: 'Used for semantic search. Specify the same model used when the collection was created. Empty = document search only.',
    chromaDefaultNResults: 'Default result count',
    chromaDefaultNResultsDesc: '1–100. Default 5.',
    chromaRecordPreviewLength: 'Record preview length (chars)',
    chromaRecordPreviewLengthDesc: '20–10000. Default 240.',
    chromaShowProgressModal: 'Show progress modal during long operations',
    chromaShowProgressModalDesc: 'Show a progress/log modal during Chroma operations',
    chromaEnableRawSql: 'Enable raw SQL (Advanced)',
    chromaEnableRawSqlDesc: 'When on, the Database Browser exposes a SELECT-only SQL modal. Read-only by design, but USE WITH CARE.',
    chromaTestConnection: 'Test connection',
    chromaTestOk: '✅ OK — {n} collection(s)',
    chromaResolvedPath: 'Resolved ChromaDB: {path}',
    chromaScriptInfo: 'Python script: {script}',
    quotaEnabled: 'LLM quota detection',
    quotaEnabledDesc: 'Show usage for Claude Code and each LLM provider (desktop only)',
    quotaRefreshSec: 'Data collection interval (sec)',
    quotaRefreshSecDesc: '10–600 seconds. 0 disables.',
    quotaFetching: 'Fetching…',
    quotaNotLoggedIn: 'Not logged in to Claude Code',
    quotaError: 'Failed to fetch quota',
    quotaUnsupportedMobile: 'Quota detection is desktop-only',
    quotaRefresh: 'Refresh quota',
    quotaWindow5h: '5h',
    quotaWindow7d: '7d',
    quotaSwitchSec: 'Display model switch interval (sec)',
    quotaSwitchSecDesc: '5–600 seconds per provider',
    quotaNoProvider: 'No provider configured',
    // LLM quota tab (v0.5.0)
    quotaLlmHeading: '🤖 LLM Quota Detection',
    quotaLlmDesc: 'Reads the current LLM from the Claude Code settings file and fetches remaining quota from each configured provider API key.',
    quotaClaudeSettingsPath: 'Claude Code settings file',
    quotaClaudeSettingsPathDesc: 'Source for current LLM (provider/model) info',
    quotaCurrentLlm: 'Current LLM',
    quotaCurrentLlmEmpty: '(not detected)',
    quotaProvider: 'Provider',
    quotaModel: 'Model',
    quotaBaseUrl: 'Base URL',
    quotaApiKeysHeading: '🔑 API Keys',
    quotaApiKeysDesc: 'Enter each LLM API key. Providers that pass the connection test show their remaining quota.',
    quotaDeepseekApiKey: 'DeepSeek API key',
    quotaKimiApiKey: 'KIMI CODE API key',
    quotaMinimaxApiKey: 'MINIMAX API key',
    quotaApiKeyPlaceholder: 'sk-...',
    quotaTestConnection: 'Test connection',
    quotaTestOk: '✅ Connection OK',
    quotaTestFail: '❌ Connection failed: {msg}',
    quotaSafe: 'Safe',
    quotaCaution: 'Caution',
    quotaDanger: 'Danger',
    quotaColorUnknown: 'No data',
    quotaDeepseekValue: 'CNY balance',
    quotaKimiValue: '5h usage',
    quotaMinimaxValue: '5h usage',
    quotaRefreshAll: '🔄 Refresh all',
    quotaDisplayModelsHeading: '🖥️ Display models',
    quotaDisplayModelsDesc: 'Individually enable/disable models. Models that fail the connection test are not shown.',
    quotaDisplayClaude: 'Show Claude',
    quotaDisplayDeepseek: 'Show DeepSeek',
    quotaDisplayKimi: 'Show KIMI CODE',
    quotaDisplayMinimax: 'Show MINIMAX',
  },
  zh: {
    tabGeneral: '🎛️ 一般',
    tabSelection: '📝 文本插入',
    tabTts: '🔊 文本朗读',
    tabOffice: '📄 文件转换',
    tabWhitelist: '🗂️ 扩展名过滤',
    tabQuota: '🤖 LLM 额度',
    settingsTitle: 'Claudian Bridge',
    noticeSaved: '✅ 已写入',
    noticeSaveFailed: '⚠️ 写入失败: {msg}',
    generalEnabled: '🌐 启用插件',
    generalEnabledDesc: '全局开关 Claudian Bridge',
    selectionEnabled: '🌐 启用功能',
    selectionEnabledDesc: '将选中文本插入 Claudian 输入框',
    selectionFolderEnabled: '📁 文件夹右键添加',
    selectionFolderEnabledDesc: '启用文件夹右键 → Add to Claudian',
    selectionDelayMs: '⏱️ 弹窗延迟 (毫秒)',
    selectionDelayMsDesc: '选中后到悬浮按钮出现的延迟',
    objectMenuHeading: '🖱️ 对象右键菜单',
    objectMenuEnabled: '✅ 启用',
    objectMenuEnabledDesc: '右键图片、链接、代码块等对象发送到 Claudian',
    objectMenuExcludeHeading: '🚫 排除选择器',
    objectMenuExcludeDesc: '不显示右键菜单的元素的 CSS 选择器',
    objectMenuExcludePlaceholder: '例如 .my-class',
    objectMenuExcludeButton: '＋ 添加',
    objectMenuExcludeEmpty: '（未设置排除选择器）',
    objectMenuTypeHeading: '🧩 组件类型',
    objectMenuTypeDesc: '显示右键菜单的 UI 组件类型',
    objectMenuTypeButton: '按钮 / 菜单项',
    objectMenuTypeInput: '输入框 / 复选框',
    objectMenuTypeLink: '链接',
    objectMenuTypeElement: '其他元素',
    objectMenuContextHeading: '📍 所在位置',
    objectMenuContextDesc: '显示右键菜单的界面位置',
    objectMenuContextRibbon: '功能区（顶部工具栏）',
    objectMenuContextSidebar: '侧边栏',
    objectMenuContextModal: '弹窗 / 对话框',
    objectMenuContextSettings: '设置界面',
    objectMenuContextMenu: '右键菜单内部',
    objectMenuContextWorkspace: '工作区全局',
    ttsEnabled: '🌐 启用功能',
    ttsEnabledDesc: '启用 Add to TTS',
    ttsEngine: '🔊 TTS 引擎',
    ttsEngineDesc: '选择语音合成引擎（edge-TTS / WebSpeech）',
    ttsEngineEdge: 'edge-TTS（云端·高质量）',
    ttsEngineWebspeech: 'WebSpeech（浏览器标准）',
    ttsEnginePlachta: 'Plachta VITS（云端）',
    ttsTestSample: '今天天气不错。我想去爬山。',
    ttsTestButton: '🔊 测试声音',
    ttsMinimaxRemovalNote: 'ℹ️ 旧版本中的 MiniMax 连接设置已删除（连接测试失败）',
    ttsPlachtaPreset: '快速选择',
    ttsPlachtaSpeaker: '角色',
    ttsPlachtaLanguage: '语言',
    ttsPlachtaSpeed: '速度',
    ttsPlachtaTest: '▶ 测试朗读（Plachta）',
    ttsPlachtaOffline: '⚠️ 请检查网络连接',
    ttsPlachtaTimeout: '⚠️ 超时（60秒）',
    ttsPlachtaTooLong: '⚠️ 文本过长',
    ttsVoicesHint: '所选引擎的音色。切换引擎时下拉框内容也会切换',
    ttsVoiceZh: '中文 (zh)',
    ttsVoiceJa: '日语 (ja)',
    ttsVoiceEn: '英语 (en)',
    ttsBrowserDefault: '浏览器默认',
    resetMigration: '🔄 重新导入旧设置',
    resetMigrationDesc: '从旧插件 data.json 重新导入（需重启 Obsidian）',
    resetMigrationButton: '🔄 重置迁移',
    resetMigrationNotice: '🔄 迁移已重置。请重启 Obsidian。',
    migratedFrom: '旧插件迁移状态',
    notMigrated: '⏳ 未迁移',
    migrated: '✅ 已迁移',
    // zh
    officeEnabled: '🌐 启用功能',
    officeEnabledDesc: '启用 Office/PDF/HTML/CSV → Markdown 转换',
    officePythonPath: 'Python 路径',
    officePythonPathDesc: '调用 markitdown 的 Python 可执行文件（如 py / python3 / 完整路径）',
    officeEnabledExtensions: '启用扩展名（逗号分隔）',
    officeEnabledExtensionsDesc: '显示右键菜单的扩展名',
    officeConflictPolicy: '同名 .md 冲突时',
    officeConflictPolicyDesc: '输出目录已存在同名 Markdown 时的行为',
    officeConflictOverwrite: '覆盖',
    officeConflictSkip: '跳过',
    officeConflictTimestamp: '添加时间戳',
    officeFrontmatterTemplate: 'Frontmatter 模板',
    officeFrontmatterTemplateDesc: '占位符: {{title}} / {{sourcePath}} / {{date}} / {{ext}} / {{sizeBytes}} / {{sha256}}',
    officeOutputDirOverride: '输出目录（可选，留空=原文件夹）',
    officeOutputDirOverrideDesc: '存放转换结果 .md 的绝对路径',
    officeShowProgressModal: '显示进度弹窗',
    officeShowProgressModalDesc: '转换时显示进度和日志弹窗',
    // zh
    whitelistEnabled: '✅ 启用',
    whitelistEnabledDesc: '切换扩展名过滤',
    whitelistExtensionsHeading: '📋 允许的扩展名',
    whitelistExtensionsDesc: '仅显示列表中扩展名的文件',
    whitelistAddExtension: '添加扩展名',
    whitelistAddExtensionDesc: '不含点（例如 json, yaml, js）',
    whitelistAddExtensionPlaceholder: '扩展名',
    whitelistAddExtensionButton: '＋ 添加',
    whitelistPresetsHeading: '🎯 预设',
    whitelistPresetsDesc: '添加到当前列表。「ALL」会取消过滤。',
    whitelistApplyButton: '应用',
    whitelistAlwaysShowFolders: '📁 始终显示文件夹',
    whitelistAlwaysShowFoldersDesc: '文件夹不受过滤影响',
    whitelistAllFilesShown: '（将显示所有文件）',
    whitelistOptionsHeading: '⚙️ 选项',
    whitelistReset: '🔄 恢复默认',
    whitelistResetDesc: '将所有设置恢复为默认值',
    whitelistResetButton: '重置',
    comingSoon: '🚧 此标签将在下一个子项目 (P3/P4) 中实现。',
    // Chroma Inspector (P5 集成)
    tabChroma: '🗄️ Chroma 浏览器',
    chromaEnabled: '🌐 启用 Chroma 功能',
    chromaEnabledDesc: 'Chroma 浏览器 (功能区 / 命令) 与此设置页的总开关',
    chromaDisabledNotice: '🔒 Chroma 功能未启用。打开上方开关后,设置项与浏览器才会显示。',
    chromaDescription: '浏览、搜索并查看 ChromaDB 集合。从 Vault 根目录调用 Python CLI (_chroma_inspect.py)。',
    chromaChromaPath: 'ChromaDB 路径',
    chromaChromaPathDesc: 'Vault 相对路径或绝对路径。默认: chroma_db',
    chromaPythonPath: 'Python 解释器',
    chromaPythonPathDesc: 'Windows: "py" / macOS、Linux: "python3"',
    chromaScriptPath: 'Python 脚本路径 (覆盖)',
    chromaScriptPathDesc: '留空 = <vault>/_chroma_inspect.py',
    chromaEmbeddingModel: '嵌入模型',
    chromaEmbeddingModelDesc: '用于语义搜索。请指定创建集合时使用的同一模型。留空 = 仅文档内搜索。',
    chromaDefaultNResults: '默认结果数',
    chromaDefaultNResultsDesc: '1～100。默认 5。',
    chromaRecordPreviewLength: '记录预览长度 (字符)',
    chromaRecordPreviewLengthDesc: '20～10000。默认 240。',
    chromaShowProgressModal: '长时间操作时显示进度弹窗',
    chromaShowProgressModalDesc: 'Chroma 操作期间显示进度/日志弹窗',
    chromaEnableRawSql: '启用 Raw SQL (高级)',
    chromaEnableRawSqlDesc: '启用后,Database Browser 会显示仅 SELECT 的 SQL 弹窗。设计上只读,但请谨慎使用。',
    chromaTestConnection: '测试连接',
    chromaTestOk: '✅ OK — {n} 个集合',
    chromaResolvedPath: '已解析 ChromaDB: {path}',
    chromaScriptInfo: 'Python 脚本: {script}',
    quotaEnabled: 'LLM 额度检测',
    quotaEnabledDesc: '显示 Claude Code 及各个 LLM 提供商的使用情况（仅桌面端）',
    quotaRefreshSec: '数据采集周期（秒）',
    quotaRefreshSecDesc: '10–600 秒范围，0 表示禁用',
    quotaFetching: '加载中…',
    quotaNotLoggedIn: '未登录 Claude Code',
    quotaError: '获取额度失败',
    quotaUnsupportedMobile: '残量检测仅在桌面端可用',
    quotaRefresh: '刷新额度',
    quotaWindow5h: '5小时',
    quotaWindow7d: '7天',
    quotaSwitchSec: '显示模型切换周期（秒）',
    quotaSwitchSecDesc: '5–600 秒每个提供商',
    quotaNoProvider: '无可用提供商',
    // LLM 额度检测标签 (v0.5.0)
    quotaLlmHeading: '🤖 LLM 额度检测',
    quotaLlmDesc: '从 Claude Code 配置文件读取当前 LLM，并从各提供商的 API 密钥获取剩余额度。',
    quotaClaudeSettingsPath: 'Claude Code 配置文件',
    quotaClaudeSettingsPathDesc: '当前 LLM（提供商/模型）信息的读取来源',
    quotaCurrentLlm: '当前 LLM',
    quotaCurrentLlmEmpty: '（未检测到）',
    quotaProvider: '提供商',
    quotaModel: '模型',
    quotaBaseUrl: 'Base URL',
    quotaApiKeysHeading: '🔑 API 密钥',
    quotaApiKeysDesc: '输入各 LLM 的 API 密钥。连接测试成功的模型将显示剩余额度。',
    quotaDeepseekApiKey: 'DeepSeek API 密钥',
    quotaKimiApiKey: 'KIMI CODE API 密钥',
    quotaMinimaxApiKey: 'MINIMAX API 密钥',
    quotaApiKeyPlaceholder: 'sk-...',
    quotaTestConnection: '测试连接',
    quotaTestOk: '✅ 连接成功',
    quotaTestFail: '❌ 连接失败: {msg}',
    quotaSafe: '安全',
    quotaCaution: '注意',
    quotaDanger: '危险',
    quotaColorUnknown: '无数据',
    quotaDeepseekValue: 'CNY 余额',
    quotaKimiValue: '5小时用量',
    quotaMinimaxValue: '5小时用量',
    quotaRefreshAll: '🔄 刷新全部',
    quotaDisplayModelsHeading: '🖥️ 显示模型',
    quotaDisplayModelsDesc: '单独启用/禁用显示的模型。连接测试失败的模型不会显示。',
    quotaDisplayClaude: '显示 Claude',
    quotaDisplayDeepseek: '显示 DeepSeek',
    quotaDisplayKimi: '显示 KIMI CODE',
    quotaDisplayMinimax: '显示 MINIMAX',
  },
};

export function getLocaleStrings(lang: string): LocaleStrings {
  if (lang === 'ja' || lang === 'zh' || lang === 'en') return STRINGS[lang];
  return STRINGS.en;
}

export function getUILanguage(locale?: string): SupportedLocale {
  const loc = locale ?? (typeof moment?.locale === 'function' ? moment.locale() : 'en');
  if (loc.startsWith('ja')) return 'ja';
  if (loc.startsWith('zh')) return 'zh';
  return 'en';
}