/**
 * v0.17.0: HTML→Markdown 変換器。
 * Obsidian MarkdownRenderer / realclaudian 描画後の DOM を Markdown に復元する。
 * 純関数（DOM ロジックのみ・jsdom でテスト可能）。
 */
import { SAVE_EXCLUDE_SELECTORS } from './constants';

function inline(el: Element): string {
  return Array.from(el.childNodes).map((n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
    if (n.nodeType !== Node.ELEMENT_NODE) return '';
    return serializeNode(n as HTMLElement, 0);
  }).join('');
}

function blockChildren(el: Element, depth: number): string {
  const parts: string[] = [];
  for (const child of Array.from(el.childNodes)) {
    const md = serializeNode(child as HTMLElement, depth);
    if (md.trim() !== '') parts.push(md.trim());
  }
  return parts.join('\n\n');
}

function list(el: Element, depth: number, kind: 'ul' | 'ol'): string {
  const indent = '  '.repeat(depth);
  const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
  return items.map((li, i) => {
    const marker = kind === 'ul' ? '-' : `${i + 1}.`;
    let text = '';
    const nested: string[] = [];
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') nested.push(list(child as HTMLElement, depth + 1, tag));
        else text += serializeNode(child as HTMLElement, depth);
      } else {
        text += child.textContent ?? '';
      }
    }
    const lines = [`${indent}${marker} ${text.trim()}`];
    lines.push(...nested);
    return lines.join('\n');
  }).join('\n');
}

function table(el: Element): string {
  const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((c) => inline(c).replace(/\|/g, '\\|').trim()),
  ).filter((r) => r.length > 0);
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const cells = [...r];
    while (cells.length < colCount) cells.push('');
    return `| ${cells.join(' | ')} |`;
  };
  const header = pad(rows[0]);
  const sep = `| ${Array.from({ length: colCount }, () => '------').join(' | ')} |`;
  const body = rows.slice(1).map(pad).join('\n');
  return [header, sep, body].join('\n');
}

function quote(el: Element): string {
  return blockChildren(el, 0).split('\n').map((l) => (l.trim() === '' ? '>' : `> ${l}`)).join('\n');
}

function fence(el: Element): string {
  const codeEl = el.tagName.toLowerCase() === 'pre' ? (el.querySelector('code') ?? el) : el;
  const lang = Array.from(codeEl.classList).find((c) => c.startsWith('language-'))?.slice(9) ?? '';
  const code = (codeEl.textContent ?? '').replace(/\n$/, '');
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

function callout(el: Element): string {
  const type = el.getAttribute('data-callout') ?? 'note';
  const title = (el.querySelector('.callout-title')?.textContent ?? '').trim();
  const contentEl = el.querySelector('.callout-content') ?? el;
  const body = blockChildren(contentEl, 0);
  const header = title ? `> [!${type}] ${title}` : `> [!${type}]`;
  return [header, ...body.split('\n').map((l) => (l.trim() === '' ? '>' : `> ${l}`))].join('\n');
}

function serializeNode(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return `${'#'.repeat(Number(tag[1]))} ${inline(el)}`;
    case 'p': return inline(el);
    case 'br': return '  \n';
    case 'hr': return '---';
    case 'ul': return list(el, depth, 'ul');
    case 'ol': return list(el, depth, 'ol');
    case 'table': return table(el);
    case 'blockquote': return quote(el);
    case 'strong': case 'b': return `**${inline(el)}**`;
    case 'em': case 'i': return `*${inline(el)}*`;
    case 'del': case 's': return `~~${inline(el)}~~`;
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const text = inline(el);
      return text ? `[${text}](${href})` : href;
    }
    case 'img': return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`;
    case 'pre': return fence(el);
    case 'code': return el.parentElement?.tagName.toLowerCase() === 'pre' ? '' : `\`${el.textContent ?? ''}\``;
    case 'div':
      if (el.classList.contains('callout')) return callout(el);
      if (el.classList.contains('claudian-code-wrapper')) return fence(el.querySelector('pre') ?? el);
      return blockChildren(el, depth);
    default: return blockChildren(el, depth);
  }
}

export function serializeElementToMarkdown(root: Element, excludeSelectors?: string[]): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const sel of excludeSelectors ?? SAVE_EXCLUDE_SELECTORS) clone.querySelectorAll(sel).forEach((n) => n.remove());
  const parts: string[] = [];
  for (const child of Array.from(clone.childNodes)) {
    const md = serializeNode(child as HTMLElement, 0);
    if (md.trim() !== '') parts.push(md.trim());
  }
  return parts.join('\n\n');
}
