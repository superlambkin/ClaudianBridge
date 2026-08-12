import { describe, it, expect } from 'vitest';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, normalizeClaudianBridgeSettings, validateClaudianBridgeSettings } from '../../src/core/settings';

describe('settings', () => {
  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS は全フィールドを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS).toMatchObject({
      general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false }, migrationResetAvailable: true },
      selection: { enabled: true, folderEnabled: true, delayMs: 300 },
      tts: { enabled: true, engine: 'edge', voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' }, webspeech: { zh: '', ja: '', en: '' } } },
      office: {},
      whitelist: {},
    });
  });

  it('normalize は欠落キーをデフォルトで埋める', () => {
    const raw = { selection: { delayMs: 500 } };
    const norm = normalizeClaudianBridgeSettings(raw);
    expect(norm.selection.delayMs).toBe(500);
    expect(norm.selection.enabled).toBe(true);
    expect(norm.selection.folderEnabled).toBe(true);
    expect(norm.general.enabled).toBe(true);
  });

  it('validate は型違反を返す（enabled が boolean でない）', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { enabled: 'yes' as unknown as boolean, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false }, migrationResetAvailable: true } };
    expect(validateClaudianBridgeSettings(bad)).toContain('general.enabled');
  });

  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.office は全フィールドを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.office).toMatchObject({
      enabled: true,
      pythonPath: expect.any(String),
      markitdownArgs: '',
      enabledExtensions: expect.arrayContaining(['docx', 'pdf']),
      conflictPolicy: 'overwrite',
      frontmatterTemplate: expect.stringContaining('{{title}}'),
      logLevel: 'info',
      showProgressModal: true,
      outputDirOverride: '',
    });
  });

  it('quotaSwitchSec はデフォルト 5', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.general.quotaSwitchSec).toBe(5);
  });

  it('quotaSwitchSec は [5,600] にクランプ', () => {
    const cfg = normalizeClaudianBridgeSettings({ general: { quotaSwitchSec: 9999 } });
    expect(cfg.general.quotaSwitchSec).toBe(600);
  });

  it('normalize は office の欠落キーをデフォルトで埋める', () => {
    const norm = normalizeClaudianBridgeSettings({ office: { pythonPath: 'py' } });
    expect(norm.office.pythonPath).toBe('py');
    expect(norm.office.enabled).toBe(true);
    expect(norm.office.enabledExtensions).toEqual(['docx', 'xlsx', 'pptx', 'pdf', 'html', 'htm', 'csv']);
  });

  it('validate は office 型違反を返す（enabled が boolean でない）', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, office: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.office, enabled: 'yes' as unknown as boolean } };
    expect(validateClaudianBridgeSettings(bad)).toContain('office.enabled');
  });

  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist は全フィールドを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist).toMatchObject({
      enabled: true,
      extensions: expect.arrayContaining(['md', 'pdf']),
      alwaysShowFolders: true,
    });
  });

  it('normalize は whitelist の欠落キーをデフォルトで埋める', () => {
    const norm = normalizeClaudianBridgeSettings({ whitelist: { enabled: false } });
    expect(norm.whitelist.enabled).toBe(false);
    expect(norm.whitelist.extensions).toEqual(expect.arrayContaining(['md', 'canvas', 'pdf']));
    expect(norm.whitelist.alwaysShowFolders).toBe(true);
  });

  it('normalize は extensions 要素を正規化する（trim/lowercase/先頭ドット除去/空文字除去）', () => {
    const norm = normalizeClaudianBridgeSettings({ whitelist: { extensions: ['.MD', ' PDF ', '', 'JSON'] as unknown as string[] } });
    expect(norm.whitelist.extensions).toEqual(['md', 'pdf', 'json']);
  });

  it('validate は whitelist 型違反を返す（enabled が boolean でない）', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, whitelist: { enabled: 'yes' as unknown as boolean, extensions: [], alwaysShowFolders: true } };
    expect(validateClaudianBridgeSettings(bad)).toContain('whitelist.enabled');
  });

  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.chroma は全フィールドを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.chroma).toMatchObject({
      enabled: false,
      chromaPath: 'chroma_db',
      pythonPath: expect.any(String),
      embeddingModel: '',
      defaultNResults: 5,
      recordPreviewLength: 240,
      showProgressModal: true,
      enableRawSql: false,
      scriptPath: '',
    });
  });

  it('normalize は chroma の欠落キーをデフォルトで埋める', () => {
    const norm = normalizeClaudianBridgeSettings({ chroma: { chromaPath: 'my_chroma' } });
    expect(norm.chroma.chromaPath).toBe('my_chroma');
    expect(norm.chroma.enabled).toBe(false);
    expect(norm.chroma.defaultNResults).toBe(5);
  });

  it('normalize は chroma の numeric を default で埋める', () => {
    const norm = normalizeClaudianBridgeSettings({ chroma: { defaultNResults: 'bad' as unknown as number } });
    expect(norm.chroma.defaultNResults).toBe(5);
  });

  it('normalize は chroma.defaultNResults を [1,100] にクランプする', () => {
    expect(normalizeClaudianBridgeSettings({ chroma: { defaultNResults: 100000 } }).chroma.defaultNResults).toBe(100);
    expect(normalizeClaudianBridgeSettings({ chroma: { defaultNResults: -5 } }).chroma.defaultNResults).toBe(1);
    expect(normalizeClaudianBridgeSettings({ chroma: { defaultNResults: 0 } }).chroma.defaultNResults).toBe(1);
    expect(normalizeClaudianBridgeSettings({ chroma: { defaultNResults: 42 } }).chroma.defaultNResults).toBe(42);
    // round-trip: 12.7 → 13
    expect(normalizeClaudianBridgeSettings({ chroma: { defaultNResults: 12.7 } }).chroma.defaultNResults).toBe(13);
  });

  it('normalize は chroma.recordPreviewLength を [20,10000] にクランプする', () => {
    expect(normalizeClaudianBridgeSettings({ chroma: { recordPreviewLength: 5 } }).chroma.recordPreviewLength).toBe(20);
    expect(normalizeClaudianBridgeSettings({ chroma: { recordPreviewLength: 99999 } }).chroma.recordPreviewLength).toBe(10000);
    expect(normalizeClaudianBridgeSettings({ chroma: { recordPreviewLength: 240 } }).chroma.recordPreviewLength).toBe(240);
  });

  it('validate は chroma 型違反を返す（enabled が boolean でない）', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, chroma: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.chroma, enabled: 'yes' as unknown as boolean } };
    expect(validateClaudianBridgeSettings(bad)).toContain('chroma.enabled');
  });

  // === v0.2.0: Object context menu settings ===
  describe('object context menu (v0.2.0)', () => {
    it('objectMenuEnabled のデフォルトは true', () => {
      const norm = normalizeClaudianBridgeSettings({});
      expect(norm.selection.objectMenuEnabled).toBe(true);
    });

    it('objectMenuExcludeSelectors のデフォルトは 4 個', () => {
      const norm = normalizeClaudianBridgeSettings({});
      expect(norm.selection.objectMenuExcludeSelectors).toEqual([
        '.cb-popup',
        '.claudian-popup',
        '.menu',
        '.suggestion-container',
      ]);
    });

    it('不正な objectMenuEnabled (string) は boolean に正規化される', () => {
      const norm = normalizeClaudianBridgeSettings({
        selection: { objectMenuEnabled: 'yes' as unknown as boolean },
      });
      expect(norm.selection.objectMenuEnabled).toBe(true);
    });

    it('objectMenuExcludeSelectors が配列でない場合はデフォルトに fallback', () => {
      const norm = normalizeClaudianBridgeSettings({
        selection: { objectMenuExcludeSelectors: 'bad' as unknown as string[] },
      });
      expect(norm.selection.objectMenuExcludeSelectors).toEqual([
        '.cb-popup',
        '.claudian-popup',
        '.menu',
        '.suggestion-container',
      ]);
    });
  });
});

describe('normalizeClaudianBridgeSettings - quota', () => {
  it('quotaEnabled のデフォルトは false', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaEnabled).toBe(false);
  });

  it('quotaRefreshSec のデフォルトは 60', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaRefreshSec).toBe(60);
  });

  it('quotaEnabled が boolean でない場合 false に正規化', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaEnabled: 'yes' as unknown as boolean } });
    expect(s.general.quotaEnabled).toBe(false);
  });

  it('quotaRefreshSec が 0 のとき 0 を許可', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaRefreshSec: 0 } });
    expect(s.general.quotaRefreshSec).toBe(0);
  });

  it('quotaRefreshSec が 5 のとき 10 にクランプ', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaRefreshSec: 5 } });
    expect(s.general.quotaRefreshSec).toBe(10);
  });

  it('quotaRefreshSec が 9999 のとき 600 にクランプ', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaRefreshSec: 9999 } });
    expect(s.general.quotaRefreshSec).toBe(600);
  });

  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general に quota フィールドが含まれる', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general).toHaveProperty('quotaEnabled');
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general).toHaveProperty('quotaRefreshSec');
  });

  it('quota セクションはデフォルトで空の API キーを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota).toEqual({
      claudeSettingsPath: expect.any(String),
      deepseekApiKey: '',
      kimiApiKey: '',
      minimaxApiKey: '',
      displayModels: { claude: true, deepseek: true, kimi: true, minimax: true },
    });
  });

  it('normalize は quota セクションの API キーを保持する', () => {
    const s = normalizeClaudianBridgeSettings({
      quota: { deepseekApiKey: 'sk-ds', kimiApiKey: 'sk-kimi', minimaxApiKey: 'sk-mm' },
    });
    expect(s.quota.deepseekApiKey).toBe('sk-ds');
    expect(s.quota.kimiApiKey).toBe('sk-kimi');
    expect(s.quota.minimaxApiKey).toBe('sk-mm');
  });

  it('validate は quota.deepseekApiKey が文字列でない場合エラーを返す', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, deepseekApiKey: 42 as unknown as string },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('quota.deepseekApiKey');
  });

  it('normalize は quota.displayModels を保持する', () => {
    const s = normalizeClaudianBridgeSettings({
      quota: { displayModels: { claude: false, deepseek: true, kimi: false, minimax: true } },
    });
    expect(s.quota.displayModels).toEqual({ claude: false, deepseek: true, kimi: false, minimax: true });
  });

  it('validate は quota.displayModels.claude が boolean でない場合エラーを返す', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, displayModels: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.displayModels, claude: 'x' as unknown as boolean } },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('quota.displayModels.claude');
  });

  it('objectMenuTypeFlags / objectMenuContextFlags はデフォルト全ON', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.selection.objectMenuTypeFlags).toEqual({ button: true, input: true, link: true, element: true });
    expect(s.selection.objectMenuContextFlags).toEqual({ ribbon: true, sidebar: true, modal: true, settings: true, menu: true, workspace: true });
  });

  it('normalize は objectMenuTypeFlags を保持する', () => {
    const s = normalizeClaudianBridgeSettings({
      selection: { objectMenuTypeFlags: { button: false, input: true, link: true, element: false } },
    });
    expect(s.selection.objectMenuTypeFlags.button).toBe(false);
    expect(s.selection.objectMenuTypeFlags.element).toBe(false);
  });

  it('validate は objectMenuTypeFlags.button が boolean でない場合エラーを返す', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      selection: {
        ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection,
        objectMenuTypeFlags: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection.objectMenuTypeFlags, button: 'x' as unknown as boolean },
      },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('objectMenuTypeFlags.button');
  });
});
