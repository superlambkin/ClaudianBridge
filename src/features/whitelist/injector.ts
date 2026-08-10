const STYLE_ID = 'cb-whitelist-css';

export function installWhitelistCss(css: string): void {
  removeWhitelistCss();
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

export function removeWhitelistCss(): void {
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
}
