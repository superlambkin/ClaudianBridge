# MD ファイル読み上げ位置ハイライト実装計画（v0.33.0 / F-028）

> 📂 パス：`03_開発文書/2026-09-02-md-read-position-highlight-plan.md`
> 📍 関連設計：`[[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-02-md-read-position-highlight-design]]`
> 🏷️ バージョン：v0.31.0
> 📦 機能番号：F-028
> 👑 承認：済（2026-09-02 主人承認）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianBridge の **MD ファイル右クリック「Add to TTS」** で Preview 表示中のチャンク位置に **背景色ハイライト** を付与し、**フローティングオーバーレイの再生コントロール**（⏸▶⏭🔇N/M）で操作できるようにする。

**Architecture:** 案 A（チャンクテキスト検索方式）。MD 本文を既存経路で読み上げつつ、各チャンクの先頭 12-20 文字 anchor を Preview DOM の `TreeWalker` で探索 → 一致テキストノードを `<span class="cb-md-read-chunk">` でラップ → `is-active` class をトグルでハイライト切替。フローティングオーバーレイで ⏸▶⏭🔇 操作し、見出しスキップは元 MD の H1-H3 行解析でチャンク単位 index を解決する。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest + jsdom（DOM 統合テスト）/ Conventional Commits + F-番号

---

## Global Constraints

| # | 制約 |
|:-:|------|
| 1 | プラグイン ID: `ClaudianBridge` / `version` 0.30.2 → **v0.31.0** |
| 2 | 機能 ID: **F-028** を採番（F-027 まで埋まり） |
| 3 | コード保存先: `D:/AI-Agent/ClaudianBridge/src/` |
| 4 | テスト: `D:/AI-Agent/ClaudianBridge/tests/`（vitest） |
| 5 | 言語: TypeScript（既存プロジェクト規約） |
| 6 | Conventional Commits: `feat(F-028):` 形式でコミット |
| 7 | TDD 準拠: テスト → 失敗確認 → 最小実装 → グリーン → commit |
| 8 | 既存ファイル改変は **Surgical Changes**（直接関係する箇所のみ） |
| 9 | i18n: `src/core/i18n.ts` に既存パターン踏襲で 7 キー追加 |
| 10 | styles.css 追記: `.cb-md-read-*` プレフィックスでクラス衝突回避 |

---

## Phase A: 基盤（依存なし）

### Task 1: 設定スキーマ拡張 + i18n + デフォルト値

**Files:**
- Modify: `src/core/settings.ts`（`ClaudianBridgeSettings.tts.mdReadHighlight` 型追加 + `DEFAULT_SETTINGS` 追加）
- Modify: `src/core/i18n.ts`（7 キー追加 ja / en）

**Interfaces:**
- Consumes: 既存 `TtsEngine`, `TtsChunkMaxChars`
- Produces:
  ```typescript
  export interface MdReadHighlightSettings {
    enabled: boolean;
    highlightColor: string;
  }
  // ClaudianBridgeSettings.tts に追加
  mdReadHighlight: MdReadHighlightSettings;
  ```

- [ ] **Step 1.1: 既存 `settings.ts` の末尾付近で型 `MdReadHighlightSettings` を定義**

```typescript
/**
 * v0.31.0 (F-028): MD ファイル「Add to TTS」読み上げ中の Preview ハイライト設定。
 */
export interface MdReadHighlightSettings {
  /** ハイライト機能の有効化（デフォルト true） */
  enabled: boolean;
  /** チャンクのアクティブ背景色（CSS color 文字列）。空文字ならデフォルト色 */
  highlightColor: string;
}
```

- [ ] **Step 1.2: `ClaudianBridgeSettings.tts` 型に `mdReadHighlight` プロパティを追加**

既存の `TtsSettings` 型に以下を追加する:
```typescript
mdReadHighlight: MdReadHighlightSettings;
```

- [ ] **Step 1.3: `DEFAULT_SETTINGS` 定数に `mdReadHighlight` を追加**

```typescript
tts: {
  // ... 既存 ...
  mdReadHighlight: {
    enabled: true,
    highlightColor: '',
  },
},
```

- [ ] **Step 1.4: `i18n.ts` に 7 キーを追加**

既存パターン（`tts.*` の前後）に追加:
```typescript
// 日本語
'tts.mdReadHighlight.enabled': 'MD 読み上げ時にチャンク位置をハイライト',
'tts.mdReadHighlight.highlightColor': 'ハイライト色',
'tts.mdReadOverlay.pause': '一時停止',
'tts.mdReadOverlay.resume': '再開',
'tts.mdReadOverlay.skipToHeading': '次の見出しへ',
'tts.mdReadOverlay.mute': 'ミュート',
'tts.mdReadOverlay.noPreview': 'Preview モードで表示中のみハイライトできます',

// English
'tts.mdReadHighlight.enabled': 'Highlight reading position in MD Preview',
'tts.mdReadHighlight.highlightColor': 'Highlight color',
'tts.mdReadOverlay.pause': 'Pause',
'tts.mdReadOverlay.resume': 'Resume',
'tts.mdReadOverlay.skipToHeading': 'Skip to next heading',
'tts.mdReadOverlay.mute': 'Mute',
'tts.mdReadOverlay.noPreview': 'Highlight only works in Preview mode',
```

- [ ] **Step 1.5: 検証**

```bash
cd D:/AI-Agent/ClaudianBridge
npm run typecheck
```
期待: `✅ 0 errors`

- [ ] **Step 1.6: コミット**

```bash
git add src/core/settings.ts src/core/i18n.ts
git commit -m "feat(F-028): add mdReadHighlight settings schema and i18n keys"
```

---

### Task 2: 型定義（types.ts）

**Files:**
- Create: `src/features/tts/md-read-highlight/types.ts`

**Interfaces:**
- Consumes: `MdReadChunkAnchor` を後続タスクが import
- Produces:
  ```typescript
  export interface MdReadChunkAnchor {
    index: number;
    startLine: number;
    anchor: string;       // 先頭 12-20 文字
    text: string;
    headingLevel: 0 | 1 | 2 | 3;
  }
  export interface MdReadState {
    filePath: string;
    chunks: MdReadChunkAnchor[];
    activeIdx: number;
    paused: boolean;
    phase: 'pending' | 'playing' | 'paused' | 'completed' | 'cleared';
  }
  ```

- [ ] **Step 2.1: ファイル作成**

```typescript
/**
 * v0.31.0 (F-028): MD 読み上げ位置ハイライト機能の型定義。
 */

/** MD ファイル内の単一チャンクの anchor + メタデータ */
export interface MdReadChunkAnchor {
  /** チャンク番号（0 始まり） */
  index: number;
  /** 元 MD ファイルでの開始行番号（0 始まり） */
  startLine: number;
  /** チャンク先頭の anchor テキスト（12-20 文字） */
  anchor: string;
  /** チャンク本文 */
  text: string;
  /** このチャンクが属する直近の heading level（0=プレアンブル／1-3=H1-H3） */
  headingLevel: 0 | 1 | 2 | 3;
}

/** ハイライト機構の状態（シングルトン管理用） */
export interface MdReadState {
  /** 再生対象ファイルパス */
  filePath: string;
  /** 構築済み chunk anchor 配列 */
  chunks: MdReadChunkAnchor[];
  /** 現在 active な chunk index（-1=未開始） */
  activeIdx: number;
  /** 一時停止フラグ */
  paused: boolean;
  /** ライフサイクル状態 */
  phase: 'pending' | 'playing' | 'paused' | 'completed' | 'cleared';
}

/** 公開するチャネルイベント（コントローラ ⇄ レンダラ間のメッセージ） */
export type MdReadCommand =
  | { kind: 'set-active'; idx: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'skip-to'; idx: number }
  | { kind: 'clear' };
```

- [ ] **Step 2.2: 検証**

```bash
npm run typecheck
```

- [ ] **Step 2.3: コミット**

```bash
git add src/features/tts/md-read-highlight/types.ts
git commit -m "feat(F-028): add md-read-highlight types"
```

---

### Task 3: anchor.ts（チャンク分割 + heading index 計算）

**Files:**
- Create: `src/features/tts/md-read-highlight/anchor.ts`
- Create: `tests/features/tts/md-read-highlight/anchor.test.ts`

**Interfaces:**
- Consumes: `MdReadChunkAnchor` 型
- Produces:
  ```typescript
  export function buildChunks(
    rawMd: string,
    filteredText: string,
    chunkMaxChars: number
  ): MdReadChunkAnchor[];
  ```

- [ ] **Step 3.1: 失敗テストを書く**

```typescript
// tests/features/tts/md-read-highlight/anchor.test.ts
import { describe, it, expect } from 'vitest';
import { buildChunks } from '../../../src/features/tts/md-read-highlight/anchor';

describe('buildChunks', () => {
  it('短いテキストは単一チャンク', () => {
    const raw = 'Hello world.\nThis is a test.';
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].anchor).toBe('Hello world.');
    expect(chunks[0].headingLevel).toBe(0);
  });

  it('長いテキストは chunkMaxChars で分割', () => {
    const raw = 'a'.repeat(1200);
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 500);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text.length).toBeLessThanOrEqual(500);
  });

  it('見出しレベルを H1/H2/H3 で判定', () => {
    const raw = '前置き\n# Title 1\n本文\n## Sub 2\n本文2\n### Sub Sub 3\n本文3';
    const filtered = '前置き\nTitle 1\n本文\nSub 2\n本文2\nSub Sub 3\n本文3';
    const chunks = buildChunks(raw, filtered, 500);
    // chunk 0: プレアンブル
    expect(chunks.find((c) => c.text.includes('前置き'))?.headingLevel).toBe(0);
    // chunk 1: H1
    expect(chunks.find((c) => c.text.includes('Title 1'))?.headingLevel).toBe(1);
    // chunk 2: H2
    expect(chunks.find((c) => c.text.includes('Sub 2'))?.headingLevel).toBe(2);
    // chunk 3: H3
    expect(chunks.find((c) => c.text.includes('Sub Sub 3'))?.headingLevel).toBe(3);
  });

  it('anchor は各チャンク先頭 12-20 文字', () => {
    const raw = 'abcdefghijklmnopqrstuvwxyz';
    const filtered = raw;
    const chunks = buildChunks(raw, filtered, 10);
    for (const c of chunks) {
      expect(c.anchor.length).toBeGreaterThanOrEqual(Math.min(12, c.text.length));
      expect(c.anchor.length).toBeLessThanOrEqual(20);
      expect(c.text.startsWith(c.anchor)).toBe(true);
    }
  });
});
```

- [ ] **Step 3.2: 失敗確認**

```bash
cd D:/AI-Agent/ClaudianBridge
npm run test -- anchor.test
```
期待: 4 件 FAIL（`buildChunks` not defined）

- [ ] **Step 3.3: 最小実装**

```typescript
// src/features/tts/md-read-highlight/anchor.ts
import type { MdReadChunkAnchor } from './types';

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

/**
 * rawMd + filteredText から MdReadChunkAnchor[] を構築する。
 * chunkMaxChars で chunk 分割、各 chunk の anchor を生成、heading level を解決。
 */
export function buildChunks(
  rawMd: string,
  filteredText: string,
  chunkMaxChars: number
): MdReadChunkAnchor[] {
  const rawLines = rawMd.split(/\r?\n/);
  const filteredLines = filteredText.split(/\r?\n/);
  // chunk はフィルタ後テキストで分割
  const chunks: { text: string; startLine: number }[] = [];
  let buf = '';
  let bufStartLine = 0;
  let filteredLineIdx = 0;
  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i];
    if (buf.length + line.length + 1 > chunkMaxChars && buf.length > 0) {
      chunks.push({ text: buf.trim(), startLine: bufStartLine });
      buf = '';
      bufStartLine = i;
    }
    if (buf.length > 0) buf += '\n';
    buf += line;
    if (buf.length === line.length) bufStartLine = i;
  }
  if (buf.trim().length > 0) {
    chunks.push({ text: buf.trim(), startLine: bufStartLine });
  }

  // 各チャンクの anchor + heading level 解決
  return chunks.map((c, idx) => {
    const anchorText = c.text.slice(0, Math.min(20, c.text.length));
    // 直近の heading level を raw MD で逆算
    let level: 0 | 1 | 2 | 3 = 0;
    for (let l = c.startLine; l >= 0; l--) {
      const m = rawLines[l]?.match(HEADING_RE);
      if (m) {
        const n = m[1].length as 1 | 2 | 3;
        level = n;
        break;
      }
    }
    return {
      index: idx,
      startLine: c.startLine,
      anchor: anchorText,
      text: c.text,
      headingLevel: level,
    };
  });
}
```

- [ ] **Step 3.4: グリーン確認**

```bash
npm run test -- anchor.test
```
期待: 4 件 PASS

- [ ] **Step 3.5: コミット**

```bash
git add src/features/tts/md-read-highlight/anchor.ts tests/features/tts/md-read-highlight/anchor.test.ts
git commit -m "feat(F-028): implement buildChunks with heading level"
```

---

### Task 4: HighlightStateManager（state.ts）

**Files:**
- Create: `src/features/tts/md-read-highlight/state.ts`
- Create: `tests/features/tts/md-read-highlight/state.test.ts`

**Interfaces:**
- Consumes: `MdReadState`, `MdReadCommand`, `MdReadChunkAnchor`
- Produces:
  ```typescript
  export const mdReadState: {
    get(): MdReadState | null;
    register(filePath: string, chunks: MdReadChunkAnchor[]): void;
    setActiveIdx(idx: number): void;
    pause(): void;
    resume(): void;
    complete(): void;
    clear(): void;
    /** 状態変化の購読者 */
    subscribe(fn: (s: MdReadState) => void): () => void;
  };
  ```

- [ ] **Step 4.1: 失敗テスト**

```typescript
// tests/features/tts/md-read-highlight/state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mdReadState } from '../../../src/features/tts/md-read-highlight/state';
import type { MdReadChunkAnchor } from '../../../src/features/tts/md-read-highlight/types';

const chunks: MdReadChunkAnchor[] = [
  { index: 0, startLine: 0, anchor: 'abc', text: 'abc...', headingLevel: 1 },
  { index: 1, startLine: 1, anchor: 'def', text: 'def...', headingLevel: 2 },
];

describe('mdReadState', () => {
  beforeEach(() => mdReadState.clear());

  it('register で state 初期化', () => {
    mdReadState.register('/a.md', chunks);
    const s = mdReadState.get();
    expect(s?.filePath).toBe('/a.md');
    expect(s?.chunks).toEqual(chunks);
    expect(s?.activeIdx).toBe(-1);
    expect(s?.phase).toBe('pending');
  });

  it('setActiveIdx で idx 更新 + 購読者コールバック', () => {
    const cb = vi.fn();
    mdReadState.subscribe(cb);
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(1);
    expect(mdReadState.get()?.activeIdx).toBe(1);
    expect(mdReadState.get()?.phase).toBe('playing');
    expect(cb).toHaveBeenCalled();
  });

  it('pause / resume', () => {
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(0);
    mdReadState.pause();
    expect(mdReadState.get()?.paused).toBe(true);
    expect(mdReadState.get()?.phase).toBe('paused');
    mdReadState.resume();
    expect(mdReadState.get()?.paused).toBe(false);
    expect(mdReadState.get()?.phase).toBe('playing');
  });

  it('clear で state 破棄', () => {
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(0);
    mdReadState.clear();
    expect(mdReadState.get()).toBeNull();
  });
});
```

- [ ] **Step 4.2: 失敗確認**

```bash
npm run test -- state.test
```
期待: 4 件 FAIL

- [ ] **Step 4.3: 実装**

```typescript
// src/features/tts/md-read-highlight/state.ts
import type { MdReadState, MdReadChunkAnchor } from './types';

let current: MdReadState | null = null;
const subs = new Set<(s: MdReadState) => void>();

function notify(): void {
  if (current) subs.forEach((fn) => fn(current!));
}

export const mdReadState = {
  get(): MdReadState | null {
    return current;
  },
  register(filePath: string, chunks: MdReadChunkAnchor[]): void {
    current = {
      filePath,
      chunks,
      activeIdx: -1,
      paused: false,
      phase: 'pending',
    };
    notify();
  },
  setActiveIdx(idx: number): void {
    if (!current) return;
    current.activeIdx = idx;
    if (idx >= 0 && !current.paused) current.phase = 'playing';
    notify();
  },
  pause(): void {
    if (!current) return;
    current.paused = true;
    current.phase = 'paused';
    notify();
  },
  resume(): void {
    if (!current) return;
    current.paused = false;
    current.phase = 'playing';
    notify();
  },
  complete(): void {
    if (!current) return;
    current.phase = 'completed';
    notify();
  },
  clear(): void {
    current = null;
    subs.forEach((fn) => fn({ filePath: '', chunks: [], activeIdx: -1, paused: false, phase: 'cleared' }));
  },
  subscribe(fn: (s: MdReadState) => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
```

- [ ] **Step 4.4: グリーン確認 + コミット**

```bash
npm run test -- state.test
git add src/features/tts/md-read-highlight/state.ts tests/features/tts/md-read-highlight/state.test.ts
git commit -m "feat(F-028): add HighlightStateManager singleton"
```

---

## Phase B: 中核機能（DOM 操作 + UI）

### Task 5: preview-renderer.ts（TreeWalker + span 注入 + scrollIntoView）

**Files:**
- Create: `src/features/tts/md-read-highlight/preview-renderer.ts`
- Create: `tests/features/tts/md-read-highlight/preview-renderer.test.ts`

**Interfaces:**
- Consumes: `MdReadChunkAnchor`
- Produces:
  ```typescript
  export function highlightChunkInPreview(
    view: { previewMode?: { containerEl: HTMLElement } },
    chunk: MdReadChunkAnchor
  ): void;
  export function clearAllHighlights(view: { previewMode?: { containerEl: HTMLElement } }): void;
  ```

- [ ] **Step 5.1: 失敗テスト**

```typescript
// tests/features/tts/md-read-highlight/preview-renderer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { highlightChunkInPreview, clearAllHighlights } from '../../../src/features/tts/md-read-highlight/preview-renderer';
import type { MdReadChunkAnchor } from '../../../src/features/tts/md-read-highlight/types';

function makePreview(text: string): HTMLElement {
  document.body.innerHTML = '';
  const p = document.createElement('div');
  p.textContent = text;
  document.body.appendChild(p);
  return p;
}

const chunk: MdReadChunkAnchor = {
  index: 0,
  startLine: 0,
  anchor: 'Hello world. This is',
  text: 'Hello world. This is a long paragraph.',
  headingLevel: 0,
};

describe('highlightChunkInPreview', () => {
  beforeEach(() => document.body.innerHTML = '');

  it('anchor を span でラップ → is-active クラス付与', () => {
    const view = { previewMode: { containerEl: makePreview('Hello world. This is a test.') } };
    highlightChunkInPreview(view, chunk);
    const active = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain('Hello world');
  });

  it('anchor が見つからない場合 no-op（throw しない）', () => {
    const view = { previewMode: { containerEl: makePreview('xyz') } };
    expect(() => highlightChunkInPreview(view, chunk)).not.toThrow();
  });

  it('既存アクティブはクラス剥奪 → 新アクティブ付与', () => {
    const view = {
      previewMode: {
        containerEl: makePreview('Hello world. This is a test.'),
      },
    };
    highlightChunkInPreview(view, chunk);
    const first = view.previewMode.containerEl.querySelector('.cb-md-read-chunk.is-active');
    highlightChunkInPreview(view, { ...chunk, index: 1, anchor: 'xyz' });
    // 古い active は消える
    expect(view.previewMode.containerEl.querySelectorAll('.cb-md-read-chunk.is-active')).toHaveLength(0);
    // 新規 anchor がマッチしない場合 no-op → active 数 = 0
    expect(first).not.toBeNull();
  });

  it('clearAllHighlights で全 cb-md-read-chunk を削除', () => {
    const view = { previewMode: { containerEl: makePreview('Hello world. This is a test.') } };
    highlightChunkInPreview(view, chunk);
    clearAllHighlights(view);
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-chunk')).toBeNull();
  });
});
```

- [ ] **Step 5.2: 失敗確認**

```bash
npm run test -- preview-renderer.test
```
期待: 4 件 FAIL

- [ ] **Step 5.3: 実装**

```typescript
// src/features/tts/md-read-highlight/preview-renderer.ts
import type { MdReadChunkAnchor } from './types';

const ACTIVE_CLASS = 'is-active';
const CHUNK_CLASS = 'cb-md-read-chunk';
/** チャンクマーカー span を識別するための CSS プレフィックス文字列 */
const WRAPPER_MARK = 'data-cb-md-read-chunk';

interface PreviewLike {
  previewMode?: { containerEl: HTMLElement };
}

/** 既存のアクティブ span を全て非アクティブ化 */
function deactivateAll(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(`.${CHUNK_CLASS}.${ACTIVE_CLASS}`)
    .forEach((el) => el.classList.remove(ACTIVE_CLASS));
}

/** TreeWalker で anchor を含む最初のテキストノードを発見 */
function findAnchorNode(container: HTMLElement, anchor: string): Text | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.nodeValue && textNode.nodeValue.includes(anchor)) {
      return textNode;
    }
    node = walker.nextNode();
  }
  return null;
}

/** anchor を含むテキストノードを wrap してアクティブ化 */
export function highlightChunkInPreview(view: PreviewLike, chunk: MdReadChunkAnchor): void {
  const container = view.previewMode?.containerEl;
  if (!container) return;
  deactivateAll(container);
  const textNode = findAnchorNode(container, chunk.anchor);
  if (!textNode) return; // フォールバック：throw しない

  const text = textNode.nodeValue ?? '';
  const idx = text.indexOf(chunk.anchor);
  if (idx < 0) return;
  const before = document.createTextNode(text.slice(0, idx));
  const matched = document.createElement('span');
  matched.className = `${CHUNK_CLASS} ${ACTIVE_CLASS}`;
  matched.setAttribute(WRAPPER_MARK, String(chunk.index));
  matched.textContent = chunk.anchor;
  const after = document.createTextNode(text.slice(idx + chunk.anchor.length));

  const parent = textNode.parentNode;
  if (!parent) return;
  parent.insertBefore(before, textNode);
  parent.insertBefore(matched, textNode);
  parent.insertBefore(after, textNode);
  parent.removeChild(textNode);

  matched.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** 全アクティブ + 全 wrapper を除去 */
export function clearAllHighlights(view: PreviewLike): void {
  const container = view.previewMode?.containerEl;
  if (!container) return;
  container.querySelectorAll(`.${CHUNK_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    const text = document.createTextNode(el.textContent ?? '');
    parent.insertBefore(text, el);
    parent.removeChild(el);
    parent.normalize();
  });
}
```

- [ ] **Step 5.4: グリーン確認 + コミット**

```bash
npm run test -- preview-renderer.test
git add src/features/tts/md-read-highlight/preview-renderer.ts tests/features/tts/md-read-highlight/preview-renderer.test.ts
git commit -m "feat(F-028): add preview-renderer with TreeWalker and active class toggle"
```

---

### Task 6: floating-overlay.ts（UI + クリックイベント）

**Files:**
- Create: `src/features/tts/md-read-highlight/floating-overlay.ts`
- Create: `tests/features/tts/md-read-highlight/floating-overlay.test.ts`

**Interfaces:**
- Consumes: `MdReadState`
- Produces:
  ```typescript
  export function mountOverlay(view: PreviewLike, opts: { onPause: () => void; onResume: () => void; onSkip: () => void; onMute: () => void }): () => void;
  ```

- [ ] **Step 6.1: 失敗テスト**

```typescript
// tests/features/tts/md-read-highlight/floating-overlay.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountOverlay } from '../../../src/features/tts/md-read-highlight/floating-overlay';

function makePreview(): HTMLElement {
  document.body.innerHTML = '';
  const p = document.createElement('div');
  document.body.appendChild(p);
  return p;
}

describe('mountOverlay', () => {
  beforeEach(() => document.body.innerHTML = '');

  it('mount で overlay DOM を挿入 → unmount で削除', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    const unmount = mountOverlay(view, handlers);
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-overlay')).not.toBeNull();
    unmount();
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-overlay')).toBeNull();
  });

  it('⏸ ボタンクリックで onPause 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const pauseBtn = view.previewMode.containerEl.querySelector<HTMLElement>('[data-cb-md-read-pause]');
    pauseBtn?.click();
    expect(handlers.onPause).toHaveBeenCalled();
  });

  it('⏭ ボタンクリックで onSkip 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const skipBtn = view.previewMode.containerEl.querySelector<HTMLElement>('[data-cb-md-read-skip]');
    skipBtn?.click();
    expect(handlers.onSkip).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.2: 失敗確認**

```bash
npm run test -- floating-overlay.test
```
期待: 3 件 FAIL

- [ ] **Step 6.3: 実装**

```typescript
// src/features/tts/md-read-highlight/floating-overlay.ts
import type { MdReadState } from './types';

interface PreviewLike {
  previewMode?: { containerEl: HTMLElement };
}

interface OverlayHandlers {
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onMute: () => void;
}

const OVERLAY_CLASS = 'cb-md-read-overlay';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountOverlay(
  view: PreviewLike,
  handlers: OverlayHandlers
): () => void {
  const container = view.previewMode?.containerEl;
  if (!container) return () => undefined;

  const overlay = el('div', { class: OVERLAY_CLASS });
  const pauseBtn = el('button', { 'data-cb-md-read-pause': 'true' }, '⏸');
  const skipBtn = el('button', { 'data-cb-md-read-skip': 'true' }, '⏭');
  const muteBtn = el('button', { 'data-cb-md-read-mute': 'true' }, '🔇');
  const progress = el('span', { 'data-cb-md-read-progress': 'true' }, '-/-');
  overlay.appendChild(pauseBtn);
  overlay.appendChild(skipBtn);
  overlay.appendChild(muteBtn);
  overlay.appendChild(progress);

  pauseBtn.addEventListener('click', () => handlers.onPause());
  skipBtn.addEventListener('click', () => handlers.onSkip());
  muteBtn.addEventListener('click', () => handlers.onMute());

  container.appendChild(overlay);

  return () => {
    overlay.remove();
  };
}
```

- [ ] **Step 6.4: グリーン確認 + コミット**

```bash
npm run test -- floating-overlay.test
git add src/features/tts/md-read-highlight/floating-overlay.ts tests/features/tts/md-read-highlight/floating-overlay.test.ts
git commit -m "feat(F-028): add floating overlay with control buttons"
```

---

### Task 7: heading-skip.ts（次見出し index 解決）

**Files:**
- Create: `src/features/tts/md-read-highlight/heading-skip.ts`
- Create: `tests/features/tts/md-read-highlight/heading-skip.test.ts`

**Interfaces:**
- Consumes: `MdReadChunkAnchor[]`
- Produces:
  ```typescript
  export function nextHeadingIndex(chunks: MdReadChunkAnchor[], currentIdx: number): number;
  ```

- [ ] **Step 7.1: 失敗テスト**

```typescript
// tests/features/tts/md-read-highlight/heading-skip.test.ts
import { describe, it, expect } from 'vitest';
import { nextHeadingIndex } from '../../../src/features/tts/md-read-highlight/heading-skip';
import type { MdReadChunkAnchor } from '../../../src/features/tts/md-read-highlight/types';

function chunk(idx: number, level: 0 | 1 | 2 | 3): MdReadChunkAnchor {
  return { index: idx, startLine: idx, anchor: '', text: '', headingLevel: level };
}

describe('nextHeadingIndex', () => {
  it('H2 → H1 を探して返す（より小さいレベルへの境界）', () => {
    const cs = [chunk(0, 1), chunk(1, 2), chunk(2, 2), chunk(3, 1)];
    expect(nextHeadingIndex(cs, 1)).toBe(3);
  });

  it('末尾到達（次見出しなし）→ current を返す', () => {
    const cs = [chunk(0, 1), chunk(1, 2)];
    expect(nextHeadingIndex(cs, 0)).toBe(0);
  });

  it('同じ H2 が出現してもスキップしない', () => {
    const cs = [chunk(0, 1), chunk(1, 2), chunk(2, 2)];
    // idx=0（H1）から次の H1/H2 を探す → chunk(2) は H2 だが、これは含まれるべき（同レベル）
    // → 仕様: 「現在のレベル以下で 0 より大きい」を返す → chunk(2) を返す
    expect(nextHeadingIndex(cs, 0)).toBe(2);
  });
});
```

- [ ] **Step 7.2: 失敗確認**

```bash
npm run test -- heading-skip.test
```
期待: 3 件 FAIL

- [ ] **Step 7.3: 実装**

```typescript
// src/features/tts/md-read-highlight/heading-skip.ts
import type { MdReadChunkAnchor } from './types';

/**
 * 現在のチャンクから次の「より小さいか等しい heading level」が出現する index を返す。
 * 末尾に到達して見つからない場合は current を返す。
 *
 * H1 のチャンクから → 次の H1 が出るところ
 * H2 のチャンクから → 次の H1/H2 が出るところ（H3 は範囲内なのでスキップ）
 */
export function nextHeadingIndex(
  chunks: MdReadChunkAnchor[],
  currentIdx: number
): number {
  const current = chunks[currentIdx];
  if (!current) return currentIdx;
  for (let i = currentIdx + 1; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.headingLevel > 0 && c.headingLevel <= current.headingLevel) {
      return i;
    }
  }
  return currentIdx;
}
```

- [ ] **Step 7.4: グリーン確認 + コミット**

```bash
npm run test -- heading-skip.test
git add src/features/tts/md-read-highlight/heading-skip.ts tests/features/tts/md-read-highlight/heading-skip.test.ts
git commit -m "feat(F-028): add heading-skip logic"
```

---

## Phase C: 統合（既存ファイルへのフック）

### Task 8: md-file-read.ts に register フック

**Files:**
- Modify: `src/features/tts/md-file-read.ts:52`（`await speakText('md', text, cfg, ...)` の前後）

**Interfaces:**
- Consumes: `extractMdText`（既存）+ 新規 `mdReadState.register`, `buildChunks`
- Produces: register 時にハイライト機能へ接続

- [ ] **Step 8.1: 修正**

`src/features/tts/md-file-read.ts` 内、`extractMdText` の結果直後に以下を追加:

```typescript
// v0.31.0 (F-028): MD 読み上げ位置ハイライト機能にチャンク anchor を登録
const { buildChunks } = await import('./md-read-highlight/anchor');
const { mdReadState } = await import('./md-read-highlight/state');
const chunkMax = cfg.tts.chunkMaxChars?.edge ?? 500;
const chunks = buildChunks(content, text, chunkMax);
mdReadState.register((file as TFile).path, chunks);
```

- [ ] **Step 8.2: 検証**

```bash
npm run typecheck
npm run test
```
期待: 既存全テスト PASS

- [ ] **Step 8.3: コミット**

```bash
git add src/features/tts/md-file-read.ts
git commit -m "feat(F-028): hook md-file-read to highlight state manager"
```

---

### Task 9: speak.ts に chunk start / end イベント

**Files:**
- Modify: `src/features/tts/speak.ts`（各 chunk speak の前後で `setActiveIdx` 呼び出し）

**Interfaces:**
- Consumes: 既存 `speakChunks` / `chunkText` + 新規 `mdReadState.setActiveIdx`
- Produces: chunk speak の start で active idx を更新

- [ ] **Step 9.1: chunk speak ループに idx 更新を追加**

`speakChunks` 関数の内部で、`await speakChunk(chunks[i])` の前後で:

```typescript
// v0.31.0 (F-028): chunk 開始 / 終了で state を更新
import { mdReadState } from './md-read-highlight/state';
// speak start
mdReadState.setActiveIdx(i);
// speak (existing code)
await engine.speak(chunks[i]);
// speak end (handled by completion / next iteration)
```

- [ ] **Step 9.2: 検証**

```bash
npm run typecheck
npm run test
```

- [ ] **Step 9.3: コミット**

```bash
git add src/features/tts/speak.ts
git commit -m "feat(F-028): emit chunk index updates to HighlightStateManager"
```

---

### Task 10: speakCoordinator に pause / resume / skipTo メソッド

**Files:**
- Modify: `src/features/tts/speak-coordinator.ts`（`pause/resume/skipTo` メソッド追加）
- Create: `tests/features/tts/speak-coordinator.test.ts`（該当テスト追加）

**Interfaces:**
- Produces:
  ```typescript
  export interface SpeakCoordinator {
    pause(): void;
    resume(): void;
    skipTo(idx: number): void;
  }
  ```

- [ ] **Step 10.1: 失敗テスト**

```typescript
// tests/features/tts/speak-coordinator.test.ts に追加
describe('SpeakCoordinator pause/resume/skipTo', () => {
  it('pause → resume で setActiveIdx -1 再開', async () => {
    // ... 既存 pause/resume テストに追加
  });
  it('skipTo(5) でチャンク 5 へジャンプ', () => {
    // ...
  });
});
```

- [ ] **Step 10.2: 失敗確認**

```bash
npm run test -- speak-coordinator.test
```

- [ ] **Step 10.3: 実装**

```typescript
// speak-coordinator.ts に追加
public pause(): void {
  // 既存 pause ロジック呼び出し
  this.paused = true;
  mdReadState.pause(); // F-028
}

public resume(): void {
  this.paused = false;
  mdReadState.resume(); // F-028
}

public skipTo(idx: number): void {
  this.currentIdx = idx;
  mdReadState.setActiveIdx(idx); // F-028
}
```

- [ ] **Step 10.4: グリーン確認 + コミット**

```bash
npm run test
git add src/features/tts/speak-coordinator.ts tests/features/tts/speak-coordinator.test.ts
git commit -m "feat(F-028): add pause/resume/skipTo to SpeakCoordinator"
```

---

### Task 11: cleanup.ts + main.ts 登録 + styles.css 基本

**Files:**
- Create: `src/features/tts/md-read-highlight/cleanup.ts`
- Create: `src/features/tts/md-read-highlight/index.ts`
- Modify: `src/main.ts`（`setupMdReadHighlight(app, store)` 登録）
- Modify: `styles.css`（オーバーレイ基本スタイル）

- [ ] **Step 11.1: cleanup.ts 作成**

```typescript
// src/features/tts/md-read-highlight/cleanup.ts
import type { App } from 'obsidian';
import { mdReadState } from './state';
import { clearAllHighlights } from './preview-renderer';

export function clearAllForFile(app: App): void {
  app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
    const view = leaf.view;
    if ('previewMode' in view) {
      clearAllHighlights(view as any);
    }
  });
  mdReadState.clear();
}
```

- [ ] **Step 11.2: index.ts 公開 I/F**

```typescript
// src/features/tts/md-read-highlight/index.ts
export { mdReadState } from './state';
export { buildChunks } from './anchor';
export { highlightChunkInPreview, clearAllHighlights } from './preview-renderer';
export { mountOverlay } from './floating-overlay';
export { nextHeadingIndex } from './heading-skip';
export { clearAllForFile } from './cleanup';
```

- [ ] **Step 11.3: main.ts 登録**

```typescript
// main.ts の `this.register(...)` 群に追加
this.register(setupMdReadHighlight(this.app, this.store));
```

`setupMdReadHighlight` は以下:
```typescript
export function setupMdReadHighlight(app: App, store: ConfigStore): () => void {
  const off1 = app.workspace.on('file-close', () => {
    if (mdReadState.get()?.filePath) clearAllForFile(app);
  });
  const off2 = mdReadState.subscribe((s) => {
    if (s.phase === 'completed') clearAllForFile(app);
  });
  return () => { off1(); off2(); };
}
```

- [ ] **Step 11.4: styles.css 追記**

```css
/* v0.31.0 F-028: MD 読み上げ位置ハイライト */
.cb-md-read-chunk {
  background-color: transparent;
  border-radius: 2px;
  transition: background-color 200ms ease;
}
.cb-md-read-chunk.is-active {
  background-color: var(--cb-md-read-highlight, rgba(100, 180, 255, 0.35));
}
.cb-md-read-overlay {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: rgba(40, 40, 40, 0.85);
  color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.cb-md-read-overlay button {
  background: transparent;
  border: none;
  color: white;
  font-size: 16px;
  cursor: pointer;
}
```

- [ ] **Step 11.5: 検証 + コミット**

```bash
npm run typecheck
npm run test
git add src/features/tts/md-read-highlight/cleanup.ts src/features/tts/md-read-highlight/index.ts src/main.ts styles.css
git commit -m "feat(F-028): wire up cleanup, main registration, and base styles"
```

---

## Phase D: 設定 UI + 色バインド

### Task 12: SettingTab UI（トグル + 色）+ 完全スタイル

**Files:**
- Modify: `src/features/settings/SettingTab.ts`（TTS タブに新セクション追加）
- Modify: `styles.css`（残りの v0.31.0 スタイル）

- [ ] **Step 12.1: SettingTab に追加**

```typescript
// SettingTab.ts の TTS タブ render 内
containerEl.createEl('h3', { text: s.tts.mdReadHighlight.enabled /* タイトルは i18n キー名 */ });

new Setting(containerEl)
  .setName(getLocaleStrings(getUILanguage()).tts.mdReadHighlight.enabled)
  .addToggle((t) => t.setValue(this.plugin.settings.tts.mdReadHighlight.enabled)
    .onChange((v) => {
      this.plugin.settings.tts.mdReadHighlight.enabled = v;
      this.plugin.saveSettings();
    }));

new Setting(containerEl)
  .setName(getLocaleStrings(getUILanguage()).tts.mdReadHighlight.highlightColor)
  .addText((text) => text
    .setPlaceholder('#a0c4ff')
    .setValue(this.plugin.settings.tts.mdReadHighlight.highlightColor)
    .onChange((v) => {
      this.plugin.settings.tts.mdReadHighlight.highlightColor = v;
      this.plugin.saveSettings();
      applyHighlightColor(v);
    }));
```

- [ ] **Step 12.2: 残スタイル追記**

```css
/* styles.css 末尾に追加 */
.cb-md-read-chunk.is-paused {
  background-color: var(--cb-md-read-highlight-paused, rgba(255, 180, 80, 0.30));
  animation: cb-md-read-pulse 1.5s ease-in-out infinite;
}
@keyframes cb-md-read-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1.0; }
}
```

- [ ] **Step 12.3: 検証 + コミット**

```bash
npm run typecheck
npm run test
git add src/features/settings/SettingTab.ts styles.css
git commit -m "feat(F-028): add MD read highlight settings UI"
```

---

### Task 13: 色 → CSS 変数バインド

**Files:**
- Create: `src/features/tts/md-read-highlight/highlight-style.ts`

- [ ] **Step 13.1: 実装**

```typescript
// src/features/tts/md-read-highlight/highlight-style.ts
/**
 * 設定色 → CSS 変数の反映。
 * 空文字・無効値のときは何もしない（CSS のフォールバック色を尊重）。
 */
export function applyHighlightColor(color: string): void {
  const root = document.documentElement;
  if (color && /^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) {
    root.style.setProperty('--cb-md-read-highlight', hexToRgba(color, 0.35));
  } else {
    root.style.removeProperty('--cb-md-read-highlight');
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

- [ ] **Step 13.2: SettingTab の onChange で呼び出し**

```typescript
import { applyHighlightColor } from '../tts/md-read-highlight/highlight-style';
// onChange 内で:
applyHighlightColor(v);
```

- [ ] **Step 13.3: 検証 + コミット**

```bash
npm run typecheck
npm run test
git add src/features/tts/md-read-highlight/highlight-style.ts src/features/settings/SettingTab.ts
git commit -m "feat(F-028): bind highlight color setting to CSS variable"
```

---

## Phase E: リリース（ドキュメント + タグ付け + デプロイ）

### Task 14: CHANGELOG + manifest version bump（v0.30.2 → v0.31.0）

**Files:**
- Modify: `CHANGELOG.md`（v0.31.0 エントリ追加）
- Modify: `manifest.json`（version 0.30.2 → 0.31.0）

- [ ] **Step 14.1: CHANGELOG.md 追記**

```markdown
## v0.31.0 (2026-09-02)

### 新機能

- **MD 読み上げ位置ハイライト（F-028）**: MD ファイル右クリック「Add to TTS」で Preview 表示中のチャンク位置に背景色ハイライト
- **フローティングオーバーレイ**: 一時停止・次の見出しへスキップ・ミュート・N/M 進捗表示
- **設定タブ追加**: TTS セクションに「ハイライト ON/OFF」「ハイライト色」

### 内部変更

- 新規ディレクトリ: `src/features/tts/md-read-highlight/`（types / state / anchor / preview-renderer / floating-overlay / heading-skip / cleanup / highlight-style / index）
- 設定スキーマ拡張: `tts.mdReadHighlight: { enabled, highlightColor }`
- i18n 追加: `tts.mdReadHighlight.*` / `tts.mdReadOverlay.*`

### テスト

- +14 単体テスト（anchor 4 / state 4 / preview-renderer 4 / floating-overlay 3 / heading-skip 3 / speak-coordinator 2）
```

- [ ] **Step 14.2: manifest.json 更新**

`version: "0.30.2"` → `version: "0.31.0"`

- [ ] **Step 14.3: コミット**

```bash
git add CHANGELOG.md manifest.json
git commit -m "chore(release): bump version to 0.31.0"
```

---

### Task 15: ドキュメント同期（機能要件 / 機能詳細 / リリースノート / バージョン履歴 + F-番号採番）

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/01_要件定義/01_機能要件.md`（F-028 採番 + 説明）
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/02_ユーザーマニュアル/機能詳細.md`（「MD 読み上げハイライト」セクション）
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`（v0.31.0 エントリ）
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/バージョン履歴.md`（v0.31.0 行）

- [ ] **Step 15.1: 機能要件 F-028 追加**

| F028 | MD 読み上げ位置ハイライト | MD ファイル「Add to TTS」本文 | Preview 表示中のチャンク位置に背景色ハイライト + フローティングオーバーレイ（⏸▶⏭🔇N/M）+ 見出しスキップ |

- [ ] **Step 15.2: 機能詳細セクション追加**

```markdown
## 🔧 MD 読み上げハイライト（v0.31.0 / F-028）

MD ファイルを右クリック「Add to TTS」で読み上げ時、Preview 表示中のチャンク位置に背景色ハイライトが付きます。フローティングオーバーレイから一時停止・次の見出しスキップ・N/M 進捗確認が可能。

- 設定タブ TTS → 「MD 読み上げハイライト」セクション
- デフォルト ON / 色はカスタム可
- 対応モード: Preview のみ
```

- [ ] **Step 15.3: リリースノート更新**

```markdown
## v0.31.0 (2026-09-02)

### 🆕 新機能
- MD 読み上げ位置ハイライト（Preview 連動・フローティングオーバーレイ・見出しスキップ）

### 📖 使い方
1. MD ファイルを Preview 表示
2. 右クリック → 「Add to TTS」
3. 右上にフローティングオーバーレイ出現
4. ⏸ / ▶ / ⏭ / 🔇 で操作
```

- [ ] **Step 15.4: バージョン履歴更新**

```markdown
| v0.31.0 | 2026-09-02 | F-028 MD 読み上げ位置ハイライト | MiuMiu 🐾 |
```

- [ ] **Step 15.5: コミット（Vault 側）**

git は Vault 側の構造に依存しないので、Vault 側で `git add` + commit:
```bash
cd C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault
git add 80_POC_Projects/POC_017_ClaudianBridge/01_要件定義/01_機能要件.md
git add 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/02_ユーザーマニュアル/機能詳細.md
git add 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md
git add 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/バージョン履歴.md
git commit -m "docs(F-028): add F-028 to feature requirements and release notes"
```

---

### Task 16: ビルド + 3-tier 検証 + デプロイ + git tag v0.31.0

**Files:** なし（最終リリース処理）

- [ ] **Step 16.1: 3-tier 検証**

```bash
cd D:/AI-Agent/ClaudianBridge
npm run typecheck   # (a) Type ✅ 期待
npm run test        # (b) Test ✅ 期待（全 PASS）
npm run build       # (c) Build ✅ 期待
```

- [ ] **Step 16.2: デプロイ**

```bash
npm run deploy
```

期待: `.obsidian/plugins/ClaudianBridge/manifest.json` の version が `0.31.0`

- [ ] **Step 16.3: git tag 付与 + push**

```bash
cd D:/AI-Agent/ClaudianBridge
git tag v0.31.0 -m "release v0.31.0 (F-028)"
git push origin v0.31.0
cd C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault
git push origin main
```

- [ ] **Step 16.4: 完了報告**

MiuMiu 行動ルール §「タスク終了報告 v2.13」準拠で完了報告を実施:
- 📢 ヘッダー（推奨 1 案）
- 🔜 次のアクション提案（1-3 案）

---

## 🧾 完了条件チェックリスト

| # | 項目 | 必須 |
|:-:|------|:----:|
| 1 | Type Check PASS（0 errors） | ☐ |
| 2 | 全 vitest PASS（F-028 関連 14 件 + 既存全件） | ☐ |
| 3 | Build 成功（main ロールアップ） | ☐ |
| 4 | Plugin デプロイ（manifest.json version 0.31.0 確認） | ☐ |
| 5 | git tag v0.31.0 付与 | ☐ |
| 6 | CHANGELOG 更新 | ☐ |
| 7 | F-番号マスター（F-028）追記 | ☐ |
| 8 | 機能要件 / 機能詳細 / リリースノート / バージョン履歴 更新 | ☐ |
| 9 | `_sync_modified_to_mtime.py` 実行（Vault 側） | ☐ |
| 10 | 完了報告（v2.13 準拠） | ☐ |

---

## 📚 参照文献

| # | 種別 | 参照 |
|:-:|:----:|------|
| 1 | Vault MD | [[../../80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-02-md-read-position-highlight-design]] — 設計書 |
| 2 | Vault MD | [[../../80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-15-message-read-button-design]] — 設計パターン踏襲元 |
| 3 | Vault MD | [[../../80_POC_Projects/POC_017_ClaudianBridge/01_要件定義/01_機能要件]] — F-番号マスター（最大 F-027 → F-028 採番） |
| 4 | Vault MD | [[../MiuMiu行動ルール#✅ タスク終了報告ルール]] — 完了報告 v2.13 |
| 5 | Vault MD | [[../../00_Vault管理/方法論/POC開発メタプロセス]] — 本実装計画準拠のメタプロセス |
| 6 | ソース | `D:\AI-Agent\ClaudianBridge\src\features\tts\md-file-read.ts` — 既存 Add to TTS |
| 7 | ソース | `D:\AI-Agent\ClaudianBridge\src\features\tts\speak.ts` — speak core（chunk hook 追加対象） |
| 8 | Web | https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker |

---

## 📝 更新履歴

| 版 | 日付 | 変更 | 担当 |
| ---- | ---- | ---- | ---- |
| draft | 2026-09-02 | 初版（10_Input/Check 格納・承認待ち） | MiuMiu 🐾 |
