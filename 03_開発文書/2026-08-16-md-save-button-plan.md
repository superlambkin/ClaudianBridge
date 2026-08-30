---
title: "MD保存ボタン（Chat結果のメモリフォルダ保存）実装計画"
type: implementation-plan
version: 1.0.0
status: ✅ 承認済み
created: 2026-08-16
modified: 2026-08-16
project_id: POC_017_ClaudianBridge
phase: feature
tags:
  - 実装計画
  - MD保存
  - memory
language: Japanese
---

# MD保存ボタン（Chat結果のメモリフォルダ保存）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianChat の結果を Markdown としてメモリフォルダに保存する 📝ボタンを、入力ツールバー（設定スコープ：質問＋応答/チャット全体）と回答ブロック右下（ブロックのみ）の 2 箇所に追加する。

**Architecture:** 既存のボタン注入パターン（MutationObserver + マーカー属性）を踏襲し、`features/memory/` に 5 モジュールを新設する。生 Markdown は DOM に残らないため、描画後 HTML を**内製の HTML→Markdown 変換器**で復元する。保存は office 変換と同じ `fs.promises` 方式（相対パス→Vault 内 / 絶対パス→そのまま）。

**Tech Stack:** Obsidian Plugin API / TypeScript / esbuild / vitest（jsdom） / git（main）

## Global Constraints

- ソースリポジトリ: `D:\AI-Agent\ClaudianBridge\`（git main。現在クリーン）
- 設計書（SSOT）: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-16-md-save-button-design.md`
- ビルド: `npm run build`（esbuild production + 自動デプロイ）
- テスト: `npm test`（vitest。**全 passed 維持**が回帰ゲート）
- 型チェック: `npm run typecheck`（`tsc -noEmit`）
- 依存追加禁止（runtime deps は現状ゼロ → turndown 等を入れない）
- 既存ボタン実装（`toolbar-buttons.ts` / `message-read-button.ts` / `input-ai-read-button.ts`）には**修正しない**
- Vault 共通 MD ルール（frontmatter / テーブル区切り `|------|` / Mermaid / 双鏈 `[[ ]]` / ASCII 図禁止）に準拠

---

### Task 1: `memory` 設定スキーマ

**Files:**
- Modify: `src/core/settings.ts`（`ClaudianBridgeSettings`・`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS`・`normalizeClaudianBridgeSettings`・`validateClaudianBridgeSettings`）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Produces:
  - `export type MemoryScope = 'pair' | 'conversation'`
  - `export interface MemorySettings { enabled: boolean; scope: MemoryScope; folder: string }`
  - `export const DEFAULT_MEMORY_SETTINGS: MemorySettings`
  - `export function normalizeMemorySettings(raw: unknown): MemorySettings`
  - `ClaudianBridgeSettings.memory: MemorySettings`

- [ ] **Step 1: Write the failing test**

`tests/core/settings.test.ts` の末尾に追加（既存 import を確認して追加）:

```typescript
describe('memory settings', () => {
  it('デフォルト値（enabled=true / scope=pair / folder=Memory/）を持つ', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.memory).toEqual({ enabled: true, scope: 'pair', folder: 'Memory/' });
  });

  it('不正値はデフォルトにフォールバックする', () => {
    const cfg = normalizeClaudianBridgeSettings({ memory: { enabled: 'x', scope: 'bad', folder: '' } as never });
    expect(cfg.memory).toEqual({ enabled: true, scope: 'pair', folder: 'Memory/' });
  });

  it('有効な値は保持される', () => {
    const cfg = normalizeClaudianBridgeSettings({ memory: { enabled: false, scope: 'conversation', folder: 'D:/mem' } });
    expect(cfg.memory).toEqual({ enabled: false, scope: 'conversation', folder: 'D:/mem' });
  });

  it('validateClaudianBridgeSettings が memory を検証する', () => {
    expect(validateClaudianBridgeSettings(normalizeClaudianBridgeSettings({}))).toBeNull();
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, memory: { enabled: 'x', scope: 'pair', folder: 'Memory/' } } as never;
    expect(validateClaudianBridgeSettings(bad)).toContain('memory.enabled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`cfg.memory` が undefined）

- [ ] **Step 3: Implement the schema**

`src/core/settings.ts` に追加:

```typescript
// === v0.17.0: MD保存ボタン設定 ===
export type MemoryScope = 'pair' | 'conversation';

export interface MemorySettings {
  /** MD保存ボタン全体の有効/無効（既定 true） */
  enabled: boolean;
  /** ツールバーボタンの保存範囲（既定 pair）。ブロックボタンは常に block */
  scope: MemoryScope;
  /** メモリフォルダ。相対= Vault 内 / 絶対= ファイルシステム（既定 'Memory/'） */
  folder: string;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  scope: 'pair',
  folder: 'Memory/',
};

export function normalizeMemorySettings(raw: unknown): MemorySettings {
  const r = (raw ?? {}) as Partial<MemorySettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_MEMORY_SETTINGS.enabled,
    scope: r.scope === 'conversation' ? 'conversation' : DEFAULT_MEMORY_SETTINGS.scope,
    folder: typeof r.folder === 'string' && r.folder.trim() !== '' ? r.folder : DEFAULT_MEMORY_SETTINGS.folder,
  };
}
```

- `ClaudianBridgeSettings` に `memory: MemorySettings;` を追加
- `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS` に `memory: { ...DEFAULT_MEMORY_SETTINGS },` を追加
- `normalizeClaudianBridgeSettings` の return に `memory: normalizeMemorySettings(r.memory),` を追加
- `validateClaudianBridgeSettings` に追加:

```typescript
if (typeof cfg.memory?.enabled !== 'boolean') return 'memory.enabled は boolean である必要があります';
if (cfg.memory?.scope !== 'pair' && cfg.memory?.scope !== 'conversation') return `memory.scope が未知です: ${cfg.memory?.scope}`;
if (typeof cfg.memory?.folder !== 'string') return 'memory.folder は文字列である必要があります';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(memory): add memory settings schema for MD save button"
```

---

### Task 2: HTML→Markdown 変換器（serialize.ts）

**Files:**
- Create: `src/features/memory/serialize.ts`
- Test: `tests/features/memory/serialize.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `export function serializeElementToMarkdown(root: Element, excludeSelectors?: string[]): string`

- [ ] **Step 1: Write the failing test**

`tests/features/memory/serialize.test.ts`（`// @vitest-environment jsdom` を先頭に）:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { serializeElementToMarkdown } from '../../../src/features/memory/serialize';

function md(html: string, exclude?: string[]): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return serializeElementToMarkdown(el, exclude);
}

describe('serializeElementToMarkdown', () => {
  it('見出し h1-h6 を # に変換する', () => {
    expect(md('<h1>見出し1</h1><h2>見出し2</h2>')).toBe('# 見出し1\n\n## 見出し2');
  });

  it('テーブルを MD テーブルに変換する', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    expect(md(html)).toBe('| A | B |\n| ------ | ------ |\n| 1 | 2 |');
  });

  it('コードブロック（.claudian-code-wrapper）をフェンスに変換する', () => {
    const html = '<div class="claudian-code-wrapper"><pre><code class="language-ts">const x = 1;\nconsole.log(x);</code></pre></div>';
    expect(md(html)).toBe('```ts\nconst x = 1;\nconsole.log(x);\n```');
  });

  it('callout を > [!type] に変換する', () => {
    const html = '<div class="callout" data-callout="note"><div class="callout-title">メモ</div><div class="callout-content"><p>内容</p></div></div>';
    expect(md(html)).toContain('> [!note] メモ');
    expect(md(html)).toContain('> 内容');
  });

  it('リスト（入れ子）を変換する', () => {
    const html = '<ul><li>項目1<ul><li>子項目</li></ul></li><li>項目2</li></ul>';
    expect(md(html)).toContain('- 項目1');
    expect(md(html)).toContain('  - 子項目');
  });

  it('インライン装飾（strong/em/code/a）を変換する', () => {
    expect(md('<p><strong>太字</strong>と<em>斜体</em>と<code>code</code>と<a href="https://x">リンク</a></p>'))
      .toBe('**太字**と*斜体*と`code`と[リンク](https://x)');
  });

  it('除外セレクタで UI ボタンを除く', () => {
    const html = '<p>本文</p><span class="claudian-text-copy-btn">copy</span>';
    expect(md(html, ['.claudian-text-copy-btn'])).toBe('本文');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/memory/serialize.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Implement the converter**

`src/features/memory/serialize.ts`:

```typescript
/**
 * v0.17.0: HTML→Markdown 変換器。
 * Obsidian MarkdownRenderer / realclaudian 描画後の DOM を Markdown に復元する。
 * 純関数（DOM ロジックのみ・jsdom でテスト可能）。
 */

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
  for (const sel of excludeSelectors ?? []) clone.querySelectorAll(sel).forEach((n) => n.remove());
  const parts: string[] = [];
  for (const child of Array.from(clone.childNodes)) {
    const md = serializeNode(child as HTMLElement, 0);
    if (md.trim() !== '') parts.push(md.trim());
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/memory/serialize.test.ts`
Expected: PASS（必要ならアサーションを実挙動に合わせて微調整）

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/memory/serialize.ts tests/features/memory/serialize.test.ts
git commit -m "feat(memory): add HTML-to-Markdown serializer for chat blocks"
```

---

### Task 3: チャット DOM 抽出（extract.ts）

**Files:**
- Create: `src/features/memory/extract.ts`
- Test: `tests/features/memory/extract.test.ts`

**Interfaces:**
- Consumes: `MemoryScope`（Task 1）
- Produces:
  - `export interface ExtractedMessage { role: 'user' | 'assistant'; element: Element }`
  - `export const MESSAGES_SELECTOR = '.claudian-messages'`
  - `export function extractMessages(scope: MemoryScope, messagesEl: Element): ExtractedMessage[] | null`
  - `export function findFirstHeadingText(el: Element): string`

- [ ] **Step 1: Write the failing test**

`tests/features/memory/extract.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractMessages, findFirstHeadingText, MESSAGES_SELECTOR } from '../../../src/features/memory/extract';

function makeMessages(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'claudian-messages';
  root.innerHTML = `
    <div class="claudian-message-user"><div class="claudian-message-content"><p>質問1</p></div></div>
    <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答1</h2></div></div>
    <div class="claudian-message-user"><div class="claudian-message-content"><p>質問2</p></div></div>
    <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答2</h2></div></div>
  `;
  return root;
}

describe('extractMessages', () => {
  it('pair: 最後の assistant + 直前の user を返す', () => {
    const msgs = extractMessages('pair', makeMessages());
    expect(msgs).not.toBeNull();
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((msgs![1].element as HTMLElement).textContent).toContain('回答2');
    expect((msgs![0].element as HTMLElement).textContent).toContain('質問2');
  });

  it('pair: user が無ければ assistant のみ', () => {
    const root = document.createElement('div');
    root.className = 'claudian-messages';
    root.innerHTML = '<div class="claudian-message-assistant"><div class="claudian-message-content"><p>A</p></div></div>';
    const msgs = extractMessages('pair', root);
    expect(msgs!.map((m) => m.role)).toEqual(['assistant']);
  });

  it('conversation: 全メッセージを時系列で返す', () => {
    const msgs = extractMessages('conversation', makeMessages());
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('assistant が無ければ null', () => {
    const root = document.createElement('div');
    root.className = 'claudian-messages';
    root.innerHTML = '<div class="claudian-message-user"><div class="claudian-message-content"><p>Q</p></div></div>';
    expect(extractMessages('pair', root)).toBeNull();
  });

  it('findFirstHeadingText は最初の見出しを返す', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>前置き</p><h3>タイトル</h3><p>本文</p>';
    expect(findFirstHeadingText(el)).toBe('タイトル');
  });

  it('MESSAGES_SELECTOR が .claudian-messages である', () => {
    expect(MESSAGES_SELECTOR).toBe('.claudian-messages');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/memory/extract.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Implement extract.ts**

```typescript
/**
 * v0.17.0: ClaudianChat チャット DOM からスコープ別にメッセージを抽出する。
 */
import type { MemoryScope } from '../../core/settings';

export interface ExtractedMessage {
  role: 'user' | 'assistant';
  /** .claudian-message-content（無ければメッセージ要素自体） */
  element: Element;
}

export const MESSAGES_SELECTOR = '.claudian-messages';
const USER_MESSAGE_SELECTOR = '.claudian-message-user';
const ASSISTANT_MESSAGE_SELECTOR = '.claudian-message-assistant';

function contentOf(msg: Element): Element {
  return msg.querySelector('.claudian-message-content') ?? msg;
}

export function extractMessages(scope: MemoryScope, messagesEl: Element): ExtractedMessage[] | null {
  const assistants = Array.from(messagesEl.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR));
  if (assistants.length === 0) return null;

  if (scope === 'conversation') {
    const out: ExtractedMessage[] = [];
    for (const el of Array.from(messagesEl.children)) {
      if (el.classList.contains('claudian-message-user')) out.push({ role: 'user', element: contentOf(el) });
      else if (el.classList.contains('claudian-message-assistant')) out.push({ role: 'assistant', element: contentOf(el) });
    }
    return out.length > 0 ? out : null;
  }

  // pair: 最後の assistant + 直前の user（無ければ assistant のみ）
  const last = assistants[assistants.length - 1];
  const out: ExtractedMessage[] = [{ role: 'assistant', element: contentOf(last) }];
  let prev = last.previousElementSibling;
  while (prev && !prev.classList.contains('claudian-message-user')) {
    prev = prev.previousElementSibling;
  }
  if (prev) out.unshift({ role: 'user', element: contentOf(prev) });
  return out;
}

export function findFirstHeadingText(el: Element): string {
  const h = el.querySelector('h1, h2, h3, h4, h5, h6');
  return h ? (h.textContent ?? '').trim() : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/memory/extract.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/memory/extract.ts tests/features/memory/extract.test.ts
git commit -m "feat(memory): add chat DOM extractor for pair/conversation scope"
```

---

### Task 4: 保存ロジック（save.ts）

**Files:**
- Create: `src/features/memory/save.ts`
- Test: `tests/features/memory/save.test.ts`

**Interfaces:**
- Consumes: `App`（obsidian）/ なし
- Produces:
  - `export type SavedScope = 'pair' | 'conversation' | 'block'`
  - `export interface SaveResult { path: string; ok: boolean; message: string }`
  - `export function resolveFolder(vaultRoot: string, folder: string): string`
  - `export function sanitizeTitle(title: string): string`
  - `export function buildFilename(now: Date, title: string): string`
  - `export function buildFrontmatter(title: string, scope: SavedScope, created: string): string`
  - `export function composeBody(scope: SavedScope, messages: { role: 'user' | 'assistant'; md: string }[]): string`
  - `export async function saveMarkdown(app: App, folder: string, scope: SavedScope, title: string, body: string): Promise<SaveResult>`

- [ ] **Step 1: Write the failing test**

`tests/features/memory/save.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  resolveFolder, sanitizeTitle, buildFilename, buildFrontmatter, composeBody, saveMarkdown,
} from '../../../src/features/memory/save';

describe('save helpers', () => {
  it('resolveFolder: 相対は vaultRoot に結合し / に正規化', () => {
    expect(resolveFolder('C:/vault', 'Memory/')).toBe('C:/vault/Memory');
  });
  it('resolveFolder: 絶対パスはそのまま', () => {
    expect(resolveFolder('C:/vault', 'D:/mem')).toBe('D:/mem');
  });
  it('sanitizeTitle: 不正文字を _ に置換し 60 字に切る', () => {
    expect(sanitizeTitle('a/b:c*')).toBe('a_b_c_');
    expect(sanitizeTitle('あ'.repeat(100)).length).toBe(60);
  });
  it('buildFilename: YYYY-MM-DD-HHMM_タイトル.md', () => {
    const d = new Date(2026, 7, 16, 10, 30);
    expect(buildFilename(d, '進捗まとめ')).toBe('2026-08-16-1030_進捗まとめ.md');
  });
  it('buildFilename: タイトル無しは claudian-chat', () => {
    const d = new Date(2026, 7, 16, 10, 30);
    expect(buildFilename(d, '')).toBe('2026-08-16-1030_claudian-chat.md');
  });
  it('buildFrontmatter: scope=block で正しく組立', () => {
    const fm = buildFrontmatter('タイトル', 'block', '2026-08-16 10:30');
    expect(fm).toContain('title: タイトル');
    expect(fm).toContain('scope: block');
    expect(fm).toContain('created: 2026-08-16 10:30');
    expect(fm).toContain('type: claudian-chat');
  });
  it('composeBody: pair は ## 質問 / ## 回答', () => {
    const body = composeBody('pair', [
      { role: 'user', md: 'Q' },
      { role: 'assistant', md: 'A' },
    ]);
    expect(body).toBe('## 質問\n\nQ\n\n## 回答\n\nA');
  });
  it('composeBody: conversation は ### 見出しで区切り、block は md のみ', () => {
    const conv = composeBody('conversation', [{ role: 'user', md: 'Q' }, { role: 'assistant', md: 'A' }]);
    expect(conv).toContain('### 👤 ユーザー');
    expect(conv).toContain('### 🤖 Claude');
    expect(composeBody('block', [{ role: 'assistant', md: 'A' }])).toBe('A');
  });
});

describe('saveMarkdown', () => {
  let mkdirSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as never);
    writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('相対フォルダに frontmatter 付きで書き込む', async () => {
    const app = { vault: { adapter: { getBasePath: () => 'C:/vault' } } } as never;
    const r = await saveMarkdown(app, 'Memory/', 'pair', 'タイトル', '本文');
    expect(r.ok).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const [file, content] = writeSpy.mock.calls[0] as unknown as [string, string];
    expect(file.replace(/\\/g, '/')).toContain('C:/vault/Memory/');
    expect(content).toContain('---');
    expect(content).toContain('本文');
  });

  it('書き込み失敗時は ok=false で返す', async () => {
    writeSpy.mockRejectedValueOnce(new Error('disk full'));
    const app = { vault: { adapter: { getBasePath: () => 'C:/vault' } } } as never;
    const r = await saveMarkdown(app, 'Memory/', 'block', 't', 'b');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('disk full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/memory/save.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Implement save.ts**

```typescript
/**
 * v0.17.0: MD保存のパス解決・ファイル名・frontmatter・書込。
 * 書き込みは office 変換と同じ fs.promises 方式（Vault 内外どちらでも動作）。
 */
import type { App } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

export type SavedScope = 'pair' | 'conversation' | 'block';

export interface SaveResult { path: string; ok: boolean; message: string; }

export interface MessageMd { role: 'user' | 'assistant'; md: string; }

export function resolveFolder(vaultRoot: string, folder: string): string {
  // Windows では path.join が `\` を返すため、Obsidian 規約のフォワードスラッシュへ正規化（office VaultPath と同じ）
  const resolved = path.isAbsolute(folder) ? folder : path.join(vaultRoot, folder);
  return resolved.replace(/\\/g, '/');
}

export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 60);
}

export function buildFilename(now: Date, title: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const t = sanitizeTitle(title) || 'claudian-chat';
  return `${stamp}_${t}.md`;
}

export function buildFrontmatter(title: string, scope: SavedScope, created: string): string {
  return [
    '---',
    `title: ${sanitizeTitle(title) || 'claudian-chat'}`,
    'type: claudian-chat',
    `scope: ${scope}`,
    `created: ${created}`,
    'source: Claudian Chat',
    '---',
  ].join('\n');
}

export function composeBody(scope: SavedScope, messages: MessageMd[]): string {
  if (scope === 'block') return messages[0]?.md ?? '';
  if (scope === 'pair') {
    return messages.map((m) => (m.role === 'user' ? `## 質問\n\n${m.md}` : `## 回答\n\n${m.md}`)).join('\n\n');
  }
  return messages.map((m) => `### ${m.role === 'user' ? '👤 ユーザー' : '🤖 Claude'}\n\n${m.md}`).join('\n\n');
}

export function localDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function vaultRoot(app: App): string {
  const adapter = app.vault.adapter as { getBasePath?: () => string; basePath?: string };
  return adapter.getBasePath ? adapter.getBasePath() : (adapter.basePath ?? process.cwd());
}

export async function saveMarkdown(app: App, folder: string, scope: SavedScope, title: string, body: string): Promise<SaveResult> {
  try {
    const root = vaultRoot(app);
    const dirAbs = resolveFolder(root, folder);
    const abs = path.join(dirAbs, buildFilename(new Date(), title));
    await fs.promises.mkdir(dirAbs, { recursive: true });
    const content = `${buildFrontmatter(title, scope, localDateTime())}\n\n${body}\n`;
    await fs.promises.writeFile(abs, content, 'utf8');
    const rel = path.relative(root, abs).split(path.sep).join('/');
    return { path: rel || abs, ok: true, message: 'saved' };
  } catch (e) {
    return { path: folder, ok: false, message: String(e) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/memory/save.test.ts`
Expected: PASS（絶対パスの期待値は `path.resolve` の結果に合わせ調整可）

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/memory/save.ts tests/features/memory/save.test.ts
git commit -m "feat(memory): add save logic (path resolve, filename, frontmatter)"
```

---

### Task 5: ツールバー📝ボタン（md-save-button.ts）

**Files:**
- Create: `src/features/memory/md-save-button.ts`
- Test: `tests/features/memory/md-save-button.test.ts`

**Interfaces:**
- Consumes: `ConfigStore` / `extractMessages`・`findFirstHeadingText`（Task 3）/ `serializeElementToMarkdown`（Task 2）/ `composeBody`・`saveMarkdown`（Task 4）
- Produces:
  - `export interface MdSaveButtonDeps { app: App; store: ConfigStore; noticeFn?: (m: string) => void }`
  - `export function setupMdSaveButton(deps: MdSaveButtonDeps): () => void`

- [ ] **Step 1: Write the failing test**

`tests/features/memory/md-save-button.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMdSaveButton } from '../../../src/features/memory/md-save-button';
import type { ConfigStore } from '../../../src/core/config-store';
import * as saveModule from '../../../src/features/memory/save';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';

function makeToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  document.body.appendChild(toolbar);
  return toolbar;
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    load: () => ({
      memory: { enabled: true, scope: 'pair', folder: 'Memory/' },
      ...overrides,
    }),
    onSave: () => {},
  } as unknown as ConfigStore;
}

describe('setupMdSaveButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(saveModule, 'saveMarkdown').mockResolvedValue({ path: 'Memory/x.md', ok: true, message: 'saved' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ツールバーに 📝 ボタンを 1 つ注入し、cleanup で削除', () => {
    const toolbar = makeToolbar();
    const cleanup = setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn: vi.fn() });
    expect(toolbar.querySelector('[data-cb-md-save-toolbar]')).not.toBeNull();
    expect(toolbar.querySelectorAll('[data-cb-md-save-toolbar]').length).toBe(1);
    cleanup();
    expect(toolbar.querySelectorAll('[data-cb-md-save-toolbar]').length).toBe(0);
  });

  it('memory.enabled=false では注入しない', () => {
    const toolbar = makeToolbar();
    setupMdSaveButton({ app: {} as never, store: makeStore({ memory: { enabled: false, scope: 'pair', folder: 'Memory/' } }), noticeFn: vi.fn() });
    expect(toolbar.querySelector('[data-cb-md-save-toolbar]')).toBeNull();
  });

  it('クリックで saveMarkdown を呼ぶ（pair 抽出→serialize→compose）', async () => {
    makeToolbar();
    document.body.innerHTML += `
      <div class="claudian-messages">
        <div class="claudian-message-user"><div class="claudian-message-content"><p>質問</p></div></div>
        <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答タイトル</h2><p>回答本文</p></div></div>
      </div>`;
    const noticeFn = vi.fn();
    setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn });
    (document.querySelector('[data-cb-md-save-toolbar]') as HTMLElement).click();
    await vi.waitFor(() => expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(1));
    const [app, folder, scope, title, body] = (saveModule.saveMarkdown as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(folder).toBe('Memory/');
    expect(scope).toBe('pair');
    expect(title).toBe('回答タイトル');
    expect(body).toContain('## 質問');
    expect(body).toContain('## 回答');
  });

  it('メッセージが無ければ Notice して保存しない', async () => {
    makeToolbar();
    const noticeFn = vi.fn();
    setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn });
    (document.querySelector('[data-cb-md-save-toolbar]') as HTMLElement).click();
    expect(noticeFn).toHaveBeenCalled();
    expect(saveModule.saveMarkdown).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/memory/md-save-button.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Implement md-save-button.ts**

```typescript
/**
 * v0.17.0: ClaudianChat 入力ツールバーの 📝MD保存ボタン。
 * クリックで設定スコープ（pair / conversation）のチャットをメモリフォルダに保存する。
 */
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { extractMessages, findFirstHeadingText, MESSAGES_SELECTOR } from './extract';
import { serializeElementToMarkdown } from './serialize';
import { composeBody, saveMarkdown } from './save';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const SAVE_MARK = 'data-cb-md-save-toolbar';
const EXCLUDE_SELECTORS = ['.claudian-text-copy-btn', '.claudian-text-tts-btn', '[data-cb-md-save-toolbar]'];

export interface MdSaveButtonDeps {
  app: App;
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

export function setupMdSaveButton(deps: MdSaveButtonDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const handleClick = async (btn: HTMLButtonElement): Promise<void> => {
    const cfg = deps.store.load();
    if (!cfg.memory.enabled) return;
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const messagesEl = document.querySelector(MESSAGES_SELECTOR);
      if (!messagesEl) { notice('保存するメッセージがありません'); return; }
      const msgs = extractMessages(cfg.memory.scope, messagesEl);
      if (!msgs) { notice('保存するメッセージがありません'); return; }
      const serialized = msgs.map((m) => ({
        role: m.role,
        md: serializeElementToMarkdown(m.element, EXCLUDE_SELECTORS),
      }));
      const body = composeBody(cfg.memory.scope, serialized);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      const title = lastAssistant ? findFirstHeadingText(lastAssistant.element) : '';
      const r = await saveMarkdown(deps.app, cfg.memory.folder, cfg.memory.scope, title, body);
      notice(r.ok ? `✅ ${r.path} に保存しました` : `⚠️ 保存失敗: ${r.message}`);
    } catch (e) {
      console.warn('[cb-md-save] failed:', e);
      notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '📝';
    }
  };

  const inject = (toolbar: Element): void => {
    if (deps.store.load().memory.enabled === false) return;
    if (toolbar.querySelector(`[${SAVE_MARK}]`)) return;
    const btn = document.createElement('button');
    btn.classList.add('claudian-action-btn', 'cb-md-save-btn');
    btn.setAttribute(SAVE_MARK, 'true');
    btn.textContent = '📝';
    btn.title = 'MD保存：メモリフォルダに保存';
    btn.addEventListener('click', () => { void handleClick(btn); });
    toolbar.appendChild(btn);
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && (node.matches(TOOLBAR_SELECTOR) || node.querySelector(TOOLBAR_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  deps.store.onSave(() => {
    if (deps.store.load().memory.enabled === false) {
      document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
    } else {
      scan();
    }
  });

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/memory/md-save-button.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/memory/md-save-button.ts tests/features/memory/md-save-button.test.ts
git commit -m "feat(memory): add MD save button to ClaudianChat input toolbar"
```

---

### Task 6: 回答ブロック📝ボタン（message-md-save-button.ts）

**Files:**
- Create: `src/features/memory/message-md-save-button.ts`
- Test: `tests/features/memory/message-md-save-button.test.ts`

**Interfaces:**
- Consumes: `ConfigStore` / `findFirstHeadingText`（Task 3）/ `serializeElementToMarkdown`（Task 2）/ `saveMarkdown`（Task 4）
- Produces:
  - `export interface MessageMdSaveButtonDeps { app: App; store: ConfigStore; noticeFn?: (m: string) => void }`
  - `export function setupMessageMdSaveButtons(deps: MessageMdSaveButtonDeps): () => void`

- [ ] **Step 1: Write the failing test**

`tests/features/memory/message-md-save-button.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMessageMdSaveButtons } from '../../../src/features/memory/message-md-save-button';
import type { ConfigStore } from '../../../src/core/config-store';
import * as saveModule from '../../../src/features/memory/save';

function makeBlock(body = '<h2>タイトル</h2><p>本文</p>'): HTMLElement {
  const block = document.createElement('div');
  block.className = 'claudian-text-block';
  block.innerHTML = body;
  const copy = document.createElement('span');
  copy.className = 'claudian-text-copy-btn';
  block.appendChild(copy);
  document.body.appendChild(block);
  return block;
}

function makeStore(enabled = true) {
  return {
    load: () => ({ memory: { enabled, scope: 'pair', folder: 'Memory/' } }),
    onSave: () => {},
  } as unknown as ConfigStore;
}

describe('setupMessageMdSaveButtons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(saveModule, 'saveMarkdown').mockResolvedValue({ path: 'Memory/x.md', ok: true, message: 'saved' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('コピーボタンの並びに 📝 を 1 つ注入し、cleanup で削除', () => {
    const block = makeBlock();
    const cleanup = setupMessageMdSaveButtons({ app: {} as never, store: makeStore(), noticeFn: vi.fn() });
    expect(block.querySelector('[data-cb-md-save]')).not.toBeNull();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(1);
    cleanup();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(0);
  });

  it('クリックでそのブロックのみ scope=block で保存する', async () => {
    const block = makeBlock('<h2>ブロック見出し</h2><p>ブロック本文</p>');
    const noticeFn = vi.fn();
    setupMessageMdSaveButtons({ app: {} as never, store: makeStore(), noticeFn });
    (block.querySelector('[data-cb-md-save]') as HTMLElement).click();
    await vi.waitFor(() => expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(1));
    const [app, folder, scope, title, body] = (saveModule.saveMarkdown as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(scope).toBe('block');
    expect(title).toBe('ブロック見出し');
    expect(body).toContain('ブロック本文');
  });

  it('memory.enabled=false では注入しない', () => {
    const block = makeBlock();
    setupMessageMdSaveButtons({ app: {} as never, store: makeStore(false), noticeFn: vi.fn() });
    expect(block.querySelector('[data-cb-md-save]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/memory/message-md-save-button.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Implement message-md-save-button.ts**

```typescript
/**
 * v0.17.0: ClaudianChat 回答ブロック（.claudian-text-block）右下の 📝MD保存ボタン。
 * クリックでそのブロックのみをメモリフォルダに保存する（scope=block）。
 */
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { findFirstHeadingText } from './extract';
import { serializeElementToMarkdown } from './serialize';
import { saveMarkdown } from './save';

const TEXT_BLOCK_SELECTOR = '.claudian-text-block';
const COPY_BTN_SELECTOR = '.claudian-text-copy-btn';
const SAVE_MARK = 'data-cb-md-save';
const EXCLUDE_SELECTORS = ['.claudian-text-copy-btn', '.claudian-text-tts-btn', '[data-cb-md-save]'];

export interface MessageMdSaveButtonDeps {
  app: App;
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

export function setupMessageMdSaveButtons(deps: MessageMdSaveButtonDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const inject = (block: HTMLElement): void => {
    if (deps.store.load().memory.enabled === false) return;
    if (block.querySelector(`[${SAVE_MARK}]`)) return;
    const copyBtn = block.querySelector(COPY_BTN_SELECTOR);
    if (!copyBtn) return;
    const btn = document.createElement('span');
    btn.className = 'claudian-text-md-save-btn';
    btn.setAttribute(SAVE_MARK, 'true');
    btn.textContent = '📝';
    btn.title = 'MD保存：このブロックを保存';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void (async () => {
        const cfg = deps.store.load();
        if (!cfg.memory.enabled) return;
        const md = serializeElementToMarkdown(block, EXCLUDE_SELECTORS);
        if (md.trim() === '') return;
        const title = findFirstHeadingText(block);
        const r = await saveMarkdown(deps.app, cfg.memory.folder, 'block', title, md);
        notice(r.ok ? `✅ ${r.path} に保存しました` : `⚠️ 保存失敗: ${r.message}`);
      })().catch((e) => console.warn('[cb-md-save-block] failed:', e));
    });
    copyBtn.before(btn);
  };

  const scan = (): void => {
    document.querySelectorAll(TEXT_BLOCK_SELECTOR).forEach((el) => {
      if (el instanceof HTMLElement) inject(el);
    });
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement &&
            (node.matches(TEXT_BLOCK_SELECTOR) || node.querySelector(TEXT_BLOCK_SELECTOR) || node.closest(TEXT_BLOCK_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  deps.store.onSave(() => {
    if (deps.store.load().memory.enabled === false) {
      document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
    } else {
      scan();
    }
  });

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${SAVE_MARK}]`).forEach((el) => el.remove());
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/memory/message-md-save-button.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/memory/message-md-save-button.ts tests/features/memory/message-md-save-button.test.ts
git commit -m "feat(memory): add per-block MD save button to chat answer blocks"
```

---

### Task 7: 設定タブ + i18n

**Files:**
- Create: `src/settings/SettingTabMemory.ts`
- Modify: `src/settings/ClaudianBridgeSettingTab.ts`
- Modify: `src/core/i18n.ts`（`LocaleStrings` interface + ja/en/zh 3 オブジェクト）
- Test: `tests/core/i18n.test.ts`（全キーが全ロケールに存在する検証）

**Interfaces:**
- Consumes: `ConfigStore` / `normalizeMemorySettings` 済みの `memory` 設定（Task 1）
- Produces:
  - `export function renderMemoryTab(app: App, containerEl: HTMLElement, store: ConfigStore): void`

- [ ] **Step 1: Write the failing test**

`tests/core/i18n.test.ts` に追加:

```typescript
it('memory 関連キーが全ロケールに存在する', () => {
  const required = [
    'tabMemory', 'memoryEnabled', 'memoryEnabledDesc',
    'memoryScope', 'memoryScopeDesc', 'memoryScopePair', 'memoryScopeConversation',
    'memoryFolder', 'memoryFolderDesc',
  ];
  for (const lang of ['ja', 'en', 'zh'] as const) {
    const s = getLocaleStrings(lang);
    for (const k of required) {
      expect(typeof s[k as keyof typeof s], `${lang}.${k}`).toBe('string');
    }
  }
});
```

（※既存 `i18n.test.ts` の import・構造に合わせて追加）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/i18n.test.ts`
Expected: FAIL（キー未定義）

- [ ] **Step 3: Add i18n keys**

`src/core/i18n.ts` の `LocaleStrings` interface に追加（既存 `tabChroma` 付近）:

```typescript
tabMemory: string;
memoryEnabled: string;
memoryEnabledDesc: string;
memoryScope: string;
memoryScopeDesc: string;
memoryScopePair: string;
memoryScopeConversation: string;
memoryFolder: string;
memoryFolderDesc: string;
```

ja（`ja: {` 内）:

```typescript
tabMemory: 'Memory',
memoryEnabled: 'MD保存ボタン',
memoryEnabledDesc: 'Chat結果をメモリフォルダに保存するボタンをツールバーと回答ブロックに表示します',
memoryScope: '保存範囲（ツールバー）',
memoryScopeDesc: 'ツールバーボタンの保存範囲。回答ブロックのボタンは常にブロックのみです',
memoryScopePair: '質問＋応答',
memoryScopeConversation: 'チャット全体',
memoryFolder: 'メモリフォルダ',
memoryFolderDesc: '相対パスは Vault 内、絶対パスはそのまま。既定 Memory/',
```

en:

```typescript
tabMemory: 'Memory',
memoryEnabled: 'MD save button',
memoryEnabledDesc: 'Show buttons in the toolbar and answer blocks to save chat results to the memory folder',
memoryScope: 'Save scope (toolbar)',
memoryScopeDesc: 'Scope of the toolbar button. Block buttons always save only the block',
memoryScopePair: 'Question + answer',
memoryScopeConversation: 'Whole chat',
memoryFolder: 'Memory folder',
memoryFolderDesc: 'Relative path resolves inside the vault, absolute path is used as-is. Default Memory/',
```

zh:

```typescript
tabMemory: 'Memory',
memoryEnabled: 'MD保存按钮',
memoryEnabledDesc: '在工具栏和回答区块显示按钮，将聊天结果保存到记忆文件夹',
memoryScope: '保存范围（工具栏）',
memoryScopeDesc: '工具栏按钮的保存范围。回答区块按钮始终只保存该区块',
memoryScopePair: '提问＋回答',
memoryScopeConversation: '整个聊天',
memoryFolder: '记忆文件夹',
memoryFolderDesc: '相对路径解析为库内，绝对路径原样使用。默认为 Memory/',
```

- [ ] **Step 4: Create SettingTabMemory.ts**

```typescript
import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type { MemoryScope } from '../core/settings';

export function renderMemoryTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabMemory });

    new Setting(containerEl)
      .setName(s.memoryEnabled)
      .setDesc(s.memoryEnabledDesc)
      .addToggle((t) => t.setValue(cfg.memory.enabled).onChange((v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, memory: { ...latest.memory, enabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    new Setting(containerEl)
      .setName(s.memoryScope)
      .setDesc(s.memoryScopeDesc)
      .addDropdown((d) => {
        d.addOption('pair', s.memoryScopePair);
        d.addOption('conversation', s.memoryScopeConversation);
        d.setValue(cfg.memory.scope).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, memory: { ...latest.memory, scope: v as MemoryScope } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });

    new Setting(containerEl)
      .setName(s.memoryFolder)
      .setDesc(s.memoryFolderDesc)
      .addText((t) => t
        .setPlaceholder('Memory/')
        .setValue(cfg.memory.folder)
        .onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, memory: { ...latest.memory, folder: v } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }),
      );
  };

  draw();
}
```

- [ ] **Step 5: Register the tab**

`src/settings/ClaudianBridgeSettingTab.ts`:
- `import { renderMemoryTab } from './SettingTabMemory';` を追加
- `TabDef` の `labelKey` union に `| 'tabMemory'` を追加
- `TABS` 配列に追加:

```typescript
{ id: 'memory', labelKey: 'tabMemory', render: renderMemoryTab },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/i18n.test.ts tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/settings/SettingTabMemory.ts src/settings/ClaudianBridgeSettingTab.ts src/core/i18n.ts tests/core/i18n.test.ts
git commit -m "feat(memory): add Memory settings tab and i18n strings"
```

---

### Task 8: main.ts 登録 + styles.css + バージョン更新

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`
- Modify: `src/manifest.json`・`package.json`（version 0.16.0 → 0.17.0）
- Test: `npm test`（全件回帰） / `npm run typecheck` / `npm run build`

**Interfaces:**
- Consumes: `setupMdSaveButton`（Task 5）・`setupMessageMdSaveButtons`（Task 6）

- [ ] **Step 1: Register in main.ts**

`src/main.ts` に import 追加:

```typescript
import { setupMdSaveButton } from './features/memory/md-save-button';
import { setupMessageMdSaveButtons } from './features/memory/message-md-save-button';
```

`setupInputAiReadButton` 登録の直後（`diag('input-ai-read button registered');` の後）に追加:

```typescript
// ★ v0.17.0: MD保存ボタン（📝 ツールバー + 回答ブロック）
this.register(setupMdSaveButton({ app: this.app, store: this.store }));
this.register(setupMessageMdSaveButtons({ app: this.app, store: this.store }));
diag('md-save buttons registered');
```

- [ ] **Step 2: Add styles.css**

`styles.css` 末尾に追加:

```css
/* v0.17.0: MD保存ボタン（メモリフォルダ保存） */
.cb-md-save-btn {
  min-width: 2em;
  padding: 0 0.35em;
  justify-content: center;
}
.claudian-text-md-save-btn {
  position: absolute;
  bottom: 0;
  inset-inline-end: 44px;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
}
.claudian-text-md-save-btn svg {
  width: 16px;
  height: 16px;
}
.claudian-text-block:hover .claudian-text-md-save-btn {
  opacity: 1;
}
.claudian-text-md-save-btn:hover {
  color: var(--text-normal);
}
```

- [ ] **Step 3: Bump version**

- `src/manifest.json` の `"version"` を `0.17.0` に
- `package.json` の `"version"` を `0.17.0` に

- [ ] **Step 4: Full verification**

Run: `npm run typecheck && npm test`
Expected: typecheck 成功・vitest **全 passed**

Run: `npm run build`
Expected: esbuild 成功・デプロイ（`main.js` / `manifest.json` / `styles.css` が `.obsidian/plugins/claudian-bridge/` に反映）

- [ ] **Step 5: Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/main.ts styles.css src/manifest.json package.json
git commit -m "chore(release): bump version to 0.17.0 with MD save button"
```

---

### Task 9: 実機確認（UAT）

**Files:**
- なし（手動確認）

- [ ] **Step 1: Obsidian でプラグインをリロード**

Obsidian の設定 → コミュニティプラグイン → Claudian Bridge を無効→有効（または再読込）

- [ ] **Step 2: ツールバー動作確認**

1. ClaudianChat を開き、質問→回答を 1 往復
2. 入力ツールバーに 📝 ボタンが表示される
3. 📝 クリック → 通知「✅ Memory/....md に保存しました」
4. Vault の `Memory/` フォルダに `YYYY-MM-DD-HHMM_先頭見出し.md` が作成され、frontmatter と `## 質問`／`## 回答` が含まれる

- [ ] **Step 3: ブロックボタン動作確認**

1. 回答ブロックにホバー → コピー/読上げの並びに 📝 が表示
2. 📝 クリック → そのブロックのみ `scope: block` で保存される

- [ ] **Step 4: 設定確認**

1. 設定 → Memory タブが表示される
2. 保存範囲を「チャット全体」に変更 → ツールバー📝 が conversation で保存
3. フォルダを絶対パス（例 `D:/AI-Agent/memory`）に変更 → そこへ保存される
4. MD保存ボタンを OFF → ボタンが消える（ON で復活）

- [ ] **Step 5: 完了報告**

- 実機 UAT 結果を [[2026-08-16-md-save-button-design|設計書]] に追記（任意）
- 学習記録への追記を提案

---

## 自己レビュー結果

- **Spec 網羅**：設計書の全節（モジュール構成 / 設定 / 抽出 / 変換 / 保存 / 2ボタン / エラー処理 / テスト / リスク）を Task 1〜9 で実装。スコープ外（YAGNI）は実装しない。
- **プレースホルダなし**：全 Step に実コード・実コマンドを記載。
- **型整合**：`MemoryScope`（設定）と `SavedScope`（保存 frontmatter）を分離。`saveMarkdown(app, folder, scope, title, body)` のシグネチャは Task 4/5/6 で統一。

*📅 2026-08-16 · MiuMiu 🐾*
