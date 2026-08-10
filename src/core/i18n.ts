export type SupportedLocale = 'ja' | 'zh' | 'en';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['ja', 'zh', 'en'];

export interface LocaleStrings {
  tabGeneral: string;
  tabSelection: string;
  tabTts: string;
  tabOffice: string;
  tabWhitelist: string;
  settingsTitle: string;
  resetMigration: string;
  resetMigrationDesc: string;
  resetMigrationButton: string;
  resetMigrationNotice: string;
  migratedFrom: string;
  notMigrated: string;
  migrated: string;
  // Office / Whitelist プレースホルダー
  comingSoon: string;
}

const STRINGS: Record<SupportedLocale, LocaleStrings> = {
  ja: {
    tabGeneral: '🎛️ Claudian Bridge — 一般',
    tabSelection: '📝 テキスト挿入',
    tabTts: '🔊 テキスト読み上げ',
    tabOffice: '📄 ファイル変換',
    tabWhitelist: '🗂️ 拡張子フィルタ',
    settingsTitle: 'Claudian Bridge 設定',
    resetMigration: '🔄 旧設定をやり直す',
    resetMigrationDesc: '旧プラグインの data.json から再取り込み（実行後に Obsidian を再起動）',
    resetMigrationButton: '🔄 移行リセット',
    resetMigrationNotice: '🔄 移行リセット完了。Obsidian を再起動してください。',
    migratedFrom: '旧プラグイン移行状態',
    notMigrated: '⏳ 未移行',
    migrated: '✅ 移行済み',
    comingSoon: '🚧 このタブは次サブプロジェクト（P3/P4）で実装予定です。',
  },
  en: {
    tabGeneral: '🎛️ Claudian Bridge — General',
    tabSelection: '📝 Text Insertion',
    tabTts: '🔊 Text To Speech',
    tabOffice: '📄 File Conversion',
    tabWhitelist: '🗂️ Extension Filter',
    settingsTitle: 'Claudian Bridge Settings',
    resetMigration: '🔄 Re-import Legacy Settings',
    resetMigrationDesc: 'Re-import from legacy plugin data.json (requires Obsidian restart)',
    resetMigrationButton: '🔄 Reset Migration',
    resetMigrationNotice: '🔄 Migration reset. Please restart Obsidian.',
    migratedFrom: 'Legacy plugin migration status',
    notMigrated: '⏳ Not migrated',
    migrated: '✅ Migrated',
    comingSoon: '🚧 This tab will be implemented in the next sub-project (P3/P4).',
  },
  zh: {
    tabGeneral: '🎛️ Claudian Bridge — 一般',
    tabSelection: '📝 文本插入',
    tabTts: '🔊 文本朗读',
    tabOffice: '📄 文件转换',
    tabWhitelist: '🗂️ 扩展名过滤',
    settingsTitle: 'Claudian Bridge 设置',
    resetMigration: '🔄 重新导入旧设置',
    resetMigrationDesc: '从旧插件 data.json 重新导入（需重启 Obsidian）',
    resetMigrationButton: '🔄 重置迁移',
    resetMigrationNotice: '🔄 迁移已重置。请重启 Obsidian。',
    migratedFrom: '旧插件迁移状态',
    notMigrated: '⏳ 未迁移',
    migrated: '✅ 已迁移',
    comingSoon: '🚧 此标签将在下一个子项目 (P3/P4) 中实现。',
  },
};

export function getLocaleStrings(lang: string): LocaleStrings {
  if (lang === 'ja' || lang === 'zh' || lang === 'en') return STRINGS[lang];
  return STRINGS.en;
}
