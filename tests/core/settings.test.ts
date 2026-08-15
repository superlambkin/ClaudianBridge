import { describe, it, expect } from 'vitest';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, DEFAULT_TTS_CLI_SETTINGS, normalizeClaudianBridgeSettings, validateClaudianBridgeSettings, withFullTextState, isFullTextState } from '../../src/core/settings';

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
      zhipuApiKey: '',
      zhipuPythonPath: expect.any(String),
      displayModels: { claude: true, deepseek: true, kimi: true, minimax: true, zhipu: true },
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
