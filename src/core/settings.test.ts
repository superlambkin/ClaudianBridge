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
