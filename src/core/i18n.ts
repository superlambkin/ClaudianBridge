import { moment } from 'obsidian';

export type SupportedLocale = 'ja' | 'zh' | 'en';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['ja', 'zh', 'en'];

export interface LocaleStrings {
  tabGeneral: string;
  tabSelection: string;
  tabTts: string;
  tabOffice: string;
  tabWhitelist: string;
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
  ttsEnabled: string;
  ttsEnabledDesc: string;
  ttsEngine: string;
  ttsEngineDesc: string;
  ttsEngineEdge: string;
  ttsEngineClaudetts: string;
  ttsEngineAuto: string;
  ttsEngineWebspeech: string;
  ttsEngineMinimax: string;
  ttsTestSample: string;
  ttsTestButton: string;
  ttsMinimaxHeading: string;
  ttsMinimaxEnabled: string;
  ttsMinimaxApiKey: string;
  ttsMinimaxApiKeyDesc: string;
  ttsMinimaxVoiceZh: string;
  ttsMinimaxVoiceZhDesc: string;
  ttsMinimaxVoiceJa: string;
  ttsMinimaxVoiceJaDesc: string;
  ttsMinimaxVoiceEn: string;
  ttsMinimaxVoiceEnDesc: string;
  ttsMinimaxEnabledDesc: string;
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
}

export const STRINGS: Record<SupportedLocale, LocaleStrings> = {
  ja: {
    tabGeneral: '🎛️ 一般',
    tabSelection: '📝 テキスト挿入',
    tabTts: '🔊 テキスト読み上げ',
    tabOffice: '📄 ファイル変換',
    tabWhitelist: '🗂️ 拡張子フィルタ',
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
    ttsEnabled: '🌐 機能 ON/OFF',
    ttsEnabledDesc: 'Add to TTS を有効化',
    ttsEngine: '🔊 TTS エンジン',
    ttsEngineDesc: '音声合成エンジンを選択',
    ttsEngineEdge: 'ClaudeTTS (edge-tts → pyttsx3 → system.speech)',
    ttsEngineClaudetts: 'ClaudeTTS HTTP bridge',
    ttsEngineAuto: '自動 (ClaudeTTS → Web Speech フォールバック)',
    ttsEngineWebspeech: 'Web SpeechSynthesis API',
    ttsEngineMinimax: 'MiniMax クラウド TTS',
    ttsTestSample: '今日は天気がいい。山に登りたい。',
    ttsTestButton: '🔊 テスト再生',
    ttsMinimaxHeading: '🎤 MiniMax クラウド TTS',
    ttsMinimaxEnabled: '有効化',
    ttsMinimaxEnabledDesc: 'MiniMax クラウド音声合成を有効化',
    ttsMinimaxApiKey: 'API Key',
    ttsMinimaxApiKeyDesc: 'MiniMax API の認証キー',
    ttsMinimaxVoiceZh: 'Chinese voice ID',
    ttsMinimaxVoiceZhDesc: '中国語の voice ID',
    ttsMinimaxVoiceJa: 'Japanese voice ID',
    ttsMinimaxVoiceJaDesc: '日本語の voice ID',
    ttsMinimaxVoiceEn: 'English voice ID',
    ttsMinimaxVoiceEnDesc: '英語の voice ID',
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
  },
  en: {
    tabGeneral: '🎛️ General',
    tabSelection: '📝 Text Insertion',
    tabTts: '🔊 Text To Speech',
    tabOffice: '📄 File Conversion',
    tabWhitelist: '🗂️ Extension Filter',
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
    ttsEnabled: '🌐 Enable Feature',
    ttsEnabledDesc: 'Enable Add to TTS',
    ttsEngine: '🔊 TTS Engine',
    ttsEngineDesc: 'Select the speech synthesis engine',
    ttsEngineEdge: 'ClaudeTTS (edge-tts → pyttsx3 → system.speech)',
    ttsEngineClaudetts: 'ClaudeTTS HTTP bridge',
    ttsEngineAuto: 'Auto (ClaudeTTS → Web Speech fallback)',
    ttsEngineWebspeech: 'Web SpeechSynthesis API',
    ttsEngineMinimax: 'MiniMax cloud TTS',
    ttsTestSample: "The weather is nice today. I'd like to climb a mountain.",
    ttsTestButton: '🔊 Test voice',
    ttsMinimaxHeading: '🎤 MiniMax Cloud TTS',
    ttsMinimaxEnabled: 'Enable',
    ttsMinimaxEnabledDesc: 'Enable MiniMax cloud TTS',
    ttsMinimaxApiKey: 'API Key',
    ttsMinimaxApiKeyDesc: 'MiniMax API authentication key',
    ttsMinimaxVoiceZh: 'Chinese voice ID',
    ttsMinimaxVoiceZhDesc: 'Voice ID for Chinese',
    ttsMinimaxVoiceJa: 'Japanese voice ID',
    ttsMinimaxVoiceJaDesc: 'Voice ID for Japanese',
    ttsMinimaxVoiceEn: 'English voice ID',
    ttsMinimaxVoiceEnDesc: 'Voice ID for English',
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
  },
  zh: {
    tabGeneral: '🎛️ 一般',
    tabSelection: '📝 文本插入',
    tabTts: '🔊 文本朗读',
    tabOffice: '📄 文件转换',
    tabWhitelist: '🗂️ 扩展名过滤',
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
    ttsEnabled: '🌐 启用功能',
    ttsEnabledDesc: '启用 Add to TTS',
    ttsEngine: '🔊 TTS 引擎',
    ttsEngineDesc: '选择语音合成引擎',
    ttsEngineEdge: 'ClaudeTTS (edge-tts → pyttsx3 → system.speech)',
    ttsEngineClaudetts: 'ClaudeTTS HTTP bridge',
    ttsEngineAuto: '自动 (ClaudeTTS → Web Speech 回退)',
    ttsEngineWebspeech: 'Web SpeechSynthesis API',
    ttsEngineMinimax: 'MiniMax 云 TTS',
    ttsTestSample: '今天天气不错。我想去爬山。',
    ttsTestButton: '🔊 测试声音',
    ttsMinimaxHeading: '🎤 MiniMax 云 TTS',
    ttsMinimaxEnabled: '启用',
    ttsMinimaxEnabledDesc: '启用 MiniMax 云端语音合成',
    ttsMinimaxApiKey: 'API 密钥',
    ttsMinimaxApiKeyDesc: 'MiniMax API 认证密钥',
    ttsMinimaxVoiceZh: '中文语音 ID',
    ttsMinimaxVoiceZhDesc: '中文语音的 ID',
    ttsMinimaxVoiceJa: '日语语音 ID',
    ttsMinimaxVoiceJaDesc: '日语语音的 ID',
    ttsMinimaxVoiceEn: '英语语音 ID',
    ttsMinimaxVoiceEnDesc: '英语语音的 ID',
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