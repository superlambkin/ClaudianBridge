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
  ttsMinimaxHeading: string;
  ttsMinimaxEnabled: string;
  ttsMinimaxApiKey: string;
  ttsMinimaxVoiceZh: string;
  ttsMinimaxVoiceJa: string;
  ttsMinimaxVoiceEn: string;
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
}

const STRINGS: Record<SupportedLocale, LocaleStrings> = {
  ja: {
    tabGeneral: '🎛️ Claudian Bridge — 一般',
    tabSelection: '📝 テキスト挿入',
    tabTts: '🔊 テキスト読み上げ',
    tabOffice: '📄 ファイル変換',
    tabWhitelist: '🗂️ 拡張子フィルタ',
    settingsTitle: 'Claudian Bridge 設定',
    noticeSaved: '✅ 保存しました',
    noticeSaveFailed: '⚠️ 保存失敗: {msg}',
    generalEnabled: '🌐 プラグイン有効化',
    generalEnabledDesc: 'Claudian Bridge 全体を ON/OFF',
    selectionEnabled: '🌐 機能 ON/OFF',
    selectionEnabledDesc: '選択テキストを Claudian 入力に挿入する機能を有効化',
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
    ttsMinimaxHeading: '🎤 MiniMax クラウド TTS',
    ttsMinimaxEnabled: '有効化',
    ttsMinimaxApiKey: 'API Key',
    ttsMinimaxVoiceZh: 'Chinese voice ID',
    ttsMinimaxVoiceJa: 'Japanese voice ID',
    ttsMinimaxVoiceEn: 'English voice ID',
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
  },
  en: {
    tabGeneral: '🎛️ Claudian Bridge — General',
    tabSelection: '📝 Text Insertion',
    tabTts: '🔊 Text To Speech',
    tabOffice: '📄 File Conversion',
    tabWhitelist: '🗂️ Extension Filter',
    settingsTitle: 'Claudian Bridge Settings',
    noticeSaved: '✅ Saved',
    noticeSaveFailed: '⚠️ Save failed: {msg}',
    generalEnabled: '🌐 Enable Plugin',
    generalEnabledDesc: 'Toggle Claudian Bridge globally',
    selectionEnabled: '🌐 Enable Feature',
    selectionEnabledDesc: 'Insert selected text into Claudian input',
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
    ttsMinimaxHeading: '🎤 MiniMax Cloud TTS',
    ttsMinimaxEnabled: 'Enable',
    ttsMinimaxApiKey: 'API Key',
    ttsMinimaxVoiceZh: 'Chinese voice ID',
    ttsMinimaxVoiceJa: 'Japanese voice ID',
    ttsMinimaxVoiceEn: 'English voice ID',
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
  },
  zh: {
    tabGeneral: '🎛️ Claudian Bridge — 一般',
    tabSelection: '📝 文本插入',
    tabTts: '🔊 文本朗读',
    tabOffice: '📄 文件转换',
    tabWhitelist: '🗂️ 扩展名过滤',
    settingsTitle: 'Claudian Bridge 设置',
    noticeSaved: '✅ 已保存',
    noticeSaveFailed: '⚠️ 保存失败: {msg}',
    generalEnabled: '🌐 启用插件',
    generalEnabledDesc: '全局开关 Claudian Bridge',
    selectionEnabled: '🌐 启用功能',
    selectionEnabledDesc: '将选中文本插入 Claudian 输入框',
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
    ttsMinimaxHeading: '🎤 MiniMax 云 TTS',
    ttsMinimaxEnabled: '启用',
    ttsMinimaxApiKey: 'API 密钥',
    ttsMinimaxVoiceZh: '中文语音 ID',
    ttsMinimaxVoiceJa: '日语语音 ID',
    ttsMinimaxVoiceEn: '英语语音 ID',
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
    officeOutputDirOverrideDesc: '保存转换结果 .md 的绝对路径',
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
  },
};

export function getLocaleStrings(lang: string): LocaleStrings {
  if (lang === 'ja' || lang === 'zh' || lang === 'en') return STRINGS[lang];
  return STRINGS.en;
}

export function getUILanguage(locale?: string): SupportedLocale {
  const loc = locale ?? (typeof moment?.locale === 'function' ? moment.locale() : 'en');
  if (loc === 'ja') return 'ja';
  if (loc.startsWith('zh')) return 'zh';
  return 'en';
}
