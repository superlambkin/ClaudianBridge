export type ObjectInfo = {
  name: string;
  type: string;
  selector: string;
  path: string;
  context: string;
  attributes?: Record<string, string>;
};

const CONTEXT_SELECTORS: Array<[string, string]> = [
  ['.workspace-ribbon', 'ribbon'],
  ['.workspace-sidedock', 'sidebar'],
  ['.modal', 'modal'],
  ['.setting-item', 'settings'],
  ['.menu', 'menu'],
  ['.workspace', 'workspace'],
];

function getTag(el: HTMLElement): string {
  return el.tagName.toLowerCase();
}

function getMeaningfulSource(el: HTMLElement): { name: string; sourceAttr: string } | null {
  // 優先順位: aria-label > data-tooltip-position > title > role+textContent > id+textContent > placeholder > textContent
  const aria = el.getAttribute('aria-label');
  if (aria) return { name: aria, sourceAttr: 'aria-label' };

  if (el.hasAttribute('data-tooltip-position')) {
    return { name: el.textContent?.trim() || '', sourceAttr: 'data-tooltip-position' };
  }

  const title = el.getAttribute('title');
  if (title) return { name: title, sourceAttr: 'title' };

  const role = el.getAttribute('role');
  if (role && /^(button|menuitem|tab|switch|slider|link|checkbox|radio|option)$/.test(role)) {
    return { name: el.textContent?.trim() || role, sourceAttr: 'role' };
  }

  const id = el.getAttribute('id');
  if (id && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
    return { name: id, sourceAttr: 'id' };
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return { name: placeholder, sourceAttr: 'placeholder' };

  return null;
}

function inferContext(el: HTMLElement): string {
  let cur: HTMLElement | null = el;
  while (cur) {
    for (const [sel, ctx] of CONTEXT_SELECTORS) {
      if (cur.matches(sel)) return ctx;
    }
    cur = cur.parentElement;
  }
  return 'unknown';
}

function buildPath(el: HTMLElement): string {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && parts.length < 5) {
    const cls = cur.className && typeof cur.className === 'string' ? `.${cur.className.trim().split(/\s+/).join('.')}` : '';
    parts.unshift(`${cur.tagName.toLowerCase()}${cls}`);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function escapeSelector(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function getUniqueSelector(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return `${getTag(el)}[aria-label="${escapeSelector(aria)}"]`;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/)[0];
    if (cls) return `${getTag(el)}.${cls}`;
  }
  return getTag(el);
}

export function getMeaningfulInfo(el: HTMLElement | null | undefined): ObjectInfo | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  const src = getMeaningfulSource(el);
  if (!src) return null;

  const tag = getTag(el);
  const role = el.getAttribute('role');
  const type = role || (tag === 'button' ? 'button' : tag === 'input' ? 'input' : 'element');

  return {
    name: src.name,
    type,
    selector: getUniqueSelector(el),
    path: buildPath(el),
    context: inferContext(el),
    attributes: src.sourceAttr ? { [src.sourceAttr]: src.name } : undefined,
  };
}
