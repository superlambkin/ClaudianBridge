export function buildWhitelistCss(extensions: string[], alwaysShowFolders: boolean): string | null {
  if (extensions.length === 0) return null;

  const extSelectors = extensions
    .map((ext) => `      [data-path$=".${ext}" i]`)
    .join(',\n');

  const folderRule = alwaysShowFolders
    ? '\n/* folders always visible */\n.nav-folder { display: flex !important; }'
    : '';

  return `/* ── Claudian Bridge Whitelist ── */
.nav-files-container .nav-file:not(:has(
  > .nav-file-title:is(
${extSelectors}
  )
)) {
  display: none !important;
}${folderRule}`;
}
