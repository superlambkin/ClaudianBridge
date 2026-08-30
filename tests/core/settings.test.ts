import { describe, it, expect } from 'vitest';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, DEFAULT_TTS_CLI_SETTINGS, normalizeClaudianBridgeSettings, normalizeWhitelistSettings, validateClaudianBridgeSettings, withFullTextState, isFullTextState, TTS_LANGUAGE_MODES, DEFAULT_TTS_EDGE_CLOUD, normalizeTtsSettings, TtsLanguageMode } from '../../src/core/settings';

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

  it('validateClaudianBridgeSettings: general.backupEnabled が boolean であること', () => {
    const valid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupEnabled: true } };
    expect(validateClaudianBridgeSettings(valid)).toBeNull();

    const invalid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupEnabled: 'yes' as unknown as boolean } };
    expect(validateClaudianBridgeSettings(invalid)).toMatch(/general\.backupEnabled/);
  });

  it('validateClaudianBridgeSettings: general.backupAutoClose が boolean であること', () => {
    const valid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupAutoClose: true } };
    expect(validateClaudianBridgeSettings(valid)).toBeNull();

    const invalid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupAutoClose: 'yes' as unknown as boolean } };
    expect(validateClaudianBridgeSettings(invalid)).toMatch(/general\.backupAutoClose/);
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

  it('validateClaudianBridgeSettings: whitelist.hideUnderscoreFolders が boolean であること', () => {
    const valid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, whitelist: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist, hideUnderscoreFolders: true } };
    expect(validateClaudianBridgeSettings(valid)).toBeNull();

    const invalid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, whitelist: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist, hideUnderscoreFolders: 'yes' as unknown as boolean } };
    expect(validateClaudianBridgeSettings(invalid)).toMatch(/whitelist\.hideUnderscoreFolders/);
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
      zhipuApiKey: '',
      zhipuPythonPath: expect.any(String),
      displayModels: { claude: true, deepseek: true, kimi: true, minimax: true, zhipu: true },
      windows: { zhipu: '5h', claude: '5h', minimax: '5h' },
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
    expect(s.quota.displayModels).toEqual({ claude: false, deepseek: true, kimi: false, minimax: true, zhipu: true });
  });

  it('validate は quota.displayModels.claude が boolean でない場合エラーを返す', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, displayModels: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.displayModels, claude: 'x' as unknown as boolean } },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('quota.displayModels.claude');
  });

  it('quota.windows は既定で全て 5h', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.quota.windows).toEqual({ zhipu: '5h', claude: '5h', minimax: '5h' });
  });

  it('normalize は quota.windows の week を保持し不正値は 5h', () => {
    const s = normalizeClaudianBridgeSettings({
      quota: { windows: { zhipu: 'week', claude: 'bogus' as unknown as '5h', minimax: 'week' } },
    });
    expect(s.quota.windows.zhipu).toBe('week');
    expect(s.quota.windows.claude).toBe('5h');
    expect(s.quota.windows.minimax).toBe('week');
  });

  it('validate は quota.windows.zhipu の不正値をエラーにする', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, windows: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.windows, zhipu: 'bogus' as unknown as '5h' } },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('quota.windows.zhipu');
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

describe('normalizeClaudianBridgeSettings - quota zhipu (Task 3)', () => {
  it('quota.zhipuApiKey / zhipuPythonPath が正規化される', () => {
    const norm = normalizeClaudianBridgeSettings({ quota: { zhipuApiKey: 'sk-zhipu', zhipuPythonPath: 'python3' } });
    expect(norm.quota.zhipuApiKey).toBe('sk-zhipu');
    expect(norm.quota.zhipuPythonPath).toBe('python3');
  });

  it('DEFAULT: zhipuApiKey は空・zhipuPythonPath は非空・displayModels.zhipu は true', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.zhipuApiKey).toBe('');
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.zhipuPythonPath).toBeTruthy();
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.displayModels.zhipu).toBe(true);
  });

  it('normalize: displayModels 欠落の zhipu は true になる', () => {
    const norm = normalizeClaudianBridgeSettings({});
    expect(norm.quota.displayModels.zhipu).toBe(true);
  });

  it('validate: quota.zhipuApiKey 型違反を返す', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, zhipuApiKey: 123 as unknown as string } };
    expect(validateClaudianBridgeSettings(bad)).toContain('quota.zhipuApiKey');
  });

  it('normalize: zhipuPythonPath 空文字 → デフォルト', () => {
    const defaultPython = typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3';
    const norm = normalizeClaudianBridgeSettings({ quota: { zhipuPythonPath: '   ' } });
    expect(norm.quota.zhipuPythonPath).toBe(defaultPython);
  });

  it('normalize: zhipuPythonPath 非文字列 → デフォルト', () => {
    const defaultPython = typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3';
    const norm = normalizeClaudianBridgeSettings({ quota: { zhipuPythonPath: 42 as unknown as string } });
    expect(norm.quota.zhipuPythonPath).toBe(defaultPython);
  });
});

describe('tts (v0.8.0: Plachta engine, anime-tts removed)', () => {
  it('TC-A02 続き: validate が未知の engine を拒否する', () => {
    const cfg = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, tts: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts, engine: 'unknown' as unknown as 'edge' } };
    expect(validateClaudianBridgeSettings(cfg)).toContain('tts.engine');
  });
});

describe('tts.cli (v0.10.0)', () => {
  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.cli はデフォルト値を持つ', () => {
    const cfg = DEFAULT_CLAUDIAN_BRIDGE_SETTINGS;
    expect(cfg.tts.cli).toEqual({
      full_text: false,
      max_chars: 300,
      debounce_ms: 2000,
      speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
    });
  });

  it('normalize は tts.cli の欠落キーをデフォルトで埋める', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { cli: { max_chars: 500 } } });
    expect(cfg.tts.cli?.max_chars).toBe(500);
    expect(cfg.tts.cli?.full_text).toBe(false);
    expect(cfg.tts.cli?.debounce_ms).toBe(2000);
    expect(cfg.tts.cli?.speech_filter?.emoji).toBe(true);
  });

  it('normalize は tts.cli.max_chars を正の整数にクランプする', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { cli: { max_chars: -5 } } });
    expect(cfg.tts.cli?.max_chars).toBe(300);
  });

  it('migratedFrom.claudeTtsSettings はデフォルト false', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.general.migratedFrom.claudeTtsSettings).toBe(false);
  });

  it('validate は tts.cli 型違反を返す（full_text が boolean でない）', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      tts: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts, cli: { ...DEFAULT_TTS_CLI_SETTINGS, full_text: 'yes' as unknown as boolean } },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.cli.full_text');
  });

  // === v0.11.0: tts.autoRead ===
  it('normalize: autoRead 欠落時はデフォルト補完（enabled: true, scope: header）', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(n.tts.autoRead).toEqual({ enabled: true, scope: 'header' });
  });

  it('normalize: scope=full と enabled=false を保持', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { autoRead: { enabled: false, scope: 'full' } } });
    expect(n.tts.autoRead).toEqual({ enabled: false, scope: 'full' });
  });

  it('normalize: scope 不正値は header にフォールバック', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { autoRead: { enabled: true, scope: 'bogus' } } });
    expect(n.tts.autoRead?.scope).toBe('header');
  });

  it('validate: 正規化済み設定は pass、scope 不正値は拒否', () => {
    const ok = normalizeClaudianBridgeSettings({});
    expect(validateClaudianBridgeSettings(ok)).toBeNull();
    const bad = { ...ok, tts: { ...ok.tts, autoRead: { enabled: true, scope: 'bogus' as never } } };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.autoRead.scope');
  });
});

describe('normalizeClaudianBridgeSettings - v0.12.0 legacy reconcile', () => {
  it('autoRead 未設定 + cli.full_text=true（旧v0.11.1）→ scope=full に引き継ぐ', () => {
    const raw = {
      tts: {
        enabled: true,
        engine: 'edge',
        voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' }, webspeech: { zh: '', ja: '', en: '' } },
        cli: { full_text: true, max_chars: 300, debounce_ms: 2000, speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
      },
    };
    const cfg = normalizeClaudianBridgeSettings(raw);
    expect(cfg.tts.autoRead?.scope).toBe('full');
    expect(cfg.tts.cli?.full_text).toBe(true);
  });

  it('autoRead 未設定 + cli.full_text=false → scope=header のまま', () => {
    const raw = {
      tts: {
        enabled: true,
        engine: 'edge',
        voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' }, webspeech: { zh: '', ja: '', en: '' } },
        cli: { full_text: false, max_chars: 300, debounce_ms: 2000, speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
      },
    };
    const cfg = normalizeClaudianBridgeSettings(raw);
    expect(cfg.tts.autoRead?.scope).toBe('header');
    expect(cfg.tts.cli?.full_text).toBe(false);
  });
});

describe('withFullTextState / isFullTextState (v0.12.0)', () => {
  it('fullText=true → scope=full かつ cli.full_text=true', () => {
    const next = withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, true);
    expect(next.tts.autoRead?.scope).toBe('full');
    expect(next.tts.cli?.full_text).toBe(true);
  });

  it('fullText=false → scope=header かつ cli.full_text=false', () => {
    const next = withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, false);
    expect(next.tts.autoRead?.scope).toBe('header');
    expect(next.tts.cli?.full_text).toBe(false);
  });

  it('isFullTextState は autoRead.scope から判定する', () => {
    expect(isFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS)).toBe(false);
    expect(isFullTextState(withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, true))).toBe(true);
  });

  it('元オブジェクトを変更しない（イミュータブル）', () => {
    const cfg = DEFAULT_CLAUDIAN_BRIDGE_SETTINGS;
    withFullTextState(cfg, true);
    expect(cfg.tts.autoRead?.scope).toBe('header');
    expect(cfg.tts.cli?.full_text).toBe(false);
  });
});

describe('tts.inputAi (v0.16 AI読み上げボタン)', () => {
  it('未設定時はデフォルト { enabled: true } を補完する', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(cfg.tts.inputAi).toEqual({ enabled: true });
  });

  it('enabled=false を保持する', () => {
    const cfg = normalizeClaudianBridgeSettings({
      tts: { enabled: true, engine: 'edge', inputAi: { enabled: false } },
    });
    expect(cfg.tts.inputAi).toEqual({ enabled: false });
  });

  it('型が不正な値はデフォルトへフォールバックする', () => {
    const cfg = normalizeClaudianBridgeSettings({
      tts: { enabled: true, engine: 'edge', inputAi: { enabled: 'yes' } as never },
    });
    expect(cfg.tts.inputAi).toEqual({ enabled: true });
  });

  it('validate が inputAi.enabled の型を検証する', () => {
    const bad = normalizeClaudianBridgeSettings({});
    (bad.tts.inputAi as { enabled: unknown }).enabled = 1;
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.inputAi.enabled');
  });
});

describe('memory settings', () => {
  it('デフォルト値（enabled=true / scope=pair / folder=Memory/）を持つ', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.memory).toEqual({ enabled: true, scope: 'pair', folder: 'Memory/' });
  });

  it('不正値はデフォルトにフォールバックする', () => {
    const cfg = normalizeClaudianBridgeSettings({ memory: { enabled: 'x', scope: 'bad', folder: '' } as never });
    expect(cfg.memory).toEqual({ enabled: true, scope: 'pair', folder: 'Memory/' });
  });

  it('有効な値は保持される', () => {
    const cfg = normalizeClaudianBridgeSettings({ memory: { enabled: false, scope: 'conversation', folder: 'D:/mem' } });
    expect(cfg.memory).toEqual({ enabled: false, scope: 'conversation', folder: 'D:/mem' });
  });

  it('validateClaudianBridgeSettings が memory を検証する', () => {
    expect(validateClaudianBridgeSettings(normalizeClaudianBridgeSettings({}))).toBeNull();
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, memory: { enabled: 'x', scope: 'pair', folder: 'Memory/' } } as never;
    expect(validateClaudianBridgeSettings(bad)).toContain('memory.enabled');
  });
});

describe('tts.speechFilter (v0.17 仕様改良)', () => {
  it('未設定時は speechFilter デフォルト（table のみ ON）を補完する', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(cfg.tts.speechFilter.selection).toEqual({ emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: true, code: false, thinking: false, toolCommands: false });
  });

  it('speechFilter の各タイプを保持する', () => {
    const raw = { tts: { enabled: true, engine: 'edge', speechFilter: { message: { emoji: true, table: false } } } };
    const cfg = normalizeClaudianBridgeSettings(raw as never);
    expect(cfg.tts.speechFilter.message.emoji).toBe(true);
    expect(cfg.tts.speechFilter.message.table).toBe(false);
    // 未指定タイプはデフォルト
    expect(cfg.tts.speechFilter.autoRead).toEqual(cfg.tts.speechFilter.selection);
  });

  it('マイグレーション: 新 speechFilter が一部タイプのみ → 他タイプはレガシー値にフォールバック', () => {
    const raw = {
      tts: {
        enabled: true, engine: 'edge',
        cli: { speech_filter: { emoji: true, kaomoji: false } },
        speechFilter: { message: { emoji: true, table: false } },
      },
    };
    const cfg = normalizeClaudianBridgeSettings(raw as never);
    // message: 新値優先
    expect(cfg.tts.speechFilter.message.emoji).toBe(true);
    expect(cfg.tts.speechFilter.message.table).toBe(false);
    // 未指定タイプ（selection / autoRead / inputAi）: レガシー値（ON=除去 → 反転）にフォールバック
    expect(cfg.tts.speechFilter.selection.emoji).toBe(false);   // 旧 true(除去) → 新 false(読まない)
    expect(cfg.tts.speechFilter.selection.kaomoji).toBe(true);  // 旧 false → 新 true(読む)
    expect(cfg.tts.speechFilter.autoRead.emoji).toBe(false);
    expect(cfg.tts.speechFilter.inputAi.emoji).toBe(false);
  });

  it('マイグレーション: 既存 cli.speech_filter(ON=除去) を全タイプへ反転して引き継ぐ', () => {
    const raw = { tts: { enabled: true, engine: 'edge', cli: { speech_filter: { emoji: true, kaomoji: false } } } };
    const cfg = normalizeClaudianBridgeSettings(raw as never);
    expect(cfg.tts.speechFilter.selection.emoji).toBe(false);      // 旧 true(除去) → 新 false(読まない)
    expect(cfg.tts.speechFilter.selection.kaomoji).toBe(true);     // 旧 false → 新 true(読む)
  });

  it('マイグレーション: 既存 excludeCallouts を callout へ反転して引き継ぐ', () => {
    const raw = { tts: { enabled: true, engine: 'edge', excludeCallouts: true } };
    const cfg = normalizeClaudianBridgeSettings(raw as never);
    expect(cfg.tts.speechFilter.selection.callout).toBe(false);    // 旧 true(除外) → 新 false(読まない)
  });

  it('validate が speechFilter を検証する', () => {
    const bad2 = normalizeClaudianBridgeSettings({});
    (bad2.tts.speechFilter.selection as { emoji: unknown }).emoji = 'x';
    expect(validateClaudianBridgeSettings(bad2)).toContain('tts.speechFilter');
  });
});

describe('tts.speechFilter.toolCommands (v0.18.1)', () => {
  it('toolCommands はデフォルト false（未設定時に補完される）', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(cfg.tts.speechFilter.selection.toolCommands).toBe(false);
  });

  it('toolCommands: true を保持する', () => {
    const raw = { tts: { enabled: true, engine: 'edge', speechFilter: { selection: { toolCommands: true } } } };
    const cfg = normalizeClaudianBridgeSettings(raw as never);
    expect(cfg.tts.speechFilter.selection.toolCommands).toBe(true);
  });

  it('validate が toolCommands の型を検証する', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    (cfg.tts.speechFilter.selection as unknown as { toolCommands: unknown }).toolCommands = 'x';
    expect(validateClaudianBridgeSettings(cfg)).toContain('tts.speechFilter.selection.toolCommands');
  });
});

describe('tts.chunkMaxChars (v0.18 エンジン別マップ)', () => {
  it('未設定時はデフォルト（edge=500・webspeech=140・plachta=140）を補完する', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 500, webspeech: 140, plachta: 140 });
  });

  it('既存 number（v0.17）は webspeech/plachta に引き継ぎ・edge は 500 に初期化する', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge', chunkMaxChars: 100 } });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 500, webspeech: 100, plachta: 100 });
  });

  it('エンジン別オブジェクトを保持する', () => {
    const cfg = normalizeClaudianBridgeSettings({
      tts: { enabled: true, engine: 'edge', chunkMaxChars: { edge: 800, webspeech: 100, plachta: 60 } },
    });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 800, webspeech: 100, plachta: 60 });
  });

  it('edge は 100〜2000・他は 50〜140 にクランプされる', () => {
    const cfg = normalizeClaudianBridgeSettings({
      tts: { enabled: true, engine: 'edge', chunkMaxChars: { edge: 9999, webspeech: 10, plachta: 300 } },
    });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 2000, webspeech: 50, plachta: 140 });
  });

  it('既存 number が範囲外でもクランプされる（0 → 50）', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge', chunkMaxChars: 0 } });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 500, webspeech: 50, plachta: 50 });
  });

  it('既存 number が範囲外でもクランプされる（200 → 140）', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge', chunkMaxChars: 200 } });
    expect(cfg.tts.chunkMaxChars).toEqual({ edge: 500, webspeech: 140, plachta: 140 });
  });

  it('validate がエンジン別の値域を検証する', () => {
    const bad = normalizeClaudianBridgeSettings({});
    (bad.tts.chunkMaxChars as { edge: unknown }).edge = 50; // 100 未満
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.chunkMaxChars.edge');
  });
});

describe('chroma-fs settings', () => {
  it('デフォルト値（hideInternal=true / ragEnabled=false / パス空）を持つ', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.chroma.hideInternal).toBe(true);
    expect(cfg.chroma.ragEnabled).toBe(false);
    expect(cfg.chroma.ragScriptPath).toBe('');
    expect(cfg.chroma.ragConfigPath).toBe('');
  });

  it('不正値はデフォルトにフォールバックする', () => {
    const cfg = normalizeClaudianBridgeSettings({
      chroma: { hideInternal: 'x', ragEnabled: 'y', ragScriptPath: 1, ragConfigPath: 2 } as never,
    });
    expect(cfg.chroma.hideInternal).toBe(true);
    expect(cfg.chroma.ragEnabled).toBe(false);
    expect(cfg.chroma.ragScriptPath).toBe('');
    expect(cfg.chroma.ragConfigPath).toBe('');
  });

  it('有効な値は保持される', () => {
    const cfg = normalizeClaudianBridgeSettings({
      chroma: { hideInternal: false, ragEnabled: true, ragScriptPath: 'D:/AI-Agent/word-pdf-rag/query.py', ragConfigPath: 'D:/AI-Agent/word-pdf-rag/config.yaml' },
    });
    expect(cfg.chroma.hideInternal).toBe(false);
    expect(cfg.chroma.ragEnabled).toBe(true);
    expect(cfg.chroma.ragScriptPath).toBe('D:/AI-Agent/word-pdf-rag/query.py');
    expect(cfg.chroma.ragConfigPath).toBe('D:/AI-Agent/word-pdf-rag/config.yaml');
  });

  it('validateClaudianBridgeSettings が ragScriptPath / ragConfigPath を検証する', () => {
    expect(validateClaudianBridgeSettings(normalizeClaudianBridgeSettings({}))).toBeNull();
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, chroma: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.chroma, ragScriptPath: 1 } } as never;
    expect(validateClaudianBridgeSettings(bad)).toContain('ragScriptPath');
  });
});

describe('tts.edgeTtsModulePath (ローカル EdgeTTS, v0.20.0)', () => {
  it('DEFAULT: edgeTtsModulePath は空文字', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.edgeTtsModulePath).toBe('');
  });
  it('normalize: 文字列を保持する', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { edgeTtsModulePath: 'C:\\MyEdgeTts' } });
    expect(n.tts.edgeTtsModulePath).toBe('C:\\MyEdgeTts');
  });
  it('normalize: 欠落・非文字列は空文字', () => {
    expect(normalizeClaudianBridgeSettings({}).tts.edgeTtsModulePath).toBe('');
    expect(normalizeClaudianBridgeSettings({ tts: { edgeTtsModulePath: 42 as unknown as string } }).tts.edgeTtsModulePath).toBe('');
  });
  it('normalize: engine edge-local を許可', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { engine: 'edge-local' } });
    expect(n.tts.engine).toBe('edge-local');
  });
  it('validate: edgeTtsModulePath 非文字列は拒否', () => {
    const ok = normalizeClaudianBridgeSettings({});
    const bad = { ...ok, tts: { ...ok.tts, edgeTtsModulePath: 42 as unknown as string } };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.edgeTtsModulePath');
  });
  it('validate: engine edge-local は許可される', () => {
    const ok = normalizeClaudianBridgeSettings({ tts: { engine: 'edge-local' } });
    expect(validateClaudianBridgeSettings(ok)).toBeNull();
  });
});

describe('normalizeClaudianBridgeSettings - general.backupEnabled (v0.21.0)', () => {
  it('normalizeClaudianBridgeSettings: general.backupEnabled デフォルト true', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.backupEnabled).toBe(true);
  });

  it('normalizeClaudianBridgeSettings: general.backupEnabled=false 明示設定', () => {
    const result = normalizeClaudianBridgeSettings({ general: { backupEnabled: false } });
    expect(result.general.backupEnabled).toBe(false);
  });
});

describe('normalizeClaudianBridgeSettings - general.backupAutoClose (v0.21.1)', () => {
  it('normalizeClaudianBridgeSettings: general.backupAutoClose デフォルト true', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.backupAutoClose).toBe(true);
  });

  it('normalizeClaudianBridgeSettings: general.backupAutoClose=false 明示設定', () => {
    const result = normalizeClaudianBridgeSettings({ general: { backupAutoClose: false } });
    expect(result.general.backupAutoClose).toBe(false);
  });

  // === v0.24.0: quickReplyShowAllOptions ===
  it('normalizeClaudianBridgeSettings: general.quickReplyShowAllOptions デフォルト false', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyShowAllOptions).toBe(false);
  });

  it('normalizeClaudianBridgeSettings: general.quickReplyShowAllOptions=true 明示設定', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyShowAllOptions: true } });
    expect(result.general.quickReplyShowAllOptions).toBe(true);
  });

  // === v0.25.0: quickReplyEnabled ===
  it('normalizeClaudianBridgeSettings: general.quickReplyEnabled デフォルト true', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyEnabled).toBe(true);
  });

  it('normalizeClaudianBridgeSettings: general.quickReplyEnabled=false 明示設定', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyEnabled: false } });
    expect(result.general.quickReplyEnabled).toBe(false);
  });
});

describe('normalizeWhitelistSettings (v0.22.0)', () => {
  it('normalizeWhitelistSettings: hideUnderscoreFolders デフォルト true', () => {
    const result = normalizeWhitelistSettings({});
    expect(result.hideUnderscoreFolders).toBe(true);
  });

  it('normalizeWhitelistSettings: hideUnderscoreFolders=false 明示設定', () => {
    const result = normalizeWhitelistSettings({ hideUnderscoreFolders: false });
    expect(result.hideUnderscoreFolders).toBe(false);
  });
});

describe('TtsLanguageMode / TtsEdgeCloudSettings', () => {
  it('TTS_LANGUAGE_MODES は auto / ja / zh / en', () => {
    expect(TTS_LANGUAGE_MODES).toEqual(['auto', 'ja', 'zh', 'en']);
  });

  it('DEFAULT_TTS_EDGE_CLOUD は空文字 + 30000ms', () => {
    expect(DEFAULT_TTS_EDGE_CLOUD).toEqual({
      serverUrl: '',
      authToken: '',
      timeout: 30_000,
    });
  });

  it('normalizeTtsSettings: addToTtsLanguageMode 未設定 → auto', () => {
    const out = normalizeTtsSettings({ engine: 'edge-local', voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} } });
    expect(out.addToTtsLanguageMode).toBe('auto');
  });

  it('normalizeTtsSettings: autoReadLanguageMode=ja は維持', () => {
    const out = normalizeTtsSettings({
      engine: 'edge-local',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      autoReadLanguageMode: 'ja',
    });
    expect(out.autoReadLanguageMode).toBe('ja');
  });

  it('normalizeTtsSettings: 異常な addToTtsLanguageMode → auto にフォールバック', () => {
    const out = normalizeTtsSettings({
      engine: 'edge-local',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      addToTtsLanguageMode: 'fr' as unknown as TtsLanguageMode,
    });
    expect(out.addToTtsLanguageMode).toBe('auto');
  });

  it('normalizeTtsSettings: edgeCloud 部分設定は DEFAULT とマージ', () => {
    const out = normalizeTtsSettings({
      engine: 'edge',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      edgeCloud: { serverUrl: 'https://x.local', authToken: '', timeout: 5000 },
    });
    expect(out.edgeCloud).toEqual({
      serverUrl: 'https://x.local',
      authToken: '',
      timeout: 5000,
    });
  });

  it('normalizeTtsSettings: engine 未指定 → edge-local にフォールバック（v0.27 デフォルト）', () => {
    const out = normalizeTtsSettings({
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
    } as unknown);
    expect(out.engine).toBe('edge-local');
  });

  describe('normalizeTtsSettings autoReadReportScript (v0.28.0)', () => {
    it('未設定時は既定 true', () => {
      const tts = normalizeTtsSettings({});
      expect(tts.autoReadReportScript).toBe(true);
    });
    it('false を指定した場合は false を保持', () => {
      const tts = normalizeTtsSettings({ autoReadReportScript: false });
      expect(tts.autoReadReportScript).toBe(false);
    });
    it('boolean 以外は既定 true', () => {
      const tts = normalizeTtsSettings({ autoReadReportScript: 'yes' as unknown as boolean });
      expect(tts.autoReadReportScript).toBe(true);
    });
  });
});
