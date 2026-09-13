export function buildWhitelistCss(
  extensions: string[],
  alwaysShowFolders: boolean,
  hideUnderscoreFolders: boolean,
  hideDotFolders = false,
): string | null {
  // 拡張子フィルタと _ / . フォルダ非表示のすべてが無効なら null
  if (extensions.length === 0 && !hideUnderscoreFolders && !hideDotFolders) return null;

  const extSelectors = extensions
    .map((ext) => `      [data-path$=".${ext}" i]`)
    .join(',\n');

  const folderRule = alwaysShowFolders
    ? '\n/* folders always visible */\n.nav-folder { display: flex !important; }'
    : '';

  const underscoreRule = hideUnderscoreFolders
    ? // data-path^="_" covers top-level _ folders; data-path*="/_" covers nested
      // _ folders. The latter over-matches descendants of _ folders (harmless:
      // the ancestor .nav-folder is already display:none, hiding the subtree).
      '\n/* hide _-prefixed folders (v0.22.0) */\n' +
      '.nav-folder:has(> .nav-folder-title[data-path^="_"]),\n' +
      '.nav-folder:has(> .nav-folder-title[data-path*="/_"]) {\n' +
      '  display: none !important;\n' +
      '}'
    : '';

  // v0.41.0: . で始まるフォルダを非表示（data-path^="." トップレベル / data-path*="/." ネスト）
  const dotRule = hideDotFolders
    ? '\n/* hide dot-prefixed folders (v0.41.0) */\n' +
      '.nav-folder:has(> .nav-folder-title[data-path^="."]),\n' +
      '.nav-folder:has(> .nav-folder-title[data-path*="/."]) {\n' +
      '  display: none !important;\n' +
      '}'
    : '';

  const fileRule = extensions.length > 0
    ? `.nav-files-container .nav-file:not(:has(\n  > .nav-file-title:is(\n${extSelectors}\n  )\n)) {\n  display: none !important;\n}`
    : '';

  return `/* ── Claudian Bridge Whitelist ── */\n${fileRule}${folderRule}${underscoreRule}${dotRule}`;
}
