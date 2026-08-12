// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { getMeaningfulInfo, type ObjectInfo } from '../../../src/features/object/inspector';

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

describe('getMeaningfulInfo', () => {
  it('aria-label あり → name と selector を返す', () => {
    const e = el('button', { 'aria-label': 'Save', class: 'btn-primary' });
    const info = getMeaningfulInfo(e);
    expect(info).not.toBeNull();
    expect(info!.name).toBe('Save');
    expect(info!.type).toBe('button');
    expect(info!.selector).toContain('aria-label');
  });

  it('title 属性あり → name に使用', () => {
    const e = el('a', { title: 'Help', href: '/help' });
    const info = getMeaningfulInfo(e)!;
    expect(info.name).toBe('Help');
    expect(info.type).toBe('element');
  });

  it('data-tooltip-position あり → name に textContent を使用', () => {
    const e = el('div', { 'data-tooltip-position': 'top' });
    e.textContent = 'Open Claudian';
    const info = getMeaningfulInfo(e)!;
    expect(info.name).toBe('Open Claudian');
  });

  it('role="tab" → type=tab', () => {
    const e = el('div', { role: 'tab' });
    e.textContent = 'Settings';
    const info = getMeaningfulInfo(e)!;
    expect(info.type).toBe('tab');
    expect(info.name).toBe('Settings');
  });

  it('意味なし要素 → null', () => {
    const e = el('span', { class: 'spacer' });
    expect(getMeaningfulInfo(e)).toBeNull();
  });

  it('workspace-ribbon 祖先 → context="ribbon"', () => {
    const ribbon = el('div', { class: 'workspace-ribbon' });
    const btn = el('button', { 'aria-label': 'X' });
    ribbon.appendChild(btn);
    document.body.appendChild(ribbon);
    const info = getMeaningfulInfo(btn)!;
    expect(info.context).toBe('ribbon');
    document.body.removeChild(ribbon);
  });

  it('modal 祖先 → context="modal"', () => {
    const modal = el('div', { class: 'modal' });
    const btn = el('button', { 'aria-label': 'OK' });
    modal.appendChild(btn);
    document.body.appendChild(modal);
    const info = getMeaningfulInfo(btn)!;
    expect(info.context).toBe('modal');
    document.body.removeChild(modal);
  });

  it('path は祖先を > で連結 (最大 5 階層)', () => {
    const root = el('div');
    root.classList.add('workspace-ribbon');
    const a = el('div'); a.classList.add('a');
    const b = el('div'); b.classList.add('b');
    const c = el('div'); c.classList.add('c');
    const d = el('div'); d.classList.add('d');
    const e = el('div'); e.classList.add('e');
    const btn = el('button', { 'aria-label': 'X' });
    root.appendChild(a); a.appendChild(b); b.appendChild(c); c.appendChild(d); d.appendChild(e); e.appendChild(btn);
    document.body.appendChild(root);
    const info = getMeaningfulInfo(btn)!;
    expect(info.path.split(' > ').length).toBeLessThanOrEqual(5);
    document.body.removeChild(root);
  });
});
