import { describe, it, expect } from 'vitest';
import { buildWhitelistCss } from '../../../src/features/whitelist/css-builder';

describe('buildWhitelistCss', () => {
  it('空配列 → null（フィルター無効化）', () => {
    expect(buildWhitelistCss([], true)).toBeNull();
  });

  it('拡張子リストから :has() セレクタを構築する', () => {
    const css = buildWhitelistCss(['md', 'pdf'], false);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path$=".md" i]');
    expect(css).toContain('[data-path$=".pdf" i]');
    expect(css).toContain(':has(');
    expect(css).toContain('display: none !important');
  });

  it('alwaysShowFolders=true → .nav-folder ルールを含む', () => {
    const css = buildWhitelistCss(['md'], true);
    expect(css).toContain('.nav-folder { display: flex !important; }');
  });

  it('alwaysShowFolders=false → .nav-folder ルールを含まない', () => {
    const css = buildWhitelistCss(['md'], false);
    expect(css).not.toContain('.nav-folder');
  });

  it('コメント・id を含む', () => {
    const css = buildWhitelistCss(['md'], false);
    expect(css).toContain('Claudian Bridge Whitelist');
  });
});
