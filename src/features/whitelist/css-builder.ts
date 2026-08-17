export function buildWhitelistCss(
  extensions: string[],
  alwaysShowFolders: boolean,
  hideUnderscoreFolders: boolean,
): string | null {
  // 拡張子フィルタと _ フォルダ非表示の両方が無効なら null
  if (extensions.length === 0 && !hideUnderscoreFolders) return null;

  const extSelectors = extensions
    .map((ext) => `      [data-path$=".${ext}" i]`)
    .join(',\n');

  const folderRule = alwaysShowFolders
    ? '\n/* folders always visible */\n.nav-folder { display: flex !important; }'
    : '';

  const underscoreRule = hideUnderscoreFolders
    ? '\n/* hide _-prefixed folders (v0.22.0) */\n' +
      '.nav-folder:has(> .nav-folder-title[data-path^="_"]),\n' +
      '.nav-folder:has(> .nav-folder-title[data-path*="/_"]) {\n' +
      '  display: none !important;\n' +
      '}'
    : '';

  const fileRule = extensions.length > 0
    ? `.nav-files-container .nav-file:not(:has(\n  > .nav-file-title:is(\n${extSelectors}\n  )\n)) {\n  display: none !important;\n}`
    : '';

  return `/* ── Claudian Bridge Whitelist ── */\n${fileRule}${folderRule}${underscoreRule}`;
}
