import { describe, it, expect } from 'vitest';
import { buildWhitelistCss } from '../../../src/features/whitelist/css-builder';

describe('buildWhitelistCss', () => {
  it('空配列 → null（フィルター無効化）', () => {
    expect(buildWhitelistCss([], true, false)).toBeNull();
  });

  it('拡張子リストから :has() セレクタを構築する', () => {
    const css = buildWhitelistCss(['md', 'pdf'], false, false);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path$=".md" i]');
    expect(css).toContain('[data-path$=".pdf" i]');
    expect(css).toContain(':has(');
    expect(css).toContain('display: none !important');
  });

  it('alwaysShowFolders=true → .nav-folder ルールを含む', () => {
    const css = buildWhitelistCss(['md'], true, false);
    expect(css).toContain('.nav-folder { display: flex !important; }');
  });

  it('alwaysShowFolders=false → .nav-folder ルールを含まない', () => {
    const css = buildWhitelistCss(['md'], false, false);
    expect(css).not.toContain('.nav-folder');
  });

  it('コメント・id を含む', () => {
    const css = buildWhitelistCss(['md'], false, false);
    expect(css).toContain('Claudian Bridge Whitelist');
  });
});

describe('buildWhitelistCss - hideUnderscoreFolders (v0.22.0)', () => {
  it('hideUnderscoreFolders=true で _ フォルダ非表示セレクタを含む', () => {
    const css = buildWhitelistCss(['md'], true, true);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path^="_"]');
    expect(css).toContain('[data-path*="/_"]');
    expect(css).toContain('display: none !important');
  });

  it('hideUnderscoreFolders=true でも alwaysShowFolders の flex ルールは維持', () => {
    const css = buildWhitelistCss(['md'], true, true);
    expect(css).toContain('.nav-folder { display: flex !important; }');
    expect(css).toContain('[data-path^="_"]');
  });

  it('hideUnderscoreFolders=false なら _ フォルダセレクタを含まない', () => {
    const css = buildWhitelistCss(['md'], true, false);
    expect(css).not.toBeNull();
    expect(css).not.toContain('[data-path^="_"]');
    expect(css).not.toContain('[data-path*="/_"]');
  });

  it('extensions 空でも hideUnderscoreFolders=true なら CSS を返す', () => {
    const css = buildWhitelistCss([], true, true);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path^="_"]');
    expect(css).not.toContain('.nav-file:not');
  });
});
