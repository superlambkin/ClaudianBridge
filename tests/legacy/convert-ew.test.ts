import { describe, it, expect } from 'vitest';
import { convertFromExtensionWhitelist } from '../../src/legacy/convert-ew';

describe('convertFromExtensionWhitelist', () => {
  it('null 入力 → null', () => {
    expect(convertFromExtensionWhitelist(null)).toBeNull();
  });
  it('期待される whitelist 形式を返す', () => {
    const raw = { enabled: false, extensions: ['md', 'JSON', '.pdf '], alwaysShowFolders: false };
    const result = convertFromExtensionWhitelist(raw);
    expect(result).toMatchObject({
      whitelist: { enabled: false, extensions: ['md', 'json', 'pdf'], alwaysShowFolders: false },
    });
  });
  it('型違反はデフォルトで埋める', () => {
    const result = convertFromExtensionWhitelist({ enabled: 'yes', extensions: 'invalid' });
    expect(result?.whitelist.enabled).toBe(true);
    expect(result?.whitelist.extensions).toEqual(expect.arrayContaining(['md', 'canvas', 'pdf']));
    expect(result?.whitelist.alwaysShowFolders).toBe(true);
  });
});
