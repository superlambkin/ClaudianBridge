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
  generalCodeCopyFence: string;
  generalCodeCopyFenceDesc: string;
  // === v0.21.0: バックアップ機能 ===
  generalBackupEnabled: string;
  generalBackupEnabledDesc: string;
  // === v0.21.1: バックアップ完了時ダイアログ自動クローズ ===
  generalBackupAutoClose: string;
  generalBackupAutoCloseDesc: string;
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
  ttsEngineEdgeLocal: string;
  ttsEdgeTtsModulePath: string;
  ttsEdgeTtsModulePathDesc: string;
  ttsEdgeTtsModulePathPlaceholder: string;
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
  ttsCliHeading: string;
  ttsCliFullText: string;
  ttsCliFullTextDesc: string;
  ttsCliMaxChars: string;
  ttsCliMaxCharsDesc: string;
  ttsCliDebounceMs: string;
  ttsCliDebounceMsDesc: string;
  ttsCliFilterHeading: string;
  ttsCliFilterEmoji: string;
  ttsCliFilterKaomoji: string;
  ttsCliFilterAscii: string;
  ttsCliFilterShortcode: string;
  ttsAutoReadHeading: string;
  ttsAutoReadEnabled: string;
  ttsAutoReadEnabledDesc: string;
  ttsAutoReadScope: string;
  ttsAutoReadScopeDesc: string;
  ttsAutoReadScopeHeader: string;
  ttsAutoReadScopeFull: string;
  // v0.15.0: コールアウト除外
  ttsExcludeCallouts: string;
  ttsExcludeCalloutsDesc: string;
  // v0.12.0: ツールバーボタン
  ttsMuteBtnIdle: string;
  ttsMuteBtnPlaying: string;
  ttsMuteBtnMuted: string;
  ttsFullTextBtnOn: string;
  ttsFullTextBtnOff: string;
  // v0.16.0: AI読み上げボタン
  ttsInputAiEnabled: string;
  ttsInputAiEnabledDesc: string;
  // v0.17.0: TTS 読み上げ仕様改良
  ttsChunkMaxCharsEdge: string;
  ttsChunkMaxCharsEdgeDesc: string;
  ttsChunkMaxCharsWebspeech: string;
  ttsChunkMaxCharsWebspeechDesc: string;
  ttsChunkMaxCharsPlachta: string;
  ttsChunkMaxCharsPlachtaDesc: string;
  ttsSpeechFilterHeading: string;
  ttsSpeechFilterHint: string;
  ttsSpeechFilterItemHeader: string;
  ttsAddToTts: string;
  ttsSpeechFilterTypeSelection: string;
  ttsSpeechFilterTypeAutoRead: string;
  ttsSpeechFilterTypeMessage: string;
  ttsSpeechFilterTypeInputAi: string;
  ttsSpeechFilterEmoji: string;
  ttsSpeechFilterKaomoji: string;
  ttsSpeechFilterAscii: string;
  ttsSpeechFilterShortcode: string;
  ttsSpeechFilterCallout: string;
  ttsSpeechFilterTable: string;
  ttsSpeechFilterCode: string;
  ttsSpeechFilterThinking: string;
  // v0.18.1: ツール呼び出し除外
  ttsSpeechFilterToolCommands: string;
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
  // === v0.22.0: _ プレフィックスフォルダ非表示 ===
  whitelistHideUnderscoreFolders: string;
  whitelistHideUnderscoreFoldersDesc: string;
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
  chromaHideInternal: string;
  chromaHideInternalDesc: string;
  chromaRagEnabled: string;
  chromaRagEnabledDesc: string;
  chromaRagScriptPath: string;
  chromaRagScriptPathDesc: string;
  chromaRagConfigPath: string;
  chromaRagConfigPathDesc: string;
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
  quotaZhipuApiKey: string;
  quotaZhipuPythonPath: string;
  quotaZhipuPythonPathPlaceholder: string;
  // v0.16.0: 表示窓（5時間 / 週間）
  quotaWindowsHeading: string;
  quotaWindowsDesc: string;
  quotaWindowWeek: string;
  quotaWindowClaude: string;
  quotaWindowZhipu: string;
  quotaWindowMinimax: string;
  // ツールチップ（マウスオン）
  quotaTooltipRemaining: string;
  quotaTooltipReset: string;
  quotaZhipuValue: string;
  quotaDisplayZhipu: string;
  // Memory (v0.17.0: MD 保存ボタン)
  tabMemory: string;
  memoryEnabled: string;
  memoryEnabledDesc: string;
  memoryScope: string;
  memoryScopeDesc: string;
  memoryScopePair: string;
  memoryScopeConversation: string;
  memoryFolder: string;
  memoryFolderDesc: string;
  // v0.23.0: クイック返信ボタン
  quickReplySendOk: string;
  quickReplySendNg: string;
  quickReplySendOption: string; // {n}
  // v0.24.0: クイック返信ボタンの方案ボタン常時表示
  quickReplyShowAllOptions: string;
  quickReplyShowAllOptionsDesc: string;
  // v0.25.0: クイック返信ボタン全体の ON/OFF
  quickReplyEnabled: string;
  quickReplyEnabledDesc: string;
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
    generalCodeCopyFence: '🔧 コードコピー時にフェンス付与',
    generalCodeCopyFenceDesc: 'Claudian チャットのコードブロックをコピーするとき、``` のコードフェンスを自動で付与します（Mermaid 等の貼り付け崩れを防止）',
    // v0.21.0
    generalBackupEnabled: '💾 右クリックバックアップ',
    generalBackupEnabledDesc: 'ファイル/フォルダ右クリックメニューに「バックアップ」を追加（OFF で非表示）',
    // v0.21.1
    generalBackupAutoClose: '⏱️ 完了時にダイアログを自動で閉じる',
    generalBackupAutoCloseDesc: 'バックアップ成功後、1.5秒後にダイアログを自動で閉じます（失敗時は閉じません）',
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
    ttsEngineDesc: '音声合成エンジンを選択（edge-TTS / WebSpeech / Plachta / ローカル EdgeTTS）',
    ttsEngineEdge: 'edge-TTS（クラウド・高品質）',
    ttsEngineWebspeech: 'WebSpeech（ブラウザ標準）',
    ttsEnginePlachta: 'Plachta VITS（クラウド）',
    ttsEngineEdgeLocal: 'ローカル EdgeTTS（同梱モジュール）',
    ttsEdgeTtsModulePath: 'Edge TTS モジュール場所',
    ttsEdgeTtsModulePathDesc: 'edge_tts モジュールのパス。空ならプラグイン内 edge_tts → Python site-packages の順に使用',
    ttsEdgeTtsModulePathPlaceholder: '自動（プラグイン内 edge_tts）',
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
    ttsCliHeading: '🖥️ Claude Code CLI 用設定',
    ttsCliFullText: '📖 全文読み上げ',
    ttsCliFullTextDesc: 'ON で最大文字数制限なし（voice-config.json に同期）',
    ttsCliMaxChars: '📏 最大文字数',
    ttsCliMaxCharsDesc: 'これを超えるテキストは CLI 側で読み上げない',
    ttsCliDebounceMs: '⏱️ デバウンス (ms)',
    ttsCliDebounceMsDesc: 'CLI 連続応答時の読み上げ抑制時間',
    ttsCliFilterHeading: '🔇 読み上げ文最適化',
    ttsCliFilterEmoji: 'Emoji 絵文字',
    ttsCliFilterKaomoji: '顔文字 (kaomoji)',
    ttsCliFilterAscii: 'ASCII 表情',
    ttsCliFilterShortcode: 'Emoji 短コード',
    ttsAutoReadHeading: '📢 タスク終了時の自動読み上げ',
    ttsAutoReadEnabled: '🔊 自動読み上げ',
    ttsAutoReadEnabledDesc: 'タスク終了報告（📢）を検出して自動で読み上げ',
    ttsAutoReadScope: '📏 読み上げ範囲',
    ttsAutoReadScopeDesc: 'ヘッダーのみ: 📢 ブロックのみ / 全文: 報告メッセージ全体',
    ttsAutoReadScopeHeader: '📢 ヘッダーのみ',
    ttsAutoReadScopeFull: '📄 メッセージ全文',
    ttsExcludeCallouts: 'コールアウトを読み上げ対象から除外',
    ttsExcludeCalloutsDesc: '「> [!type]」形式のコールアウト（成功・注意等）を読み上げません',
    ttsMuteBtnIdle: '🔊 ミュート',
    ttsMuteBtnPlaying: '⏹ ミュート',
    ttsMuteBtnMuted: '🔇 ミュート',
    ttsFullTextBtnOn: '📖 全文',
    ttsFullTextBtnOff: '📄 ヘッダー',
    ttsInputAiEnabled: 'AI読み上げボタン',
    ttsInputAiEnabledDesc: 'チャット入力欄の✨ボタン:入力文をAIで指令文に整形し、入力欄を上書きして読み上げます',
    ttsChunkMaxCharsEdge: 'EdgeTTS のチャンク文字数',
    ttsChunkMaxCharsEdgeDesc: 'EdgeTTS の1チャンク上限（100〜2000 文字）。既定 500',
    ttsChunkMaxCharsWebspeech: 'WebSpeech のチャンク文字数',
    ttsChunkMaxCharsWebspeechDesc: 'WebSpeech の1チャンク上限（50〜140 文字）。既定 140',
    ttsChunkMaxCharsPlachta: 'Plachta のチャンク文字数',
    ttsChunkMaxCharsPlachtaDesc: 'Plachta の1チャンク上限（50〜140 文字）。既定 140',
    ttsSpeechFilterHeading: '読み上げ内容フィルタ（タイプ別）',
    ttsSpeechFilterHint: 'チェック=読み上げに含める。チェックなしの項目は読み上げから除外します',
    ttsSpeechFilterItemHeader: '項目',
    ttsAddToTts: 'TTS に追加',
    ttsSpeechFilterTypeSelection: '① 選択テキスト',
    ttsSpeechFilterTypeAutoRead: '② 自動読み上げ',
    ttsSpeechFilterTypeMessage: '④ メッセージ読上げ',
    ttsSpeechFilterTypeInputAi: '⑤ AI読み上げ',
    ttsSpeechFilterEmoji: '絵文字',
    ttsSpeechFilterKaomoji: '顔文字',
    ttsSpeechFilterAscii: 'ASCII 表情',
    ttsSpeechFilterShortcode: 'emoji 短コード',
    ttsSpeechFilterCallout: 'コールアウト',
    ttsSpeechFilterTable: 'テーブル',
    ttsSpeechFilterCode: 'コードブロック',
    ttsSpeechFilterThinking: '思考ブロック',
    ttsSpeechFilterToolCommands: 'ツール呼び出し',
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
    // v0.22.0
    whitelistHideUnderscoreFolders: '📁 _ で始まるフォルダを非表示',
    whitelistHideUnderscoreFoldersDesc: 'フォルダ名の先頭が _ のフォルダ（例: _テンプレート）をファイルエクスプローラから非表示にします',
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
    chromaDescription: 'ChromaDB のコレクション閲覧・検索・詳細表示。Python CLI (_chroma_inspect.py) をプラグインフォルダから呼び出します。',
    chromaChromaPath: 'ChromaDB パス',
    chromaChromaPathDesc: 'Vault 相対または絶対パス。デフォルト: chroma_db',
    chromaPythonPath: 'Python インタプリタ',
    chromaPythonPathDesc: 'Windows: "py" / macOS・Linux: "python3"',
    chromaScriptPath: 'Python スクリプトパス (上書き)',
    chromaScriptPathDesc: '空欄 = <plugin>/_chroma_inspect.py',
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
    chromaHideInternal: '🔒 chroma_db 内部を非表示',
    chromaHideInternalDesc: 'ファイルエクスプローラで chroma_db を展開したとき、ハッシュフォルダ・sqlite・.base を隠し PDF/DOCX のみ表示',
    chromaRagEnabled: '🔎 右クリック RAG検索を有効化',
    chromaRagEnabledDesc: 'chroma_db/PDF・DOCX 配下のファイル右クリックメニューに「RAG検索」を追加',
    chromaRagScriptPath: 'query.py のパス',
    chromaRagScriptPathDesc: 'query.py のパス（空欄 = <plugin>/query.py を自動参照）',
    chromaRagConfigPath: 'config.yaml のパス',
    chromaRagConfigPathDesc: 'config.yaml のパス（空欄 = <plugin>/config.yaml を自動参照）',
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
    quotaZhipuApiKey: 'ZHIPU API キー',
    quotaZhipuPythonPath: 'ZHIPU Python パス',
    quotaZhipuPythonPathPlaceholder: 'py / python3 / フルパス',
    quotaWindowsHeading: '🪟 表示窓',
    quotaWindowsDesc: '使用率を表示する期間。Kimi は 5時間固定、DeepSeek は残金表示です',
    quotaWindowWeek: '週間',
    quotaWindowClaude: 'Claude の表示窓',
    quotaWindowZhipu: 'Zhipu の表示窓',
    quotaWindowMinimax: 'MiniMax の表示窓',
    quotaTooltipRemaining: '残り',
    quotaTooltipReset: 'リセット',
    quotaZhipuValue: '5時間使用量',
    quotaDisplayZhipu: '智谱を表示',
    // Memory (v0.17.0: MD 保存ボタン)
    tabMemory: 'Memory',
    memoryEnabled: 'MD保存ボタン',
    memoryEnabledDesc: 'Chat結果をメモリフォルダに保存するボタンをツールバーと回答ブロックに表示します',
    memoryScope: '保存範囲（ツールバー）',
    memoryScopeDesc: 'ツールバーボタンの保存範囲。回答ブロックのボタンは常にブロックのみです',
    memoryScopePair: '質問＋応答',
    memoryScopeConversation: 'チャット全体',
    memoryFolder: 'メモリフォルダ',
    memoryFolderDesc: '相対パスは Vault 内、絶対パスはそのまま。既定 Memory/',
    // v0.23.0
    quickReplySendOk: '✅ OK を送信',
    quickReplySendNg: '❌ NG を送信',
    quickReplySendOption: '方案{n} を送信',
    // v0.24.0
    quickReplyShowAllOptions: '方案ボタンを常に表示',
    quickReplyShowAllOptionsDesc: 'ON で 1️⃣〜5️⃣ を常に表示（OFF は応答の「方案N」検出時のみ表示）',
    // v0.25.0
    quickReplyEnabled: 'クイック返信ボタンを表示',
    quickReplyEnabledDesc: 'ON（既定）で Claudian チャット入力欄に ✅ ❌ 1️⃣〜5️⃣ のクイック返信ボタンを表示。OFF でボタンの注入自体を停止',
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
    generalCodeCopyFence: '🔧 Add fences when copying code',
    generalCodeCopyFenceDesc: 'When copying a code block from Claudian chat, automatically wrap it in ``` fences (prevents broken pastes such as Mermaid diagrams).',
    // v0.21.0
    generalBackupEnabled: '💾 Right-click backup',
    generalBackupEnabledDesc: 'Add "Backup" to file/folder right-click menu (hide when OFF)',
    // v0.21.1
    generalBackupAutoClose: '⏱️ Auto-close dialog on completion',
    generalBackupAutoCloseDesc: 'Automatically closes the dialog 1.5s after a successful backup (not on failure)',
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
    ttsEngineDesc: 'Select the speech synthesis engine (edge-TTS / WebSpeech / Plachta / Local Edge-TTS)',
    ttsEngineEdge: 'edge-TTS (cloud, high quality)',
    ttsEngineWebspeech: 'WebSpeech (browser default)',
    ttsEnginePlachta: 'Plachta VITS (Cloud)',
    ttsEngineEdgeLocal: 'Local Edge-TTS (bundled module)',
    ttsEdgeTtsModulePath: 'Edge TTS module path',
    ttsEdgeTtsModulePathDesc: 'Path to the edge_tts module. Empty uses plugin edge_tts → Python site-packages',
    ttsEdgeTtsModulePathPlaceholder: 'Auto (plugin edge_tts)',
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
    ttsCliHeading: '🖥️ Claude Code CLI Settings',
    ttsCliFullText: '📖 Full-text reading',
    ttsCliFullTextDesc: 'Read full text ignoring max_chars (synced to voice-config.json)',
    ttsCliMaxChars: '📏 Max chars',
    ttsCliMaxCharsDesc: 'Texts longer than this are not read by CLI',
    ttsCliDebounceMs: '⏱️ Debounce (ms)',
    ttsCliDebounceMsDesc: 'Debounce window for consecutive CLI responses',
    ttsCliFilterHeading: '🔇 Speech text optimization',
    ttsCliFilterEmoji: 'Emoji',
    ttsCliFilterKaomoji: 'Kaomoji',
    ttsCliFilterAscii: 'ASCII emoticon',
    ttsCliFilterShortcode: 'Emoji shortcode',
    ttsAutoReadHeading: '📢 Auto-read task completion',
    ttsAutoReadEnabled: '🔊 Auto-read',
    ttsAutoReadEnabledDesc: 'Detect task completion report (📢) and read it aloud',
    ttsAutoReadScope: '📏 Reading scope',
    ttsAutoReadScopeDesc: 'Header only: 📢 blockquote / Full: entire report message',
    ttsAutoReadScopeHeader: '📢 Header only',
    ttsAutoReadScopeFull: '📄 Full message',
    ttsExcludeCallouts: 'Exclude callouts from reading',
    ttsExcludeCalloutsDesc: 'Skip "> [!type]" callouts (success, note, etc.) when reading',
    ttsMuteBtnIdle: '🔊 Mute',
    ttsMuteBtnPlaying: '⏹ Mute',
    ttsMuteBtnMuted: '🔇 Mute',
    ttsFullTextBtnOn: '📖 Full',
    ttsFullTextBtnOff: '📄 Header',
    ttsInputAiEnabled: 'AI read-aloud button',
    ttsInputAiEnabledDesc: '✨ button in the chat input toolbar: polishes your input into a clear instruction, overwrites the input, and reads it aloud',
    ttsChunkMaxCharsEdge: 'EdgeTTS chunk character limit',
    ttsChunkMaxCharsEdgeDesc: 'Max characters per chunk for EdgeTTS (100-2000). Default 500',
    ttsChunkMaxCharsWebspeech: 'WebSpeech chunk character limit',
    ttsChunkMaxCharsWebspeechDesc: 'Max characters per chunk for WebSpeech (50-140). Default 140',
    ttsChunkMaxCharsPlachta: 'Plachta chunk character limit',
    ttsChunkMaxCharsPlachtaDesc: 'Max characters per chunk for Plachta (50-140). Default 140',
    ttsSpeechFilterHeading: 'Read-aloud content filter (per type)',
    ttsSpeechFilterHint: 'Checked = include in reading. Unchecked items are excluded',
    ttsSpeechFilterItemHeader: 'Item',
    ttsAddToTts: 'Add to TTS',
    ttsSpeechFilterTypeSelection: '① Selection',
    ttsSpeechFilterTypeAutoRead: '② Auto read',
    ttsSpeechFilterTypeMessage: '④ Message read',
    ttsSpeechFilterTypeInputAi: '⑤ AI read',
    ttsSpeechFilterEmoji: 'Emoji',
    ttsSpeechFilterKaomoji: 'Kaomoji',
    ttsSpeechFilterAscii: 'ASCII emoticon',
    ttsSpeechFilterShortcode: 'Emoji shortcode',
    ttsSpeechFilterCallout: 'Callout',
    ttsSpeechFilterTable: 'Table',
    ttsSpeechFilterCode: 'Code block',
    ttsSpeechFilterThinking: 'Thinking block',
    ttsSpeechFilterToolCommands: 'Tool calls',
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
    // v0.22.0
    whitelistHideUnderscoreFolders: '📁 Hide _-prefixed folders',
    whitelistHideUnderscoreFoldersDesc: 'Hide folders whose name starts with _ (e.g. _templates) from the file explorer',
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
    chromaDescription: 'Browse, search and inspect ChromaDB collections. The Python CLI (_chroma_inspect.py) is invoked from the plugin folder.',
    chromaChromaPath: 'ChromaDB path',
    chromaChromaPathDesc: 'Vault-relative or absolute. Default: chroma_db',
    chromaPythonPath: 'Python interpreter',
    chromaPythonPathDesc: 'Windows: "py" / macOS & Linux: "python3"',
    chromaScriptPath: 'Python script path (override)',
    chromaScriptPathDesc: 'Empty = <plugin>/_chroma_inspect.py',
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
    chromaHideInternal: '🔒 Hide chroma_db internals',
    chromaHideInternalDesc: 'When expanding chroma_db in the file explorer, hide the hash folder / sqlite / .base and show only PDF/DOCX',
    chromaRagEnabled: '🔎 Enable right-click RAG search',
    chromaRagEnabledDesc: 'Add "RAG search" to the context menu of files under chroma_db/PDF and chroma_db/DOCX',
    chromaRagScriptPath: 'query.py path',
    chromaRagScriptPathDesc: 'Path to query.py (empty = auto-resolve <plugin>/query.py)',
    chromaRagConfigPath: 'config.yaml path',
    chromaRagConfigPathDesc: 'Path to config.yaml (empty = auto-resolve <plugin>/config.yaml)',
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
    quotaZhipuApiKey: 'ZHIPU API key',
    quotaZhipuPythonPath: 'ZHIPU Python path',
    quotaZhipuPythonPathPlaceholder: 'py / python3 / full path',
    quotaWindowsHeading: '🪟 Display window',
    quotaWindowsDesc: 'Period for usage display. Kimi is fixed at 5h; DeepSeek shows balance.',
    quotaWindowWeek: 'Weekly',
    quotaWindowClaude: 'Claude display window',
    quotaWindowZhipu: 'Zhipu display window',
    quotaWindowMinimax: 'MiniMax display window',
    quotaTooltipRemaining: 'Remaining',
    quotaTooltipReset: 'Reset',
    quotaZhipuValue: '5h usage',
    quotaDisplayZhipu: 'Show Zhipu',
    // Memory (v0.17.0: MD save button)
    tabMemory: 'Memory',
    memoryEnabled: 'MD save button',
    memoryEnabledDesc: 'Show buttons in the toolbar and answer blocks to save chat results to the memory folder',
    memoryScope: 'Save scope (toolbar)',
    memoryScopeDesc: 'Scope of the toolbar button. Block buttons always save only the block',
    memoryScopePair: 'Question + answer',
    memoryScopeConversation: 'Whole chat',
    memoryFolder: 'Memory folder',
    memoryFolderDesc: 'Relative path resolves inside the vault, absolute path is used as-is. Default Memory/',
    // v0.23.0
    quickReplySendOk: 'Send OK',
    quickReplySendNg: 'Send NG',
    quickReplySendOption: 'Send option {n}',
    // v0.24.0
    quickReplyShowAllOptions: 'Always show option buttons',
    quickReplyShowAllOptionsDesc: 'ON: always show 1️⃣–5️⃣. OFF: only show when response contains "方案N".',
    // v0.25.0
    quickReplyEnabled: 'Show quick reply buttons',
    quickReplyEnabledDesc: 'ON (default): show ✅ ❌ 1️⃣–5️⃣ buttons in the Claudian chat input toolbar. OFF: stop injecting buttons entirely.',
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
    generalCodeCopyFence: '🔧 复制代码时添加围栏',
    generalCodeCopyFenceDesc: '从 Claudian 聊天复制代码块时，自动补全 ``` 代码围栏（防止 Mermaid 等粘贴后无法渲染）',
    // v0.21.0
    generalBackupEnabled: '💾 右键备份',
    generalBackupEnabledDesc: '在文件/文件夹右键菜单中添加"备份"（关闭时不显示）',
    // v0.21.1
    generalBackupAutoClose: '⏱️ 完成时自动关闭对话框',
    generalBackupAutoCloseDesc: '备份成功后 1.5 秒自动关闭对话框（失败时不关闭）',
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
    ttsEngineDesc: '选择语音合成引擎（edge-TTS / WebSpeech / Plachta / 本地 EdgeTTS）',
    ttsEngineEdge: 'edge-TTS（云端·高质量）',
    ttsEngineWebspeech: 'WebSpeech（浏览器标准）',
    ttsEnginePlachta: 'Plachta VITS（云端）',
    ttsEngineEdgeLocal: '本地 EdgeTTS（内置模块）',
    ttsEdgeTtsModulePath: 'Edge TTS 模块路径',
    ttsEdgeTtsModulePathDesc: 'edge_tts 模块路径。留空则使用插件内 edge_tts → Python site-packages',
    ttsEdgeTtsModulePathPlaceholder: '自动（插件内 edge_tts）',
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
    ttsCliHeading: '🖥️ Claude Code CLI 用设置',
    ttsCliFullText: '📖 全文朗读',
    ttsCliFullTextDesc: '开启后无最大字数限制（同步到 voice-config.json）',
    ttsCliMaxChars: '📏 最大字数',
    ttsCliMaxCharsDesc: '超过该字数的文本 CLI 端不朗读',
    ttsCliDebounceMs: '⏱️ 防抖窗口 (ms)',
    ttsCliDebounceMsDesc: 'CLI 连续响应的朗读抑制时间',
    ttsCliFilterHeading: '🔇 朗读文案优化',
    ttsCliFilterEmoji: 'Emoji 表情',
    ttsCliFilterKaomoji: '颜文字 (kaomoji)',
    ttsCliFilterAscii: 'ASCII 表情',
    ttsCliFilterShortcode: 'Emoji 短代码',
    ttsAutoReadHeading: '📢 任务完成时自动朗读',
    ttsAutoReadEnabled: '🔊 自动朗读',
    ttsAutoReadEnabledDesc: '检测到任务完成报告（📢）时自动朗读',
    ttsAutoReadScope: '📏 朗读范围',
    ttsAutoReadScopeDesc: '仅标题: 只读 📢 引用块 / 全文: 朗读整个报告消息',
    ttsAutoReadScopeHeader: '📢 仅标题',
    ttsAutoReadScopeFull: '📄 全文',
    ttsExcludeCallouts: '朗读时排除 Callout',
    ttsExcludeCalloutsDesc: '不朗读「> [!type]」形式的 Callout（成功、注意等）',
    ttsMuteBtnIdle: '🔊 静音',
    ttsMuteBtnPlaying: '⏹ 静音',
    ttsMuteBtnMuted: '🔇 静音',
    ttsFullTextBtnOn: '📖 全文',
    ttsFullTextBtnOff: '📄 摘要',
    ttsInputAiEnabled: 'AI朗读按钮',
    ttsInputAiEnabledDesc: '聊天输入栏的✨按钮：用AI将输入整理为清晰指令，覆盖输入栏并朗读',
    ttsChunkMaxCharsEdge: 'EdgeTTS 分块字数',
    ttsChunkMaxCharsEdgeDesc: 'EdgeTTS 每块最大字符数（100-2000）。默认 500',
    ttsChunkMaxCharsWebspeech: 'WebSpeech 分块字数',
    ttsChunkMaxCharsWebspeechDesc: 'WebSpeech 每块最大字符数（50-140）。默认 140',
    ttsChunkMaxCharsPlachta: 'Plachta 分块字数',
    ttsChunkMaxCharsPlachtaDesc: 'Plachta 每块最大字符数（50-140）。默认 140',
    ttsSpeechFilterHeading: '朗读内容过滤（按类型）',
    ttsSpeechFilterHint: '勾选=朗读时包含。未勾选的项目从朗读中排除',
    ttsSpeechFilterItemHeader: '项目',
    ttsAddToTts: '添加到 TTS',
    ttsSpeechFilterTypeSelection: '① 选择文本',
    ttsSpeechFilterTypeAutoRead: '② 自动朗读',
    ttsSpeechFilterTypeMessage: '④ 消息朗读',
    ttsSpeechFilterTypeInputAi: '⑤ AI朗读',
    ttsSpeechFilterEmoji: '表情符号',
    ttsSpeechFilterKaomoji: '颜文字',
    ttsSpeechFilterAscii: 'ASCII 表情',
    ttsSpeechFilterShortcode: 'Emoji 短代码',
    ttsSpeechFilterCallout: 'Callout',
    ttsSpeechFilterTable: '表格',
    ttsSpeechFilterCode: '代码块',
    ttsSpeechFilterThinking: '思考块',
    ttsSpeechFilterToolCommands: '工具调用',
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
    // v0.22.0
    whitelistHideUnderscoreFolders: '📁 隐藏 _ 开头的文件夹',
    whitelistHideUnderscoreFoldersDesc: '将名称以 _ 开头的文件夹（例如 _templates）从文件浏览器中隐藏',
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
    chromaDescription: '浏览、搜索并查看 ChromaDB 集合。从插件文件夹调用 Python CLI (_chroma_inspect.py)。',
    chromaChromaPath: 'ChromaDB 路径',
    chromaChromaPathDesc: 'Vault 相对路径或绝对路径。默认: chroma_db',
    chromaPythonPath: 'Python 解释器',
    chromaPythonPathDesc: 'Windows: "py" / macOS、Linux: "python3"',
    chromaScriptPath: 'Python 脚本路径 (覆盖)',
    chromaScriptPathDesc: '留空 = <plugin>/_chroma_inspect.py',
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
    chromaHideInternal: '🔒 隐藏 chroma_db 内部文件',
    chromaHideInternalDesc: '在文件资源管理器中展开 chroma_db 时,隐藏哈希文件夹/sqlite/.base,仅显示 PDF/DOCX',
    chromaRagEnabled: '🔎 启用右键 RAG 搜索',
    chromaRagEnabledDesc: '在 chroma_db/PDF・DOCX 下的文件右键菜单中添加「RAG搜索」',
    chromaRagScriptPath: 'query.py 路径',
    chromaRagScriptPathDesc: 'query.py 路径（留空 = 自动引用 <plugin>/query.py）',
    chromaRagConfigPath: 'config.yaml 路径',
    chromaRagConfigPathDesc: 'config.yaml 路径（留空 = 自动引用 <plugin>/config.yaml）',
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
    quotaZhipuApiKey: 'ZHIPU API 密钥',
    quotaZhipuPythonPath: 'ZHIPU Python 路径',
    quotaZhipuPythonPathPlaceholder: 'py / python3 / 完整路径',
    quotaWindowsHeading: '🪟 显示窗口',
    quotaWindowsDesc: '显示使用率的周期。Kimi 固定 5 小时，DeepSeek 显示余额。',
    quotaWindowWeek: '每周',
    quotaWindowClaude: 'Claude 显示窗口',
    quotaWindowZhipu: 'Zhipu 显示窗口',
    quotaWindowMinimax: 'MiniMax 显示窗口',
    quotaTooltipRemaining: '剩余',
    quotaTooltipReset: '重置',
    quotaZhipuValue: '5小时用量',
    quotaDisplayZhipu: '显示智谱',
    // Memory (v0.17.0: MD 保存按钮)
    tabMemory: 'Memory',
    memoryEnabled: 'MD存储按钮',
    memoryEnabledDesc: '在工具栏和回答区块显示按钮，将聊天结果存储到记忆文件夹',
    memoryScope: '存储范围（工具栏）',
    memoryScopeDesc: '工具栏按钮的存储范围。回答区块按钮始终只存储该区块',
    memoryScopePair: '提问＋回答',
    memoryScopeConversation: '整个聊天',
    memoryFolder: '记忆文件夹',
    memoryFolderDesc: '相对路径解析为库内，绝对路径原样使用。默认为 Memory/',
    // v0.23.0
    quickReplySendOk: '发送 OK',
    quickReplySendNg: '发送 NG',
    quickReplySendOption: '发送方案{n}',
    // v0.24.0
    quickReplyShowAllOptions: '始终显示方案按钮',
    quickReplyShowAllOptionsDesc: '开启时始终显示 1️⃣–5️⃣。关闭时仅在回答包含"方案N"时显示',
    // v0.25.0
    quickReplyEnabled: '显示快速回复按钮',
    quickReplyEnabledDesc: '开启（默认）时在 Claudian 聊天输入栏显示 ✅ ❌ 1️⃣–5️⃣。关闭时停止注入按钮',
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