import { describe, it, expect } from 'vitest';
import { normalizeClaudianBridgeSettings } from './settings';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from './settings';
import type { FolderMapping } from '../features/folder-mapping/types';

describe('F-049: folderMappings in GeneralSettings', () => {
  it('fills folderMappings=[] when missing in old data.json', () => {
    const out = normalizeClaudianBridgeSettings({
      // 既存ユーザー想定: general に folderMappings が無い
      general: { outputsMirrorEnabled: true, outputsMirrorPath: 'D:\\foo' },
    } as any);
    expect(Array.isArray(out.general.folderMappings)).toBe(true);
    expect(out.general.folderMappings).toEqual([]);
  });

  it('preserves existing folderMappings array (referential identity)', () => {
    const existing: FolderMapping[] = [
      {
        id: 'abc',
        linkName: 'Projects',
        vaultSubpath: '10_Input',
        externalPath: 'D:\\projects',
        enabled: true,
        createdAt: 1700000000000,
        updatedAt: 1700000000001,
      },
    ];
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: existing },
    } as any);
    expect(out.general.folderMappings).toBe(existing);
  });

  it('preserves outputsMirror* keys untouched (no field rename / loss)', () => {
    const out = normalizeClaudianBridgeSettings({
      general: {
        outputsMirrorEnabled: true,
        outputsMirrorPath: 'D:\\mirror',
        hideDotFolders: false,
      },
    } as any);
    expect(out.general.outputsMirrorEnabled).toBe(true);
    expect(out.general.outputsMirrorPath).toBe('D:\\mirror');
    expect(out.general.hideDotFolders).toBe(false);
  });
});

describe('F-049: DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.folderMappings', () => {
  it('default value is [] (empty array, zero impact on existing users)', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.folderMappings).toEqual([]);
  });
});

describe('F-050: vaultSubpath migration', () => {
  const mapping = (overrides: Record<string, unknown> = {}) => ({
    id: 'x',
    linkName: 'OCR',
    externalPath: 'C:/OCR',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });

  it('injects vaultSubpath=10_Input into legacy record', () => {
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: [mapping()] },
    } as any);
    expect(out.general.folderMappings[0].vaultSubpath).toBe('10_Input');
  });

  it('preserves existing vaultSubpath', () => {
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: [mapping({ vaultSubpath: '60_Tech_Research' })] },
    } as any);
    expect(out.general.folderMappings[0].vaultSubpath).toBe('60_Tech_Research');
  });
});

// v0.55.0 (F-057): Folder Bridge 機能削除 — folderBridges migration テストも削除。

// === v0.56.0 (F-058): 方案ボタンの番号・最大数 ===
describe('normalizeClaudianBridgeSettings - quickReply F-058', () => {
  it('quickReplyMaxOptions 欠落時は既定値 5', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyMaxOptions).toBe(5);
  });

  it('quickReplyNumberFormat 欠落時は既定値 "arabic"', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyNumberFormat).toBe('arabic');
  });

  it('quickReplyMaxOptions=10 → 5 にクランプ', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyMaxOptions: 10 } as never });
    expect(result.general.quickReplyMaxOptions).toBe(5);
  });

  it('quickReplyNumberFormat="unknown" → "arabic" にフォールバック', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyNumberFormat: 'unknown' } as never });
    expect(result.general.quickReplyNumberFormat).toBe('arabic');
  });
});
