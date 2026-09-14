# Mermaid チャット内自動描画 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian チャット内で閉じた mermaid コードブロックを Obsidian 標準レンダラで自動的に図へ置換し、切替ボタン・エラーフォールバック・ログ記録・設定トグルを提供する。

**Architecture:** code-copy-fence と同一パターンの DOM post-process feature（`src/features/mermaid-render/`）。MutationObserver で `.claudian-code-wrapper` を監視し、閉じた mermaid ブロックを `MarkdownRenderer.render()` で描画・置換する。エラー時は元コードへフォールバックし `debug.mermaid.log` に記録。

**Tech Stack:** TypeScript, Obsidian API (`MarkdownRenderer.render`), vitest + jsdom, esbuild（既存ビルド）

**Spec:** `docs/superpowers/specs/2026-09-04-mermaid-render-design.md`

## Global Constraints

- 設定キーは `general.mermaidRender`（boolean・既定 `true`）
- ログファイルはプラグイン dir 直下の `debug.mermaid.log`（追記式・書けない環境では静かに無効化）
- mermaid npm パッケージを同梱しない（Obsidian 内蔵エンジンのみ使用）
- i18n は ja / zh / en の 3 ロケールすべてに追加
- 既存スタイルに倣う： 日本語 JSDoc コメント・設定トグルは codeCopyFence（v0.9.0）と同一形式
- テストは `npm test`（vitest・jsdom）で全件 PASS を維持、TDD で実装
- 処理済み wrapper は再描画しない（`WeakSet` 管理）

---

### Task 1: 設定キー `general.mermaidRender` 追加

**Files:**
- Modify: `src/core/settings.ts`（`GeneralSettings` 型・DEFAULT・migrate・validate）
- Modify: `src/core/i18n.ts`（ja/zh/en）
- Test: `tests/core/settings.test.ts`（既存テストファイルに追記）

**Interfaces:**
- Consumes: なし
- Produces: `GeneralSettings.mermaidRender: boolean`（既定 `true`）。Task 2〜5 が `store.load().general.mermaidRender` で参照

- [ ] **Step 1: 失敗テストを書く**

`tests/core/settings.test.ts` に追記：

```typescript
describe('general.mermaidRender', () => {
  it('デフォルトは true', () => {
    const cfg = createDefaultSettings(); // 既存のデフォルト生成ヘルパがあればそれを使う。なければ DEFAULT_SETTINGS を import
    expect(cfg.general.mermaidRender).toBe(true);
  });

  it('保存済み設定の boolean を尊重し、異常値は true にフォールバック', () => {
    expect(migrateSettings({ general: { mermaidRender: false } }).general.mermaidRender).toBe(false);
    expect(migrateSettings({ general: { mermaidRender: 'yes' } }).general.mermaidRender).toBe(true);
  });
});
```

※ 既存テストファイルの import 名・ヘルパ（`createDefaultSettings` / `migrateSettings` 等）は実装時にファイル内の実際の名前に置き換えること。codeCopyFence の既存テストを検索し（`grep -n "codeCopyFence" tests/core/settings.test.ts`）、その記述パターンをそのまま踏襲する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`mermaidRender` が存在しない）

- [ ] **Step 3: 最小実装**

`src/core/settings.ts`：

1. `GeneralSettings` 型（482 行目付近の `codeCopyFence: boolean;` の次）に追加：
```typescript
    /** v0.33.0: チャット内 mermaid 自動描画 */
    mermaidRender: boolean;
```
2. DEFAULT（554 行目付近、`codeCopyFence: true,` の次）に追加：
```typescript
mermaidRender: true,
```
3. migrate（641 行目付近、`codeCopyFence` の次）に追加：
```typescript
mermaidRender: typeof r.general?.mermaidRender === 'boolean' ? r.general.mermaidRender : true,
```
4. validate（945 行目付近の次）に追加：
```typescript
if (typeof cfg.general.mermaidRender !== 'boolean') return 'general.mermaidRender は boolean である必要があります';
```

`src/core/i18n.ts` — `generalCodeCopyFence` の直後に 3 ロケール分追加：

```typescript
// ja (368 行目付近)
generalMermaidRender: '📊 Mermaid 自動描画',
generalMermaidRenderDesc: 'Claudian チャット内の mermaid コードブロックを自動的に図として描画します',
// zh
generalMermaidRender: '📊 Mermaid 自动渲染',
generalMermaidRenderDesc: '自动将 Claudian 聊天中的 mermaid 代码块渲染为图形',
// en (704 行目付近)
generalMermaidRender: '📊 Auto-render Mermaid',
generalMermaidRenderDesc: 'Automatically render mermaid code blocks in the Claudian chat as diagrams',
```

`LocaleStrings` 型（18-19 行目付近の `generalCodeCopyFenceDesc` の次）にも追加：
```typescript
  generalMermaidRender: string;
  generalMermaidRenderDesc: string;
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/settings.ts src/core/i18n.ts tests/core/settings.test.ts
git commit -m "feat(mermaid-render): general.mermaidRender 設定キー追加"
```

---

### Task 2: 設定画面トグル追加

**Files:**
- Modify: `src/settings/SettingTabGeneral.ts:80`（codeCopyFence トグルの次）

**Interfaces:**
- Consumes: Task 1 の `general.mermaidRender`・`generalMermaidRender(Desc)`
- Produces: なし（UI のみ）

- [ ] **Step 1: codeCopyFence トグル（66-78 行目）を複製して直後に挿入**

```typescript
    // v0.33.0: チャット内 mermaid 自動描画
    new Setting(containerEl)
      .setName(s.generalMermaidRender)
      .setDesc(s.generalMermaidRenderDesc)
      .addToggle((t) => t.setValue(cfg.general.mermaidRender).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, mermaidRender: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));
```

- [ ] **Step 2: ビルド確認**

Run: `npm run typecheck && npm run build`
Expected: PASS（deploy まで実行される設定なら deploy も含む）

- [ ] **Step 3: コミット**

```bash
git add src/settings/SettingTabGeneral.ts
git commit -m "feat(mermaid-render): 設定画面に Mermaid 自動描画トグル追加"
```

---

### Task 3: ロガー `logger.ts`

**Files:**
- Create: `src/features/mermaid-render/logger.ts`
- Test: `tests/features/mermaid-render/logger.test.ts`

**Interfaces:**
- Consumes: なし（Node fs/path を直接使用・`src/core/diag.ts` パターン）
- Produces: `initMermaidLog(pluginDir: string): void`、`mermaidLog(...args: unknown[]): void`

- [ ] **Step 1: 失敗テストを書く**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initMermaidLog, mermaidLog } from '../../../src/features/mermaid-render/logger';

describe('mermaidLog', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mermaid-')); });

  it('init 後は追記される', () => {
    initMermaidLog(dir);
    mermaidLog('render error', { code: 'graph X' });
    const content = fs.readFileSync(path.join(dir, 'debug.mermaid.log'), 'utf-8');
    expect(content).toContain('render error');
    expect(content).toContain('graph X');
  });

  it('書き込めないディレクトリでも例外を出さない', () => {
    initMermaidLog(path.join(dir, 'no-such-dir'));
    expect(() => mermaidLog('boom')).not.toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/mermaid-render/logger.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 最小実装**

```typescript
/**
 * v0.33.0: Mermaid 描画エラーログ（debug.mermaid.log）
 * src/core/diag.ts と同型の追記式ログ。書き込めない環境では静かに無効化。
 */
import * as fs from 'fs';
import * as path from 'path';

let logPath: string | null = null;

export function initMermaidLog(pluginDir: string): void {
  try {
    logPath = path.join(pluginDir, 'debug.mermaid.log');
    fs.appendFileSync(logPath, `=== mermaid-render log ${new Date().toISOString()} ===\n`, 'utf-8');
  } catch {
    logPath = null; // 書けない環境では静かに無効
  }
}

export function mermaidLog(...args: unknown[]): void {
  try {
    const prefix = '[claudian-bridge-mermaid]';
    if (args.some((a) => a instanceof Error)) console.error(prefix, ...args);
    else console.log(prefix, ...args);
  } catch { /* 無視 */ }

  if (!logPath) return;
  try {
    const ts = new Date().toISOString();
    const parts = args.map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `Error: ${a.message}\n  ${(a.stack ?? '').split('\n').slice(0, 6).join('\n  ')}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    });
    fs.appendFileSync(logPath, `[${ts}] ${parts.join(' ')}\n`, 'utf-8');
  } catch { /* 記録失敗は無視 */ }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/mermaid-render/logger.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/mermaid-render/logger.ts tests/features/mermaid-render/logger.test.ts
git commit -m "feat(mermaid-render): debug.mermaid.log ロガー追加"
```

---

### Task 4: 描画コア `index.ts`（検知・描画・置換・トグル・フォールバック）

**Files:**
- Create: `src/features/mermaid-render/index.ts`
- Test: `tests/features/mermaid-render/index.test.ts`

**Interfaces:**
- Consumes: `ConfigStore`（`store.load().general.mermaidRender`）、Task 3 の `mermaidLog`、Obsidian `MarkdownRenderer.render`
- Produces: `setupMermaidRender(app: App, plugin: Plugin, store: ConfigStore, log?: (...a: unknown[]) => void): () => void`

**設計メモ（実装者向け）:**
- 描画テストでは `MarkdownRenderer.render` を mock する（`vi.mock('obsidian', ...)`）。モックは ```` ```mermaid ```` フェンスを受け取り `<div class="mermaid-render-ok">svg</div>` を返す正常系と、`<div class="mod-empty">error</div>` を返す異常系を用意する
- 結果検査： 描画コンテナ内に `.error` / `.mod-empty` / 空要素があれば失敗扱い
- 閉じ判定： 同一 wrapper の `code.textContent` が 1.2 秒後に同一なら確定（1 回のチェックで十分。ストリーム中は毎ミューテーションで再チェックし、確定時のみ render する）

- [ ] **Step 1: 失敗テストを書く**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const renderMock = vi.fn();
vi.mock('obsidian', () => ({
  MarkdownRenderer: { render: (...args: unknown[]) => renderMock(...args) },
  Notice: class {},
}));

import { setupMermaidRender } from '../../../src/features/mermaid-render';

function makeStore(on: boolean) {
  return { load: () => ({ general: { mermaidRender: on } }),
  } as unknown as import('../../../src/core/config-store').ConfigStore;
}

function buildWrapper(codeText = 'graph LR\n  A --> B', lang = 'mermaid') {
  const wrapper = document.createElement('div');
  wrapper.className = 'claudian-code-wrapper has-language';
  const label = document.createElement('span');
  label.className = 'claudian-code-lang-label';
  label.textContent = lang;
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = codeText;
  pre.appendChild(code);
  wrapper.appendChild(label);
  wrapper.appendChild(pre);
  document.body.appendChild(wrapper);
  return { wrapper, code };
}

const okRender = async (_app: unknown, md: string, el: HTMLElement) => {
  expect(md).toContain('```mermaid');
  el.createDiv?.('mermaid-render-ok');
};
const failRender = async (_app: unknown, _md: string, el: HTMLElement) => {
  const d = document.createElement('div');
  d.className = 'mod-empty';
  el.appendChild(d);
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('setupMermaidRender', () => {
  it('ON: 確定した mermaid ブロックを描画して置換する', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { wrapper } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    expect(wrapper.querySelector('.mermaid-render-ok')).not.toBeNull();
    cleanup();
  });

  it('未確定ブロック（1.2 秒内に変化）は描画しない', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { wrapper, code } = buildWrapper();
    await vi.advanceTimersByTimeAsync(600);
    code.textContent += '\n  B --> C'; // ストリーミング中の追記
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock).toHaveBeenCalled(); // 最終確定後に 1 回は呼ばれる
    expect(wrapper.querySelector('.mermaid-render-ok')).not.toBeNull();
    cleanup();
  });

  it('mermaid 以外の言語は描画しない', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { wrapper } = buildWrapper('print("hi")', 'python');
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock).not.toHaveBeenCalled();
    expect(wrapper.querySelector('code')).not.toBeNull();
    cleanup();
  });

  it('OFF は素通し', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(false));
    const { wrapper } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('描画失敗時はコードブロックへフォールバック＋バッジ＋ログ', async () => {
    const log = vi.fn();
    renderMock.mockImplementation(failRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true), log);
    const { wrapper, code } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    expect(wrapper.querySelector('code')).not.toBeNull(); // 元コードが残る
    expect(wrapper.querySelector('.cb-mermaid-fail-badge')).not.toBeNull();
    expect(log).toHaveBeenCalled();
    expect(code.style.display).not.toBe('none');
    cleanup();
  });

  it('切替ボタンで図 ⇔ コードを往復できる', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { wrapper } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    const toggle = wrapper.querySelector('.cb-mermaid-toggle') as HTMLElement;
    expect(toggle).not.toBeNull();
    // 図 → コード
    toggle.click();
    expect(wrapper.querySelector('code').style.display).not.toBe('none');
    expect(wrapper.querySelector('.mermaid-render-ok').style.display).toBe('none');
    // コード → 図
    toggle.click();
    expect(wrapper.querySelector('.mermaid-render-ok').style.display).not.toBe('none');
    cleanup();
  });

  it('同じ wrapper は二度と処理しない', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { wrapper, code } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    const calls = renderMock.mock.calls.length;
    code.textContent = 'graph TB\n  X --> Y'; // 内容変更しても再描画しない
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock.mock.calls.length).toBe(calls);
    cleanup();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/mermaid-render/index.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 最小実装**

```typescript
import type { App, Plugin } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { mermaidLog } from './logger';

/** 確定判定の待機時間（ms）。この間に textContent が変わらなければ閉じたとみなす */
const SETTLE_MS = 1200;

const isMermaid = (lang: string): boolean => lang === 'mermaid' || lang === 'mmd';

export function setupMermaidRender(
  app: App,
  plugin: Plugin,
  store: ConfigStore,
  log: (...args: unknown[]) => void = mermaidLog,
): () => void {
  const processed = new WeakSet<Element>();
  const observer = new MutationObserver(() => scan());

  /** wrapper 内の mermaid ブロックを検知して確定を待つ */
  const scan = (): void => {
    if (!store.load().general.mermaidRender) return;
    for (const wrapper of document.querySelectorAll('.claudian-code-wrapper')) {
      if (processed.has(wrapper)) continue;
      const code = wrapper.querySelector('pre code') ?? wrapper.querySelector('code');
      const label = wrapper.querySelector('.claudian-code-lang-label');
      if (!code || !label) continue;
      const lang = (label.textContent ?? '').trim().toLowerCase();
      if (!isMermaid(lang)) continue;

      const text = code.textContent ?? '';
      processed.add(wrapper); // 二重スキャン防止（失敗時も再処理しない）
      window.setTimeout(() => {
        if ((code.textContent ?? '') === text) void renderBlock(app, wrapper, code, log);
        else processed.delete(wrapper); // 未確定 → 再スキャン対象に戻す
      }, SETTLE_MS);
    }
  };

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
  return () => observer.disconnect();
}

/** ブロック 1 個を描画して置換。失敗時は元コードのまま＋バッジ＋ログ */
async function renderBlock(
  app: App,
  wrapper: Element,
  code: Element,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const source = code.textContent ?? '';
  const holder = document.createElement('div');
  holder.className = 'cb-mermaid-holder';
  try {
    await MarkdownRenderer.render(app, '```mermaid\n' + source + '\n```', holder, '', plugin as Plugin);
  } catch (e) {
    return fail(wrapper, code, e as Error, log);
  }

  // 結果検査: エラー要素・空描画は失敗扱い
  const bad = holder.querySelector('.error, .mod-empty') ?? holder.textContent?.trim() === '' ? holder.querySelector('.error, .mod-empty') : null;
  if (bad || (holder.textContent ?? '').trim() === '') {
    return fail(wrapper, code, new Error('mermaid render produced empty/error output'), log);
  }

  // 図の上にトグルボタンを置き、元コードを隠す
  const toggle = document.createElement('button');
  toggle.className = 'cb-mermaid-toggle';
  toggle.textContent = '</>';
  toggle.title = 'Toggle diagram / code';
  let showing = true;
  toggle.addEventListener('click', () => {
    showing = !showing;
    (code.parentElement as HTMLElement).style.display = showing ? 'none' : '';
    holder.style.display = showing ? '' : 'none';
  });

  wrapper.insertBefore(toggle, wrapper.firstChild);
  (code.parentElement as HTMLElement).style.display = 'none';
  wrapper.appendChild(holder);
}

/** フォールバック: 元コードを表示状態に戻し、失敗バッジとログを残す */
function fail(
  wrapper: Element,
  code: Element,
  err: Error,
  log: (...args: unknown[]) => void,
): void {
  log('mermaid render failed', err.message, { code: (code.textContent ?? '').slice(0, 200) });
  const badge = document.createElement('span');
  badge.className = 'cb-mermaid-fail-badge';
  badge.textContent = '⚠ 描画失敗';
  wrapper.appendChild(badge);
}
```

※ `MarkdownRenderer.render` のシグネチャは `(app, markdown, el, sourcePath, component)`。実装時に Obsidian 型定義（`obsidian.d.ts`）と突き合わせ、ビルドエラーがあれば修正すること。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/mermaid-render/index.test.ts`
Expected: PASS（7 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/mermaid-render/index.ts tests/features/mermaid-render/index.test.ts
git commit -m "feat(mermaid-render): チャット内 mermaid 自動描画コア実装"
```

---

### Task 5: main.ts への組み込み＋プラグイン CSS

**Files:**
- Modify: `src/main.ts:264` 付近（code-copy-fence 登録の次）
- Modify: `styles.css`（既存なら追記・なければ Create）

**Interfaces:**
- Consumes: Task 3 の `initMermaidLog`、Task 4 の `setupMermaidRender`
- Produces: なし

- [ ] **Step 1: main.ts に登録**

import 追加：
```typescript
import { setupMermaidRender } from './features/mermaid-render';
import { initMermaidLog } from './features/mermaid-render/logger';
```

`this.register(setupCodeCopyFence(this.store));` の直後に追加（`getPluginDir` の結果がこの時点で取れる位置に調整）：
```typescript
      // v0.33.0: チャット内 mermaid 自動描画（設定 OFF 時は無効）
      const pluginDir = getPluginDir(this.app, this.manifest);
      if (pluginDir) initMermaidLog(pluginDir);
      this.register(setupMermaidRender(this.app, this, this.store));
      diag('mermaid-render registered');
```

- [ ] **Step 2: styles.css に最小スタイル追加**

```css
/* v0.33.0: mermaid-render */
.cb-mermaid-toggle { position: relative; float: right; margin: 2px; cursor: pointer; opacity: 0.6; }
.cb-mermaid-toggle:hover { opacity: 1; }
.cb-mermaid-holder { overflow-x: auto; }
.cb-mermaid-fail-badge { font-size: 0.8em; opacity: 0.7; }
```

- [ ] **Step 3: 全テスト＋ビルド＋デプロイ**

Run: `npm test && npm run build`
Expected: 全件 PASS・ビルド成功（`npm run build` に deploy が統合されている場合は Vault デプロイまで実施）

- [ ] **Step 4: コミット**

```bash
git add src/main.ts styles.css
git commit -m "feat(mermaid-render): main.ts 組み込み＋トグル/バッジ CSS"
```

---

### Task 6: ドキュメント更新＋バージョン付与

**Files:**
- Modify: `package.json` / `src/manifest.json`（バージョン bump: 現行 hotfix ブランチの次のパッチ or マイナー）
- Modify: `docs/superpowers/` 配下の F-番号マスター・CHANGELOG（v0.27.1 規約に従う）
- Modify: `00_使用ガイド.md`（機能一覧に Mermaid 自動描画を追記・POC_017 Vault 文書）

- [ ] **Step 1: manifest/package バージョンを bump**

実装完了時点のブランチ方針に従い `x.y.z` を決定（例： `0.33.0`）。`src/manifest.json` と `package.json` を同一値に。

- [ ] **Step 2: CHANGELOG・機能一覧（F-番号）追記**

`docs/superpowers/` 内の既存 CHANGELOG / F-番号マスターの書式に従い、本機能を `F-0xx` として追記（既存の最新 F-番号の次）。

- [ ] **Step 3: 使用ガイド追記**

`00_使用ガイド.md` の機能一覧に以下を追記：
```markdown
| 📊 Mermaid 自動描画 | チャット内 mermaid ブロックを自動で図化（`</>` でコード切替・`general.mermaidRender`） |
```

- [ ] **Step 4: コミット**

```bash
git add package.json src/manifest.json docs/superpowers/ 00_使用ガイド.md
git commit -m "docs(mermaid-render): v0.33.0 リリース準備（CHANGELOG・F-番号・使用ガイド）"
```

---

## セルフレビュー結果

- **Spec 網羅**： R1→Task 4 / R2→Task 4（SETTLE_MS 確定判定） / R3→Task 4（MarkdownRenderer） / R4→Task 4（fail） / R5→Task 3・5 / R6→Task 1・2 — すべて対応済み
- **プレースホルダ**: なし（Task 1 Step 1 のヘルパ名は既存テストの実名に合わせる旨を明記済み）
- **型整合**： `setupMermaidRender(app, plugin, store, log?)` を Task 4（定義）・Task 5（利用）で統一
