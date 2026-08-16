// src/features/chroma-fs/hide-internal.ts — Hide chroma_db internals in the file explorer.
//
// Mirrors the whitelist CSS injection pattern (features/whitelist/injector.ts):
// a <style> element is appended to <head> and removed on unload.

export const CHROMA_FS_STYLE_ID = 'cb-chroma-fs-hide';

/** Build the CSS that hides chroma_db internals (hash folder, sqlite, .base). */
export function buildChromaFsHideCss(): string {
  return `/* ── Claudian Bridge chroma-fs: hide chroma_db internals ── */
.nav-folder[data-path="chroma_db"] > .nav-folder-children > .nav-folder:not(
  [data-path="chroma_db/PDF"], [data-path="chroma_db/DOCX"]
) {
  display: none !important;
}
.nav-folder[data-path="chroma_db"] > .nav-folder-children > .nav-file {
  display: none !important;
}`;
}

/** Inject the hide-CSS into <head>. Safe to call repeatedly (removes prior). */
export function installChromaFsHideCss(): void {
  removeChromaFsHideCss();
  const el = document.createElement('style');
  el.id = CHROMA_FS_STYLE_ID;
  el.textContent = buildChromaFsHideCss();
  document.head.appendChild(el);
}

/** Remove the injected style element. */
export function removeChromaFsHideCss(): void {
  const existing = document.getElementById(CHROMA_FS_STYLE_ID);
  if (existing) existing.remove();
}
