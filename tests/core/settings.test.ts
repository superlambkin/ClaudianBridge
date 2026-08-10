import { describe, it, expect } from 'vitest';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, normalizeClaudianBridgeSettings, validateClaudianBridgeSettings } from '../../src/core/settings';

describe('settings', () => {
  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS は全フィールドを持つ', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS).toMatchObject({
      general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false }, migrationResetAvailable: true },
      selection: { enabled: true, folderEnabled: true, delayMs: 300 },
      tts: { enabled: true, engine: 'edge', voices: { zh: '', ja: '', en: '' }, minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' }, voice: '' },
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
});
