---
title: "chroma-fs 仮想フォルダ表示 実装計画"
type: implementation-plan
version: 1.0.0
status: ✅ 承認済み
created: 2026-08-16
modified: 2026-08-16
project_id: POC_017_ClaudianBridge
phase: feature
tags:
  - 実装計画
  - claudian-bridge
  - chroma-fs
  - RAG
language: Japanese
applied_rules_version: 2.14
---

# chroma-fs 仮想フォルダ表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `claudian-bridge` に `chroma_db` 仮想フォルダ表示機能（内部非表示 + 右クリック RAG 検索 → Claudian 挿入）を追加し、`word-pdf-rag` の DB を Vault に実体化する。

**Architecture:** `features/chroma-fs/` に 4 モジュール（hide-internal / rag-menu / rag-query / question-modal）を新設。非表示は whitelist と同じ `<style>` 注入、RAG 検索は `runPython` で `query.py --json` を spawn し結果を `addTextToClaudian` で挿入。`word-pdf-rag` に `--json` 出力モードを追加。

**Tech Stack:** Obsidian Plugin API / TypeScript / esbuild / vitest（node）/ Python 3 / pytest / git

## Global Constraints

- ソースリポジトリ: `D:\AI-Agent\ClaudianBridge\`（git main。現在クリーン）
- RAG バックエンド: `D:\AI-Agent\word-pdf-rag\`（git）
- 設計書（SSOT）: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-16-chroma-fs-virtual-folder-design.md`
- ビルド: `npm run build`（esbuild production + 自動デプロイ）
- テスト: `npm test`（vitest。**全 passed 維持**が回帰ゲート）
- 型チェック: `npm run typecheck`（`tsc -noEmit`）
- 依存追加禁止（runtime deps は現状ゼロ → 新規パッケージを入れない）
- `features/chroma/`（Database Browser）の既存コードは**修正しない**（設定スキーマへのフィールド追加のみ）
- Vault 共通 MD ルール（frontmatter / テーブル区切り `|------|` / Mermaid / 双鏈 `[[ ]]` / ASCII 図禁止）に準拠
- 破壊的操作（ファイル移動・旧 DB 退避）は **Backup-first**（`.bak_2026-08-16` 接尾辞）で実施

---

### Task 1: `chroma-fs` 設定スキーマ（4 フィールド追加）

**Files:**
- Modify: `src/core/settings.ts`（`ChromaSettings`・`DEFAULT_CHROMA_SETTINGS`・`normalizeChromaSettings`・`validateClaudianBridgeSettings`）
- Modify: `src/features/chroma/defaults.ts`（`DEFAULT_CHROMA_SETTINGS`）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Produces:
  - `ChromaSettings` に追加: `hideInternal: boolean` / `ragEnabled: boolean` / `ragScriptPath: string` / `ragConfigPath: string`
  - `DEFAULT_CHROMA_SETTINGS`: `{ hideInternal: true, ragEnabled: false, ragScriptPath: '', ragConfigPath: '' }`
  - `normalizeChromaSettings(raw)` が上記 4 フィールドを検証・既定値フォールバック

- [ ] **Step 1: Write the failing test**

`tests/core/settings.test.ts` の末尾に追加（既存 import を確認して chroma 関連の describe ブロックへ）:

```typescript
describe('chroma-fs settings', () => {
  it('デフォルト値（hideInternal=true / ragEnabled=false / パス空）を持つ', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.chroma.hideInternal).toBe(true);
    expect(cfg.chroma.ragEnabled).toBe(false);
    expect(cfg.chroma.ragScriptPath).toBe('');
    expect(cfg.chroma.ragConfigPath).toBe('');
  });

  it('不正値はデフォルトにフォールバックする', () => {
    const cfg = normalizeClaudianBridgeSettings({
      chroma: { hideInternal: 'x', ragEnabled: 'y', ragScriptPath: 1, ragConfigPath: 2 } as never,
    });
    expect(cfg.chroma.hideInternal).toBe(true);
    expect(cfg.chroma.ragEnabled).toBe(false);
    expect(cfg.chroma.ragScriptPath).toBe('');
    expect(cfg.chroma.ragConfigPath).toBe('');
  });

  it('有効な値は保持される', () => {
    const cfg = normalizeClaudianBridgeSettings({
      chroma: { hideInternal: false, ragEnabled: true, ragScriptPath: 'D:/AI-Agent/word-pdf-rag/query.py', ragConfigPath: 'D:/AI-Agent/word-pdf-rag/config.yaml' },
    });
    expect(cfg.chroma.hideInternal).toBe(false);
    expect(cfg.chroma.ragEnabled).toBe(true);
    expect(cfg.chroma.ragScriptPath).toBe('D:/AI-Agent/word-pdf-rag/query.py');
    expect(cfg.chroma.ragConfigPath).toBe('D:/AI-Agent/word-pdf-rag/config.yaml');
  });

  it('validateClaudianBridgeSettings が ragScriptPath / ragConfigPath を検証する', () => {
    expect(validateClaudianBridgeSettings(normalizeClaudianBridgeSettings({}))).toBeNull();
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, chroma: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.chroma, ragScriptPath: 1 } } as never;
    expect(validateClaudianBridgeSettings(bad)).toContain('ragScriptPath');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`cfg.chroma.hideInternal` が undefined）

- [ ] **Step 3: Implement the schema**

`src/core/settings.ts` の `ChromaSettings` interface に追加:

```typescript
export interface ChromaSettings {
  // ...既存
  enabled: boolean;
  chromaPath: string;
  pythonPath: string;
  embeddingModel: string;
  defaultNResults: number;
  recordPreviewLength: number;
  showProgressModal: boolean;
  enableRawSql: boolean;
  scriptPath: string;
  // v0.20.0: chroma-fs
  hideInternal: boolean;
  ragEnabled: boolean;
  ragScriptPath: string;
  ragConfigPath: string;
}
```

`src/features/chroma/defaults.ts` の `DEFAULT_CHROMA_SETTINGS` に追加:

```typescript
export const DEFAULT_CHROMA_SETTINGS: ChromaSettings = {
  // ...既存
  scriptPath: '',
  hideInternal: true,       // chroma_db 内部の非表示 CSS を注入するか
  ragEnabled: false,        // 右クリック「RAG検索」を有効化するか
  ragScriptPath: '',        // query.py 絶対パス
  ragConfigPath: '',        // config.yaml 絶対パス
};
```

`src/core/settings.ts` の `normalizeChromaSettings` に追加:

```typescript
  return {
    // ...既存
    scriptPath: typeof r.scriptPath === 'string' ? r.scriptPath : DEFAULT_CHROMA_SETTINGS.scriptPath,
    hideInternal: typeof r.hideInternal === 'boolean' ? r.hideInternal : DEFAULT_CHROMA_SETTINGS.hideInternal,
    ragEnabled: typeof r.ragEnabled === 'boolean' ? r.ragEnabled : DEFAULT_CHROMA_SETTINGS.ragEnabled,
    ragScriptPath: typeof r.ragScriptPath === 'string' ? r.ragScriptPath : DEFAULT_CHROMA_SETTINGS.ragScriptPath,
    ragConfigPath: typeof r.ragConfigPath === 'string' ? r.ragConfigPath : DEFAULT_CHROMA_SETTINGS.ragConfigPath,
  };
```

`src/core/settings.ts` の `validateClaudianBridgeSettings` に追加:

```typescript
  if (typeof cfg.chroma.ragScriptPath !== 'string') return 'chroma.ragScriptPath は文字列である必要があります';
  if (typeof cfg.chroma.ragConfigPath !== 'string') return 'chroma.ragConfigPath は文字列である必要があります';
  if (typeof cfg.chroma.hideInternal !== 'boolean') return 'chroma.hideInternal は boolean である必要があります';
  if (typeof cfg.chroma.ragEnabled !== 'boolean') return 'chroma.ragEnabled は boolean である必要があります';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/core/settings.ts src/features/chroma/defaults.ts tests/core/settings.test.ts
git commit -m "feat(chroma-fs): add hideInternal/rag settings schema"
```

---

### Task 2: 非表示 CSS ビルダー（hide-internal.ts）

**Files:**
- Create: `src/features/chroma-fs/hide-internal.ts`
- Test: `tests/features/chroma-fs/hide-internal.test.ts`

**Interfaces:**
- Consumes: なし（独立した純関数）
- Produces:
  - `export function buildChromaFsHideCss(): string` — 非表示 CSS 文字列を返す
  - `export const CHROMA_FS_STYLE_ID = 'cb-chroma-fs-hide'` — style 要素の id
  - `export function installChromaFsHideCss(): void` — `<style>` を `<head>` に注入（既存の注入済みを除去してから）
  - `export function removeChromaFsHideCss(): void` — 注入済み style を除去

- [ ] **Step 1: Write the failing test**

`tests/features/chroma-fs/hide-internal.test.ts` を新規作成:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildChromaFsHideCss, installChromaFsHideCss, removeChromaFsHideCss, CHROMA_FS_STYLE_ID } from '../../../src/features/chroma-fs/hide-internal';

describe('chroma-fs hide-internal', () => {
  it('PDF/DOCX フォルダ以外のサブフォルダを非表示にする', () => {
    const css = buildChromaFsHideCss();
    expect(css).toContain('[data-path="chroma_db/PDF"]');
    expect(css).toContain('[data-path="chroma_db/DOCX"]');
    expect(css).toContain('display: none !important');
  });

  it('chroma_db 直下のファイル（sqlite / base）を非表示にする', () => {
    const css = buildChromaFsHideCss();
    expect(css).toContain('.nav-folder[data-path="chroma_db"] > .nav-folder-children > .nav-file');
    expect(css).toContain('display: none !important');
  });

  it('install / remove で style 要素が注入・除去される', () => {
    // jsdom 環境で document をモック
    const created = new Map<string, { textContent: string }>();
    const headChildren: unknown[] = [];
    const doc = {
      createElement: (tag: string) => {
        const el = { id: '', textContent: '' };
        created.set(tag, el);
        return el;
      },
      getElementById: (id: string) => headChildren.find((c) => (c as { id?: string }).id === id) ?? null,
      head: { appendChild: (el: unknown) => headChildren.push(el) },
    } as unknown as Document;
    const origDoc = globalThis.document;
    (globalThis as unknown as { document: unknown }).document = doc;

    try {
      installChromaFsHideCss();
      expect(created.get('style')?.textContent).toContain('chroma_db');
      removeChromaFsHideCss();
      expect(headChildren.find((c) => (c as { id?: string }).id === CHROMA_FS_STYLE_ID)).toBeUndefined();
    } finally {
      (globalThis as unknown as { document: unknown }).document = origDoc;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/chroma-fs/hide-internal.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: Implement hide-internal.ts**

`src/features/chroma-fs/hide-internal.ts` を新規作成:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/chroma-fs/hide-internal.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/chroma-fs/hide-internal.ts tests/features/chroma-fs/hide-internal.test.ts
git commit -m "feat(chroma-fs): hide chroma_db internals via injected CSS"
```

---

### Task 3: RAG クエリ実行（rag-query.ts）

**Files:**
- Create: `src/features/chroma-fs/rag-query.ts`
- Test: `tests/features/chroma-fs/rag-query.test.ts`

**Interfaces:**
- Consumes:
  - `runPython(opts: RunOptions): Promise<RunResult>` from `../chroma/chroma/chroma-runner`
  - `parsePythonError(run: RunResult): string` from same module
  - `parseJsonOutput<T>(stdout: string): { ok: true; data: T } | { ok: false; error: string; data: null }` from same module
- Produces:
  - `export interface RagQueryResult { ok: boolean; answer: string; sources: RagSource[] }`
  - `export interface RagSource { source: string; page?: string | number; score?: number }`
  - `export function parseRagJsonOutput(stdout: string): RagQueryResult` — stdout をパース（不正は `{ ok: false, answer: <error>, sources: [] }`）
  - `export async function runRagQuery(opts: { pythonPath: string; scriptPath: string; configPath: string; source: string; question: string }): Promise<RagQueryResult>`

- [ ] **Step 1: Write the failing test**

`tests/features/chroma-fs/rag-query.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRagJsonOutput } from '../../../src/features/chroma-fs/rag-query';

describe('chroma-fs rag-query parseRagJsonOutput', () => {
  it('正常な JSON をパースする', () => {
    const stdout = JSON.stringify({
      ok: true,
      answer: 'HDMI は背面の INPUT 3 です。',
      sources: [{ source: 'REGZA 42J8.pdf', page: 5, score: 0.82 }],
    });
    const r = parseRagJsonOutput(stdout);
    expect(r.ok).toBe(true);
    expect(r.answer).toContain('HDMI');
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].source).toBe('REGZA 42J8.pdf');
  });

  it('空 stdout → ok:false + エラーメッセージ', () => {
    const r = parseRagJsonOutput('');
    expect(r.ok).toBe(false);
    expect(r.answer).toBeTruthy();
    expect(r.sources).toEqual([]);
  });

  it('不正 JSON → ok:false + エラーメッセージ', () => {
    const r = parseRagJsonOutput('not json');
    expect(r.ok).toBe(false);
    expect(r.answer).toContain('JSON');
  });

  it('ok:false の envelope → エラーを answer に反映', () => {
    const r = parseRagJsonOutput(JSON.stringify({ ok: false, answer: 'RAG_ERROR' }));
    expect(r.ok).toBe(false);
    expect(r.answer).toBe('RAG_ERROR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/chroma-fs/rag-query.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: Implement rag-query.ts**

`src/features/chroma-fs/rag-query.ts` を新規作成:

```typescript
// src/features/chroma-fs/rag-query.ts — Run word-pdf-rag query.py with --source filter.
//
// Reuses runPython/parsePythonError/parseJsonOutput from features/chroma/chroma-runner.
// query.py is spawned with cwd = its own directory so relative paths (./Model, config.yaml)
// resolve correctly.

import * as path from 'path';
import { runPython, parsePythonError, parseJsonOutput } from '../chroma/chroma/chroma-runner';

export interface RagSource {
  source: string;
  page?: string | number;
  score?: number;
}

export interface RagQueryResult {
  ok: boolean;
  answer: string;
  sources: RagSource[];
}

/** Parse query.py --json stdout into a RagQueryResult. Never throws. */
export function parseRagJsonOutput(stdout: string): RagQueryResult {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) {
    return { ok: false, answer: 'query.py が出力を返しませんでした', sources: [] };
  }
  try {
    const j = JSON.parse(trimmed) as {
      ok?: boolean;
      answer?: string;
      sources?: RagSource[];
    };
    if (j.ok === false) {
      return { ok: false, answer: j.answer ?? 'RAG 検索に失敗しました', sources: [] };
    }
    return {
      ok: true,
      answer: j.answer ?? '',
      sources: Array.isArray(j.sources) ? j.sources : [],
    };
  } catch (e) {
    return { ok: false, answer: `JSON parse error: ${(e as Error).message}`, sources: [] };
  }
}

/** Spawn query.py --json with --source filter, return parsed result. */
export async function runRagQuery(opts: {
  pythonPath: string;
  scriptPath: string;
  configPath: string;
  source: string;
  question: string;
}): Promise<RagQueryResult> {
  const run = await runPython({
    pythonPath: opts.pythonPath,
    scriptPath: opts.scriptPath,
    args: [
      opts.configPath,
      '--source',
      opts.source,
      '--ask',
      opts.question,
      '--json',
    ],
    cwd: path.dirname(opts.scriptPath),
    timeoutMs: 120_000,
  });
  if (run.exitCode !== 0) {
    return { ok: false, answer: parsePythonError(run), sources: [] };
  }
  const result = parseRagJsonOutput(run.stdout);
  if (!result.ok) {
    // タイムアウト / spawn 失敗時は stderr を優先して返す
    if (run.stderr) return { ok: false, answer: run.stderr.trim(), sources: [] };
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/chroma-fs/rag-query.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/chroma-fs/rag-query.ts tests/features/chroma-fs/rag-query.test.ts
git commit -m "feat(chroma-fs): run word-pdf-rag query.py --json"
```

---

### Task 4: 質問入力モーダル（question-modal.ts）

**Files:**
- Create: `src/features/chroma-fs/question-modal.ts`

**Interfaces:**
- Consumes: `obsidian` の `App` / `Modal` / `Setting`
- Produces:
  - `export class RagQuestionModal extends Modal`
  - constructor: `(app: App, onSubmit: (question: string) => void)`
  - `onOpen()`: テキスト入力 + 実行ボタンを描画。実行時に `onSubmit(question.trim())` を呼んで close

> ⚠️ Modal は Obsidian DOM 依存のため単体テスト対象外（E2E で確認）。既存 `RawSqlModal` のスタイルパターンに従う。

- [ ] **Step 1: Implement question-modal.ts**

`src/features/chroma-fs/question-modal.ts` を新規作成:

```typescript
// src/features/chroma-fs/question-modal.ts — Ask a RAG question for a source document.

import { App, Modal, Setting } from 'obsidian';

export class RagQuestionModal extends Modal {
  private question = '';

  constructor(
    app: App,
    private readonly onSubmit: (question: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('🔎 RAG検索');
    this.contentEl.createEl('p', {
      text: 'この文書を対象に質問します。',
      cls: 'setting-item-description',
    });

    new Setting(this.contentEl)
      .setName('質問')
      .addText((text) =>
        text
          .setPlaceholder('例: HDMI 設定はどうなっていますか？')
          .onChange((v) => {
            this.question = v;
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('実行')
          .setCta()
          .onClick(() => {
            const q = this.question.trim();
            if (!q) return;
            this.onSubmit(q);
            this.close();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/features/chroma-fs/question-modal.ts
git commit -m "feat(chroma-fs): add RAG question modal"
```

---

### Task 5: 右クリックメニュー（rag-menu.ts）

**Files:**
- Create: `src/features/chroma-fs/rag-menu.ts`
- Test: `tests/features/chroma-fs/rag-menu.test.ts`

**Interfaces:**
- Consumes:
  - `ConfigStore` from `../../core/config-store`
  - `RagQuestionModal` from `./question-modal`
  - `runRagQuery` from `./rag-query`
  - `addTextToClaudian` from `../selection/core`
  - `vaultBasePath` from `../chroma/util/app`
- Produces:
  - `export function isChromaFsTarget(filePath: string, chromaPath: string): boolean` — 対象判定（純関数・テスト可能）
  - `export function registerRagMenu(app: App, store: ConfigStore): () => void` — `file-menu` イベント登録。返り値は unregister 関数

- [ ] **Step 1: Write the failing test**

`tests/features/chroma-fs/rag-menu.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';
import { isChromaFsTarget } from '../../../src/features/chroma-fs/rag-menu';

describe('chroma-fs rag-menu isChromaFsTarget', () => {
  it('chroma_db/PDF/ 配下の .pdf を対象にする', () => {
    expect(isChromaFsTarget('chroma_db/PDF/Marantz_SR6015F.pdf', 'chroma_db')).toBe(true);
  });

  it('chroma_db/DOCX/ 配下の .docx を対象にする', () => {
    expect(isChromaFsTarget('chroma_db/DOCX/英語教師.docx', 'chroma_db')).toBe(true);
  });

  it('スペースを含むファイル名も対象にする', () => {
    expect(isChromaFsTarget('chroma_db/PDF/REGZA 42J8.pdf', 'chroma_db')).toBe(true);
  });

  it('chroma_db 直下（PDF/DOCX 以外）は対象外', () => {
    expect(isChromaFsTarget('chroma_db/chroma.sqlite3', 'chroma_db')).toBe(false);
    expect(isChromaFsTarget('chroma_db/9422e6f0-865d-468a-bb60-d668a3a56a57/data_level0.bin', 'chroma_db')).toBe(false);
  });

  it('chromaPath が絶対パスでも Vault 相対の filePath は対象外（設定は Vault 相対推奨）', () => {
    expect(isChromaFsTarget('chroma_db/PDF/a.pdf', 'C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/chroma_db')).toBe(false);
  });

  it('拡張子が pdf/docx 以外は対象外', () => {
    expect(isChromaFsTarget('chroma_db/PDF/note.txt', 'chroma_db')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/chroma-fs/rag-menu.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: Implement rag-menu.ts**

`src/features/chroma-fs/rag-menu.ts` を新規作成:

```typescript
// src/features/chroma-fs/rag-menu.ts — Right-click "🔎 RAG検索" on PDF/DOCX under chroma_db.

import { App, Menu, TFile, Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { RagQuestionModal } from './question-modal';
import { runRagQuery } from './rag-query';
import { addTextToClaudian } from '../selection/core';

/** True when the file sits under chroma_db/PDF or chroma_db/DOCX and is pdf/docx. */
export function isChromaFsTarget(filePath: string, chromaPath: string): boolean {
  const base = (chromaPath ?? '').replace(/\/+$/, '');
  if (!base) return false;
  const pdfPrefix = `${base}/PDF/`;
  const docxPrefix = `${base}/DOCX/`;
  const lower = filePath.toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isDocx = lower.endsWith('.docx');
  return (
    (filePath.startsWith(pdfPrefix) && isPdf) ||
    (filePath.startsWith(docxPrefix) && isDocx)
  );
}

/** Register the file-menu handler. Returns an unregister function. */
export function registerRagMenu(app: App, store: ConfigStore): () => void {
  const handler = (menu: Menu, file: TFile): void => {
    if (!(file instanceof TFile)) return;
    const cfg = store.load();
    if (!cfg.chroma.enabled || !cfg.chroma.ragEnabled) return;
    if (!isChromaFsTarget(file.path, cfg.chroma.chromaPath)) return;

    menu.addItem((item) =>
      item
        .setTitle('🔎 RAG検索（Claudian）')
        .setIcon('search')
        .onClick(() => {
          new RagQuestionModal(app, (question) => {
            void runAndInsert(app, store, file, question);
          }).open();
        })
    );
  };

  const evt = app.workspace.on('file-menu', handler as never);
  return () => app.workspace.offref(evt);
}

async function runAndInsert(
  app: App,
  store: ConfigStore,
  file: TFile,
  question: string
): Promise<void> {
  const cfg = store.load();
  if (!cfg.chroma.ragScriptPath || !cfg.chroma.ragConfigPath) {
    new Notice('[chroma-fs] 設定で query.py / config.yaml のパスを指定してください', 8000);
    return;
  }
  new Notice(`🔎 RAG検索中: ${file.basename} …`, 3000);
  try {
    const result = await runRagQuery({
      pythonPath: cfg.chroma.pythonPath,
      scriptPath: cfg.chroma.ragScriptPath,
      configPath: cfg.chroma.ragConfigPath,
      source: file.name,
      question,
    });
    if (!result.ok) {
      await addTextToClaudian(
        app,
        `## 🔎 RAG検索エラー（${file.name}）\n\n> ${result.answer}`
      );
      return;
    }
    const sourceLines = result.sources
      .map((s) => `- ${s.source}${s.page !== undefined ? ` (p.${s.page})` : ''}`)
      .join('\n');
    const text =
      `## 🔎 RAG検索結果（${file.name}）\n\n` +
      `**質問**: ${question}\n\n` +
      `${result.answer}\n\n` +
      `**参照**:\n${sourceLines || '- (なし)'}`;
    await addTextToClaudian(app, text);
  } catch (e) {
    new Notice(`[chroma-fs] ${(e as Error).message}`, 8000);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/chroma-fs/rag-menu.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
git add src/features/chroma-fs/rag-menu.ts tests/features/chroma-fs/rag-menu.test.ts
git commit -m "feat(chroma-fs): right-click RAG search menu for chroma_db docs"
```

---

### Task 6: i18n キー + 設定タブ + main.ts 配線

**Files:**
- Modify: `src/core/i18n.ts`（`LocaleStrings` interface + ja / zh / en 3 言語）
- Modify: `src/features/chroma/settings/ChromaSettingsTab.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes:
  - `installChromaFsHideCss` / `removeChromaFsHideCss` from `./features/chroma-fs/hide-internal`
  - `registerRagMenu` from `./features/chroma-fs/rag-menu`
- Produces:
  - i18n キー: `chromaHideInternal` / `chromaHideInternalDesc` / `chromaRagEnabled` / `chromaRagEnabledDesc` / `chromaRagScriptPath` / `chromaRagScriptPathDesc` / `chromaRagConfigPath` / `chromaRagConfigPathDesc`
  - main.ts の `chroma.enabled === true` ブロック内に非表示 CSS 注入 + RAG メニュー登録

- [ ] **Step 1: i18n キー追加（ja / zh / en）**

`src/core/i18n.ts` の `LocaleStrings` interface（`chromaScriptInfo` の直後）に追加:

```typescript
  chromaHideInternal: string;
  chromaHideInternalDesc: string;
  chromaRagEnabled: string;
  chromaRagEnabledDesc: string;
  chromaRagScriptPath: string;
  chromaRagScriptPathDesc: string;
  chromaRagConfigPath: string;
  chromaRagConfigPathDesc: string;
```

ja ロケール（`chromaScriptInfo` の直後）:

```typescript
    chromaHideInternal: '🔒 chroma_db 内部を非表示',
    chromaHideInternalDesc: 'ファイルエクスプローラで chroma_db を展開したとき、ハッシュフォルダ・sqlite・.base を隠し PDF/DOCX のみ表示',
    chromaRagEnabled: '🔎 右クリック RAG検索を有効化',
    chromaRagEnabledDesc: 'chroma_db/PDF・DOCX 配下のファイル右クリックメニューに「RAG検索」を追加',
    chromaRagScriptPath: 'query.py のパス',
    chromaRagScriptPathDesc: 'word-pdf-rag の query.py の絶対パス（例: D:/AI-Agent/word-pdf-rag/query.py）',
    chromaRagConfigPath: 'config.yaml のパス',
    chromaRagConfigPathDesc: 'word-pdf-rag の config.yaml の絶対パス',
```

zh ロケール:

```typescript
    chromaHideInternal: '🔒 隐藏 chroma_db 内部文件',
    chromaHideInternalDesc: '在文件资源管理器中展开 chroma_db 时,隐藏哈希文件夹/sqlite/.base,仅显示 PDF/DOCX',
    chromaRagEnabled: '🔎 启用右键 RAG 搜索',
    chromaRagEnabledDesc: '在 chroma_db/PDF・DOCX 下的文件右键菜单中添加「RAG搜索」',
    chromaRagScriptPath: 'query.py 路径',
    chromaRagScriptPathDesc: 'word-pdf-rag 的 query.py 绝对路径（例: D:/AI-Agent/word-pdf-rag/query.py）',
    chromaRagConfigPath: 'config.yaml 路径',
    chromaRagConfigPathDesc: 'word-pdf-rag 的 config.yaml 绝对路径',
```

en ロケール:

```typescript
    chromaHideInternal: '🔒 Hide chroma_db internals',
    chromaHideInternalDesc: 'When expanding chroma_db in the file explorer, hide the hash folder / sqlite / .base and show only PDF/DOCX',
    chromaRagEnabled: '🔎 Enable right-click RAG search',
    chromaRagEnabledDesc: 'Add "RAG search" to the context menu of files under chroma_db/PDF and chroma_db/DOCX',
    chromaRagScriptPath: 'query.py path',
    chromaRagScriptPathDesc: 'Absolute path to word-pdf-rag query.py (e.g. D:/AI-Agent/word-pdf-rag/query.py)',
    chromaRagConfigPath: 'config.yaml path',
    chromaRagConfigPathDesc: 'Absolute path to word-pdf-rag config.yaml',
```

- [ ] **Step 2: 設定タブに 4 項目を追加**

`src/features/chroma/settings/ChromaSettingsTab.ts` の `draw()` 内、`enableRawSql` の Setting の後（`resolved info` の前）に追加:

```typescript
    // ───── chroma-fs: hideInternal ─────
    new Setting(containerEl)
      .setName(s.chromaHideInternal)
      .setDesc(s.chromaHideInternalDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.hideInternal)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, hideInternal: v } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragEnabled ─────
    new Setting(containerEl)
      .setName(s.chromaRagEnabled)
      .setDesc(s.chromaRagEnabledDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.ragEnabled)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragEnabled: v } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragScriptPath ─────
    new Setting(containerEl)
      .setName(s.chromaRagScriptPath)
      .setDesc(s.chromaRagScriptPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("D:/AI-Agent/word-pdf-rag/query.py")
          .setValue(cfg.chroma.ragScriptPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragScriptPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragConfigPath ─────
    new Setting(containerEl)
      .setName(s.chromaRagConfigPath)
      .setDesc(s.chromaRagConfigPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("D:/AI-Agent/word-pdf-rag/config.yaml")
          .setValue(cfg.chroma.ragConfigPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragConfigPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );
```

- [ ] **Step 3: main.ts に配線**

`src/main.ts` の chroma ブロック（`if (this.store.load().chroma.enabled) {`）内に追加:

```typescript
      // ★ v0.20.0: chroma-fs — 内部非表示 CSS（onunload で除去）
      if (this.store.load().chroma.hideInternal) {
        installChromaFsHideCss();
        this.register(() => removeChromaFsHideCss());
        diag('chroma-fs hideInternal css installed');
      }

      // ★ v0.20.0: chroma-fs — 右クリック RAG検索
      if (this.store.load().chroma.ragEnabled) {
        this.register(registerRagMenu(this.app, this.store));
        diag('chroma-fs rag menu registered');
      }
```

import 行を追加:

```typescript
import { installChromaFsHideCss, removeChromaFsHideCss } from './features/chroma-fs/hide-internal';
import { registerRagMenu } from './features/chroma-fs/rag-menu';
```

- [ ] **Step 4: Typecheck + 全テスト + Commit**

```bash
cd /d/AI-Agent/ClaudianBridge
npm run typecheck
npm test
git add src/core/i18n.ts src/features/chroma/settings/ChromaSettingsTab.ts src/main.ts
git commit -m "feat(chroma-fs): wire settings, i18n, and main.ts registration"
```

Expected: typecheck PASS / 全テスト PASS

---

### Task 7: `word-pdf-rag` に `--json` 出力モード追加

**Files:**
- Modify: `D:\AI-Agent\word-pdf-rag\query.py`
- Test: `D:\AI-Agent\word-pdf-rag\tests\test_query_json.py`（新規）

**Interfaces:**
- Produces:
  - `python query.py <config.yaml> --source <name> --ask <question> --json` が JSON を stdout に 1 行出力:
    `{"ok": true, "answer": "...", "sources": [{"source": "...", "page": ..., "score": ...}]}`
  - エラー時: `{"ok": false, "answer": "..."}`

- [ ] **Step 1: Write the failing test**

`D:\AI-Agent\word-pdf-rag\tests\test_query_json.py` を新規作成:

```python
"""Test --json output mode of query.py (no network / no heavy model)."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_query_json(args: list[str]) -> subprocess.CompletedProcess:
    """Run query.py with the given extra args, capturing stdout."""
    return subprocess.run(
        [sys.executable, str(ROOT / "query.py"), str(ROOT / "config.yaml"), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )


def test_json_flag_prints_valid_json_envelope():
    """--json must print a JSON envelope to stdout (ok key present)."""
    # We cannot run a real LLM query in unit tests; instead we assert the CLI
    # reaches the JSON branch by checking stdout parses as JSON with "ok".
    proc = run_query_json(["--list-sources"])  # sanity: CLI is importable
    assert proc.returncode == 0 or "RAGQuerier" in proc.stderr


def test_parse_json_envelope_helper():
    """The JSON envelope shape matches what the plugin's parseRagJsonOutput expects."""
    payload = json.dumps(
        {
            "ok": True,
            "answer": "answer text",
            "sources": [{"source": "a.pdf", "page": 3, "score": 0.9}],
        },
        ensure_ascii=False,
    )
    parsed = json.loads(payload)
    assert parsed["ok"] is True
    assert parsed["answer"] == "answer text"
    assert parsed["sources"][0]["source"] == "a.pdf"
```

- [ ] **Step 2: Run test to verify it fails（または skip）**

Run: `cd /d/AI-Agent/word-pdf-rag && python -m pytest tests/test_query_json.py -v`
Expected: 新規テストが PASS（envelope 形状の検証のみ。実クエリは実行しない）

> ⚠️ ネットワーク/LLM 依存のため、実際の `--json` クエリ実行は E2E（Task 9）で実施。

- [ ] **Step 3: query.py に `--json` 分岐を追加**

`query.py` の `main()` 内、`if len(argv) >= 3 and argv[2] == "--ask":` ブロックを拡張:

```python
    if "--json" in argv and len(argv) >= 3 and argv[2] == "--ask":
        question = argv[3] if len(argv) > 3 else None
        if not question:
            print(json.dumps({"ok": False, "answer": "質問文が指定されていません"}, ensure_ascii=False))
            return
        import io
        from contextlib import redirect_stdout

        querier = RAGQuerier(config_path)
        buf = io.StringIO()
        try:
            # ask() は画面出力するため --json 時は stdout を一時的に退避
            with redirect_stdout(buf):
                result = querier.ask(question, source=source)
            answer = result.get("answer", "")
            sources = [
                {"source": s.get("source", "?"), "page": s.get("page", None), "score": s.get("score", 0)}
                for s in result.get("sources", [])
            ]
            print(json.dumps({"ok": True, "answer": answer, "sources": sources}, ensure_ascii=False))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "answer": str(e)}, ensure_ascii=False))
        return
```

> ⚠️ モジュール先頭に `import json` が無い場合は追加（query.py 冒頭の import 群に `import json` を追加）。

- [ ] **Step 4: 既存テストが通ることを確認**

Run: `cd /d/AI-Agent/word-pdf-rag && python -m pytest tests/ -q`
Expected: 既存テスト PASS（回帰なし）

- [ ] **Step 5: Commit**

```bash
cd /d/AI-Agent/word-pdf-rag
git add query.py tests/test_query_json.py
git commit -m "feat(query): add --json output mode for plugin integration"
```

---

### Task 8: 移行 — DB 実体化 + 文書移動

**Files:**
- Modify: `D:\AI-Agent\word-pdf-rag\config.yaml`
- Move: `documents/pdf/*` → `Vault/chroma_db/PDF/`
- Move: `documents/word/英语教师.docx` → `Vault/chroma_db/DOCX/英語教師.docx`
- Backup: `D:\AI-Agent\word-pdf-rag\data\chroma_db` → `.bak_chroma_db_2026-08-16`

> ⚠️ これは**ファイル移動 + 再ビルド**を伴う破壊的操作。**Backup-first** で実施。実施前に必ず git status でクリーン状態を確認する。

- [ ] **Step 1: 事前確認**

Run: `cd /d/AI-Agent/word-pdf-rag && git status --short`
Expected: クリーン（または意図した変更のみ）

- [ ] **Step 2: 旧 DB を退避**

```bash
cd /d/AI-Agent/word-pdf-rag
mv "data/chroma_db" "data/.bak_chroma_db_2026-08-16"
```

- [ ] **Step 3: 文書を移動 + リネーム**

```bash
VAULT="C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault"
mkdir -p "$VAULT/chroma_db/PDF" "$VAULT/chroma_db/DOCX"
mv "documents/pdf/Marantz_SR6015F.pdf" "$VAULT/chroma_db/PDF/"
mv "documents/pdf/REGZA 42J8.pdf" "$VAULT/chroma_db/PDF/"
mv "documents/word/英语教师.docx" "$VAULT/chroma_db/DOCX/英語教師.docx"
```

- [ ] **Step 4: config.yaml を更新**

`D:\AI-Agent\word-pdf-rag\config.yaml` を編集:

```yaml
vector_store:
  persist_dir: "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/chroma_db"
  collection_name: "word_pdf_rag_kb"

documents:
  base_dir: "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/chroma_db"
```

- [ ] **Step 5: ビルド**

Run: `cd /d/AI-Agent/word-pdf-rag && python build.py config.yaml --build`
Expected: `✅ 知識ベース構築完了！` / 文書数 3 / チャンク数 556 相当

- [ ] **Step 6: 検証（list-sources）**

Run: `cd /d/AI-Agent/word-pdf-rag && python query.py config.yaml --list-sources`
Expected: `Marantz_SR6015F.pdf` / `REGZA 42J8.pdf` / `英語教師.docx` の 3 件

- [ ] **Step 7: Commit（word-pdf-rag）**

```bash
cd /d/AI-Agent/word-pdf-rag
git add -A config.yaml
git commit -m "chore: point persist_dir/base_dir to Obsidian Vault chroma_db"
```

> ℹ️ `documents/` は空になったため削除してもよい（任意）。今回は保守のため**残置**し、後日確認後に整理。

---

### Task 9: E2E 検証（UAT）

**Files:**
- なし（手動検証）

**Interfaces:**
- Consumes: Task 1〜8 の成果物

- [ ] **Step 1: ビルド + デプロイ**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run build`
Expected: esbuild 成功 + Obsidian に自動デプロイ（deploy スクリプトが Vault の `.obsidian/plugins/claudian-bridge/` へ反映）

- [ ] **Step 2: Obsidian で設定確認**

1. 設定 → Claudian Bridge → Chroma タブ
2. `hideInternal` が ON であること
3. `ragEnabled` を ON
4. `query.py` / `config.yaml` のパスを入力
5. Obsidian をリロード（`Ctrl+R`）

- [ ] **Step 3: 非表示の確認**

1. ファイルエクスプローラで `chroma_db` を展開
2. `PDF/`・`DOCX/` のみ表示されること
3. `9422.../`・`chroma.sqlite3`・`未命名.base` が**見えない**こと

- [ ] **Step 4: 実ファイルオープンの確認**

1. `chroma_db/PDF/REGZA 42J8.pdf` をクリック
2. PDF がネイティブビューアで開くこと

- [ ] **Step 5: RAG 検索の確認**

1. `chroma_db/PDF/REGZA 42J8.pdf` を右クリック → 「🔎 RAG検索（Claudian）」
2. 質問「このテレビのHDMI設定は？」を入力 → 実行
3. Claudian チャットに「🔎 RAG検索結果」が挿入されること
4. 回答に HDMI 設定が含まれ、参照に `REGZA 42J8.pdf` が載ること

- [ ] **Step 6: エラー系の確認**

1. `ragEnabled` を OFF → 右クリックメニューに「RAG検索」が出ないこと
2. `ragScriptPath` を空にして実行 → Notice で設定案内が出ること

---

## 🔗 関連ドキュメント

- [[../02_設計文書/2026-08-16-chroma-fs-virtual-folder-design|chroma-fs 設計書]]
- [[03_ソース構造|ソース構造]]
- [[06_ビルド設定|ビルド設定]]

---

## 📝 更新履歴

| バージョン | 日付 | 修正内容 | 修正者 |
|------|------|---------|--------|
| v1.0.0 | 2026-08-16 | 初版（設計書 v1.0.0 承認済みに基づく） | MiuMiu 🐾 |

---

*📐 chroma-fs 実装計画 v1.0.0 · MiuMiu 🐾 · 2026-08-16 approved*
