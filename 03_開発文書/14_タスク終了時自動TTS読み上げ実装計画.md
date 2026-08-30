# タスク終了時自動TTS読み上げ 実装計画

> 📂 路径：`80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/14_タスク終了時自動TTS読み上げ実装計画.md`
> 📍 設計書：[[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-14-task-completion-auto-tts-design.md]]
> 📅 作成日：2026-08-14
> 🐕 担当：MiuMiu 🐾

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian チャットでアシスタントのストリーミング完了時に 📢 終了報告を検出し、自動で TTS 読み上げする。

**Architecture:** realclaudian view の `callbacks.onTabStreamingChanged` をチェーンして true→false 遷移を検出（アプローチ A）。完了した view の DOM から最後の `.claudian-message-assistant` 内の 📢 blockquote を抽出し、latest-wins コーディネータ経由で `addTextToTTS` に渡す。抽出・コーディネータ・hook を3ファイルに分離。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest + jsdom（`// @vitest-environment jsdom` プラグマ方式、watcher.test.ts と同じ）

## Global Constraints

- リポジトリ: `D:/AI-Agent/ClaudianBridge`（**main で直接実行**、ユーザー同意済み）
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 検証コマンド: `npm run typecheck` / `npm test` / `npm run build`（全て D:/AI-Agent/ClaudianBridge で実行）
- jsdom 利用可能（devDependencies に jsdom ^30）。DOM テストは `// @vitest-environment jsdom` を先頭に
- `tts.autoRead` デフォルト: `{ enabled: true, scope: 'header' }`（ユーザー決定: デフォルト ON）
- 発火条件: 📢 blockquote の存在（scope は読み上げ範囲のみ制御、header=blockquote / full=メッセージ全文）
- 既存テスト 370 件を壊さない（全パス必須）
- バージョンは v0.11.0（現行 v0.10.0）

---

### Task 1: 設定スキーマ拡張（tts.autoRead）

**Files:**
- Modify: `src/core/settings.ts`（TtsCliSettings 定義の直後に追加、~186行目付近）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: なし（既存 normalize/validate パターンに従う）
- Produces: `TtsAutoReadScope` 型 (`'header' | 'full'`)、`TtsAutoReadSettings` インターフェース、`DEFAULT_TTS_AUTO_READ_SETTINGS`、`normalizeTtsAutoReadSettings(raw: unknown): TtsAutoReadSettings`。`ClaudianBridgeSettings.tts.autoRead?: TtsAutoReadSettings` フィールド。Task 4/6 がこれらを利用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/settings.test.ts` に既存テストパターン（normalize → expect 等値）に倣って追加:

```typescript
// === v0.11.0: tts.autoRead ===
describe('tts.autoRead (v0.11.0)', () => {
  it('normalize: autoRead 欠落時はデフォルト補完（enabled: true, scope: header）', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { enabled: true, engine: 'edge' } });
    expect(n.tts.autoRead).toEqual({ enabled: true, scope: 'header' });
  });

  it('normalize: scope=full と enabled=false を保持', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { autoRead: { enabled: false, scope: 'full' } } });
    expect(n.tts.autoRead).toEqual({ enabled: false, scope: 'full' });
  });

  it('normalize: scope 不正値は header にフォールバック', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { autoRead: { enabled: true, scope: 'bogus' } } });
    expect(n.tts.autoRead?.scope).toBe('header');
  });

  it('validate: 正規化済み設定は pass、scope 不正値は拒否', () => {
    const ok = normalizeClaudianBridgeSettings({});
    expect(validateClaudianBridgeSettings(ok)).toBeNull();
    const bad = { ...ok, tts: { ...ok.tts, autoRead: { enabled: true, scope: 'bogus' as never } } };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.autoRead.scope');
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`autoRead` が undefined 等）

- [ ] **Step 3: 最小実装**

`src/core/settings.ts` に追加（`normalizeTtsCliSettings` の直後、~186行目）:

```typescript
// === v0.11.0: タスク終了時の自動読み上げ ===
export type TtsAutoReadScope = 'header' | 'full';

export interface TtsAutoReadSettings {
  /** タスク終了報告（📢）の自動読み上げ（デフォルト true） */
  enabled: boolean;
  /** header = 📢 blockquote のみ / full = 報告メッセージ全文 */
  scope: TtsAutoReadScope;
}

export const DEFAULT_TTS_AUTO_READ_SETTINGS: TtsAutoReadSettings = {
  enabled: true,
  scope: 'header',
};

export function normalizeTtsAutoReadSettings(raw: unknown): TtsAutoReadSettings {
  const r = (raw ?? {}) as Partial<TtsAutoReadSettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_TTS_AUTO_READ_SETTINGS.enabled,
    scope: r.scope === 'full' ? 'full' : DEFAULT_TTS_AUTO_READ_SETTINGS.scope,
  };
}
```

`ClaudianBridgeSettings.tts` に追加（`cli?: TtsCliSettings;` の直後）:

```typescript
    /** v0.11.0: タスク終了時の自動読み上げ。 */
    autoRead?: TtsAutoReadSettings;
```

`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts` に追加（`cli: { ... }` の直後）:

```typescript
    autoRead: { ...DEFAULT_TTS_AUTO_READ_SETTINGS },
```

`normalizeClaudianBridgeSettings` の tts セクション（`cli: normalizeTtsCliSettings(r.tts?.cli),` の直後）に追加:

```typescript
      autoRead: normalizeTtsAutoReadSettings(r.tts?.autoRead),
```

`validateClaudianBridgeSettings`（`cfg.tts.cli` チェックの直後）に追加:

```typescript
  if (cfg.tts.autoRead !== undefined) {
    if (typeof cfg.tts.autoRead.enabled !== 'boolean') return 'tts.autoRead.enabled は boolean である必要があります';
    if (cfg.tts.autoRead.scope !== 'header' && cfg.tts.autoRead.scope !== 'full') return `tts.autoRead.scope が未知です: ${cfg.tts.autoRead.scope}`;
  }
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `npx vitest run tests/core/settings.test.ts && npm run typecheck`
Expected: 全 PASS + tsc エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): add tts.autoRead schema (enabled/scope) with defaults + validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 報告テキスト抽出（extract-report.ts）

**Files:**
- Create: `src/features/tts/extract-report.ts`
- Test: `tests/features/tts/extract-report.test.ts`

**Interfaces:**
- Consumes: `TtsAutoReadScope`（Task 1）。ただし循環回避のため本ファイルでは独自に `AutoReadScope` を定義（= 同じ union 型）
- Produces: `AUTO_READ_MARK = 'data-cb-tts-read'`、`extractReportText(messagesEl: Element, scope: AutoReadScope): string | null` — 📢 blockquote 検出・重複マーク付与・テキスト返却を一体で行う（Task 4 が利用）

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/extract-report.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractReportText, AUTO_READ_MARK } from '../../../src/features/tts/extract-report';

const REPORT_HTML = `
  <div class="claudian-message-assistant">
    <div class="claudian-message-content">
      <h6>✅ 完了 · テストタスク</h6>
      <blockquote>
        <p>📢 テストタスクを完了しました。</p>
        <p>検証は テスト 通過しました。</p>
      </blockquote>
      <hr>
      <p>詳細セクション（読まない）</p>
    </div>
  </div>`;

function makeMessages(inner: string): Element {
  const el = document.createElement('div');
  el.className = 'claudian-messages';
  el.innerHTML = inner;
  return el;
}

describe('extractReportText', () => {
  it('header scope: 📢 blockquote のテキストのみ抽出し、詳細を含まない', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'header');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('検証は テスト 通過しました。');
    expect(text).not.toContain('詳細セクション');
  });

  it('full scope: メッセージ全文を抽出（詳細を含む）', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'full');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('詳細セクション');
  });

  it('📢 blockquote が無いメッセージ → null', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p></div></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('📢 で始まらない blockquote は無視 → null', () => {
    const html = `<div class="claudian-message-assistant"><blockquote><p>引用です 📢 途中は対象外</p></blockquote></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('assistant メッセージが無い → null', () => {
    expect(extractReportText(makeMessages('<p>空</p>'), 'header')).toBeNull();
  });

  it('抽出済みマーク: 2回目は null（header）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'header')).not.toBeNull();
    expect(extractReportText(el, 'header')).toBeNull();
    expect(el.querySelector('blockquote')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('抽出済みマーク: 2回目は null（full はメッセージ要素にマーク）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'full')).not.toBeNull();
    expect(extractReportText(el, 'full')).toBeNull();
    expect(el.querySelector('.claudian-message-assistant')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('最後の assistant メッセージのみ対象（手前の 📢 は読まない）', () => {
    const older = REPORT_HTML;
    const latest = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>補足コメント</p></div></div>`;
    expect(extractReportText(makeMessages(older + latest), 'header')).toBeNull();
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `npx vitest run tests/features/tts/extract-report.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装**

`src/features/tts/extract-report.ts`:

```typescript
/**
 * v0.11.0: タスク終了報告（📢）の DOM 抽出。
 * 発火条件は 📢 blockquote の存在（scope は読み上げ範囲のみ制御）。
 * 抽出と同時に重複防止マーク（data-cb-tts-read）を付与する。
 */
export type AutoReadScope = 'header' | 'full';

export const AUTO_READ_MARK = 'data-cb-tts-read';

/** innerText 非対応環境（jsdom）では textContent にフォールバック */
function readVisibleText(el: Element): string {
  const withInner = el as Element & { innerText?: string };
  const raw = typeof withInner.innerText === 'string' ? withInner.innerText : (el.textContent ?? '');
  return raw.trim();
}

/**
 * messagesEl（.claudian-messages）内の最後の assistant メッセージから報告テキストを抽出。
 * - header: 📢 で始まる blockquote のテキスト
 * - full:   メッセージ全文（.claudian-message-content）
 * 抽出済み・📢 なし・assistant なしの場合は null。
 */
export function extractReportText(messagesEl: Element, scope: AutoReadScope): string | null {
  const assistants = messagesEl.querySelectorAll('.claudian-message-assistant');
  const last = assistants[assistants.length - 1];
  if (!last) return null;

  const report = Array.from(last.querySelectorAll('blockquote'))
    .find((b) => (b.textContent ?? '').trim().startsWith('📢'));
  if (!report) return null;

  const markTarget = scope === 'header' ? report : last;
  if (markTarget.hasAttribute(AUTO_READ_MARK)) return null;
  markTarget.setAttribute(AUTO_READ_MARK, '1');

  const source = scope === 'header' ? report : (last.querySelector('.claudian-message-content') ?? last);
  const text = readVisibleText(source);
  return text === '' ? null : text;
}
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `npx vitest run tests/features/tts/extract-report.test.ts && npm run typecheck`
Expected: 8 件 PASS + tsc エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/extract-report.ts tests/features/tts/extract-report.test.ts
git commit -m "feat(tts): add extractReportText for task-completion report detection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: latest-wins コーディネータ（speak-coordinator.ts）

**Files:**
- Create: `src/features/tts/speak-coordinator.ts`
- Test: `tests/features/tts/speak-coordinator.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `SpeakFn = (text: string) => Promise<boolean>` 型、`createLatestWinsSpeaker(speak: SpeakFn): (text: string) => void`（Task 4 が利用）

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/speak-coordinator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createLatestWinsSpeaker } from '../../../src/features/tts/speak-coordinator';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createLatestWinsSpeaker', () => {
  it('idle 時は即座に speak を呼ぶ', async () => {
    const speak = vi.fn(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    expect(speak).toHaveBeenCalledWith('A');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('speaking 中の新報告は最新1件のみ保留（古いのは破棄）', async () => {
    const d1 = deferred<boolean>();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');          // 読み上げ開始
    await Promise.resolve();
    enqueue('B');          // 保留
    enqueue('C');          // B を上書き
    d1.resolve(true);      // A 完了
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(speak).not.toHaveBeenCalledWith('B');
    expect(speak).toHaveBeenCalledWith('C');
  });

  it('完了後に保留分を読む（順序保証）', async () => {
    const calls: string[] = [];
    const d1 = deferred<boolean>();
    const speak = vi.fn((t: string) => { calls.push(t); return d1.promise; });
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    d1.resolve(true);
    await vi.waitFor(() => expect(calls).toEqual(['A', 'B']));
  });

  it('speak が reject しても保留分を読む（例外で停止しない）', async () => {
    const d1 = deferred<boolean>();
    const speak = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(() => Promise.resolve(true));
    const enqueue = createLatestWinsSpeaker(speak);
    enqueue('A');
    await Promise.resolve();
    enqueue('B');
    d1.reject(new Error('tts failed'));
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(speak).toHaveBeenLastCalledWith('B');
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `npx vitest run tests/features/tts/speak-coordinator.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装**

`src/features/tts/speak-coordinator.ts`:

```typescript
/**
 * v0.11.0: latest-wins 読み上げコーディネータ。
 * 読み上げ中に来た新報告は「最新1件のみ保留」し、完了後に読む。
 * WebSpeech は webSpeechSpeak 冒頭の synth.cancel() により真の中断が効く。
 * edge / Plachta は外部から停止できないため本コーディネータで直列化する。
 */
export type SpeakFn = (text: string) => Promise<boolean>;

export function createLatestWinsSpeaker(speak: SpeakFn): (text: string) => void {
  let speaking = false;
  let pending: string | null = null;

  const run = (text: string): void => {
    if (speaking) {
      pending = text; // 最新で上書き（古い保留は破棄）
      return;
    }
    speaking = true;
    void Promise.resolve()
      .then(() => speak(text))
      .catch(() => { /* 失敗 Notice は addTextToTTS 側の責務 */ })
      .finally(() => {
        speaking = false;
        if (pending !== null) {
          const next = pending;
          pending = null;
          run(next);
        }
      });
  };

  return run;
}
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `npx vitest run tests/features/tts/speak-coordinator.test.ts && npm run typecheck`
Expected: 4 件 PASS + tsc エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/speak-coordinator.ts tests/features/tts/speak-coordinator.test.ts
git commit -m "feat(tts): add latest-wins speak coordinator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: auto-read hook（auto-read.ts）

**Files:**
- Create: `src/features/tts/auto-read.ts`
- Test: `tests/features/tts/auto-read.test.ts`

**Interfaces:**
- Consumes: `extractReportText`（Task 2）、`createLatestWinsSpeaker` / `SpeakFn`（Task 3）
- Produces: `AutoReadDeps { app: App; store: ConfigStore; speak: SpeakFn; noticeFn?: (m: string) => void }`、`setupAutoReadTTS(deps: AutoReadDeps): () => void`（Task 5 が利用）

**背景知識（realclaudian 内部構造・bundle 実測済み）:**
- プラグイン: `app.plugins.plugins['realclaudian']`、`getAllViews(): View[]` / `getView(): View | null`
- hook ポイント: `view.callbacks.onTabStreamingChanged(tabId, isStreaming)`（代入可能なプレーンオブジェクト）
- フォールバック: `view.onStreamingChanged(conversationId, isStreaming)` メソッドのラップ
- メッセージ DOM: `view.containerEl` → `.claudian-messages`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/auto-read.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupAutoReadTTS } from '../../../src/features/tts/auto-read';
import type { ConfigStore } from '../../../src/core/config-store';

const REPORT_HTML = `
  <div class="claudian-message-assistant">
    <div class="claudian-message-content">
      <blockquote><p>📢 テストタスクを完了しました。</p></blockquote>
    </div>
  </div>`;

function makeView(innerHtml: string, extra: Record<string, unknown> = {}) {
  const containerEl = document.createElement('div');
  const messages = document.createElement('div');
  messages.className = 'claudian-messages';
  messages.innerHTML = innerHtml;
  containerEl.appendChild(messages);
  return { containerEl, callbacks: {}, ...extra } as Record<string, unknown> & {
    containerEl: HTMLElement;
    callbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void };
  };
}

function makeApp(views: unknown[]) {
  const listeners: Array<() => void> = [];
  return {
    app: {
      plugins: { plugins: { realclaudian: { getAllViews: () => views } } },
      workspace: {
        on: (_name: string, cb: () => void) => { listeners.push(cb); return { cb }; },
        offref: vi.fn(),
      },
    } as never,
    fireLayoutChange: () => listeners.forEach((cb) => cb()),
  };
}

function makeStore(autoRead?: { enabled: boolean; scope: 'header' | 'full' }, ttsEnabled = true) {
  return {
    load: () => ({ tts: { enabled: ttsEnabled, autoRead: autoRead ?? { enabled: true, scope: 'header' } } }),
  } as unknown as ConfigStore;
}

describe('setupAutoReadTTS', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('callbacks.onTabStreamingChanged をチェーンし、元コールバックも呼ばれる', () => {
    const orig = vi.fn();
    const view = makeView(REPORT_HTML);
    view.callbacks.onTabStreamingChanged = orig;
    const { app } = makeApp([view]);
    setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true) });
    view.callbacks.onTabStreamingChanged!('tab1', true);
    expect(orig).toHaveBeenCalledWith('tab1', true);
  });

  it('true→false 遷移で 📢 テキストを speak に渡す', async () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('tab1', true);
    view.callbacks.onTabStreamingChanged!('tab1', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('📢 テストタスクを完了しました。');
  });

  it('true→true / false→false では発火しない', () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('t', false); // 初回 false（prev なし）
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', true); // 遷移なし
    expect(speak).not.toHaveBeenCalled();
  });

  it('autoRead.enabled=false では発火しない', () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore({ enabled: false, scope: 'header' }), speak });
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('📢 なしの応答では発火しない', () => {
    const view = makeView('<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常応答</p></div></div>');
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('layout-change で新しい view に hook される（二重 hook しない）', () => {
    const v1 = makeView(REPORT_HTML);
    const { app, fireLayoutChange } = makeApp([v1]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    const hooked1 = v1.callbacks.onTabStreamingChanged;
    fireLayoutChange(); // 再スキャン
    expect(v1.callbacks.onTabStreamingChanged).toBe(hooked1); // 同一関数のまま
  });

  it('fallback: callbacks が無く onStreamingChanged メソッドがある場合はラップ', async () => {
    const view = makeView(REPORT_HTML, {
      onStreamingChanged(_id: string, _streaming: boolean) { /* 本家処理 */ },
    });
    delete (view as Record<string, unknown>).callbacks;
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    (view as unknown as { onStreamingChanged: (id: string, s: boolean) => void }).onStreamingChanged('c', true);
    (view as unknown as { onStreamingChanged: (id: string, s: boolean) => void }).onStreamingChanged('c', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
  });

  it('hook ポイントなし → noticeFn 警告（1回のみ）', () => {
    const view = makeView(REPORT_HTML);
    delete (view as Record<string, unknown>).callbacks;
    const { app } = makeApp([view, makeView(REPORT_HTML)]);
    const noticeFn = vi.fn();
    setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true), noticeFn });
    expect(noticeFn).toHaveBeenCalledTimes(1);
    expect(noticeFn.mock.calls[0][0]).toContain('自動読み上げ');
  });

  it('realclaudian 未インストール → 静かに何もしない', () => {
    const app = {
      plugins: { plugins: {} },
      workspace: { on: () => ({}), offref: vi.fn() },
    } as never;
    const noticeFn = vi.fn();
    expect(() => setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true), noticeFn })).not.toThrow();
    expect(noticeFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `npx vitest run tests/features/tts/auto-read.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装**

`src/features/tts/auto-read.ts`:

```typescript
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { extractReportText } from './extract-report';
import { createLatestWinsSpeaker } from './speak-coordinator';
import type { SpeakFn } from './speak-coordinator';

/**
 * v0.11.0: タスク終了時の自動読み上げ。
 * realclaudian view のストリーミング完了（true→false）を検出し、
 * 📢 報告ブロックを抽出して TTS に渡す。
 *
 * realclaudian 内部構造（main.js 実測、プロパティ名は minify 後も維持）:
 * - app.plugins.plugins['realclaudian'].getAllViews() / getView()
 * - view.callbacks.onTabStreamingChanged(tabId, isStreaming)  ← 第一 hook ポイント
 * - view.onStreamingChanged(conversationId, isStreaming)      ← フォールバック
 * ⚠️ realclaudian アップグレード後は上記を grep 复核すること。
 */

interface RealClaudianView {
  containerEl?: Element;
  callbacks?: { onTabStreamingChanged?: (tabId: string, streaming: boolean) => void };
  onStreamingChanged?: (conversationId: string, streaming: boolean) => void;
}

interface RealClaudianPlugin {
  getView?: () => RealClaudianView | null;
  getAllViews?: () => RealClaudianView[];
}

export interface AutoReadDeps {
  app: App;
  store: ConfigStore;
  speak: SpeakFn;
  noticeFn?: (m: string) => void;
}

export function setupAutoReadTTS(deps: AutoReadDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });
  const enqueue = createLatestWinsSpeaker(deps.speak);
  const hooked = new WeakSet<object>();
  const prevStreaming = new WeakMap<object, boolean>();
  const restores: Array<() => void> = [];
  let warned = false;

  const getViews = (): RealClaudianView[] => {
    const p = (deps.app as unknown as { plugins?: { plugins?: Record<string, RealClaudianPlugin | undefined> } })
      ?.plugins?.plugins?.['realclaudian'];
    if (!p) return [];
    try {
      if (typeof p.getAllViews === 'function') return p.getAllViews();
      if (typeof p.getView === 'function') {
        const v = p.getView();
        return v ? [v] : [];
      }
    } catch { /* best-effort */ }
    return [];
  };

  const onStreamState = (view: RealClaudianView, streaming: boolean): void => {
    const prev = prevStreaming.get(view) ?? false;
    prevStreaming.set(view, streaming);
    if (streaming || prev === streaming) return; // true→false 遷移のみ
    try {
      const cfg = deps.store.load();
      if (!cfg.tts.enabled || cfg.tts.autoRead?.enabled === false) return;
      const root = view.containerEl;
      const messages = root?.querySelector('.claudian-messages');
      if (!messages) return;
      const text = extractReportText(messages, cfg.tts.autoRead?.scope ?? 'header');
      if (text) enqueue(text);
    } catch (e) {
      console.error('[claudian-bridge] auto-read error:', e);
    }
  };

  const warnOnce = (): void => {
    if (warned) return;
    warned = true;
    notice('⚠️ 自動読み上げ: Claudian 側の構造が変更されたため無効です');
    console.warn('[claudian-bridge] auto-read: hook point not found (realclaudian upgraded?)');
  };

  const hookView = (view: RealClaudianView): void => {
    if (hooked.has(view)) return;
    // 第一候補: callbacks.onTabStreamingChanged をチェーン
    if (view.callbacks && typeof view.callbacks === 'object') {
      const cbs = view.callbacks;
      const orig = cbs.onTabStreamingChanged;
      cbs.onTabStreamingChanged = (tabId, streaming) => {
        orig?.call(cbs, tabId, streaming);
        onStreamState(view, streaming);
      };
      hooked.add(view);
      restores.push(() => { cbs.onTabStreamingChanged = orig; });
      return;
    }
    // フォールバック: onStreamingChanged メソッドをラップ
    if (typeof view.onStreamingChanged === 'function') {
      const orig = view.onStreamingChanged.bind(view);
      view.onStreamingChanged = (conversationId, streaming) => {
        orig(conversationId, streaming);
        onStreamState(view, streaming);
      };
      hooked.add(view);
      restores.push(() => { view.onStreamingChanged = orig; });
      return;
    }
    warnOnce();
  };

  const scan = (): void => {
    for (const v of getViews()) hookView(v);
  };
  scan();

  const layoutRef = deps.app.workspace.on('layout-change', scan);

  return () => {
    deps.app.workspace.offref(layoutRef);
    for (const r of restores) {
      try { r(); } catch { /* view 破棄済み等は無視 */ }
    }
  };
}
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `npx vitest run tests/features/tts/auto-read.test.ts && npm run typecheck`
Expected: 9 件 PASS + tsc エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/auto-read.ts tests/features/tts/auto-read.test.ts
git commit -m "feat(tts): add auto-read hook on realclaudian streaming completion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: main.ts 配線

**Files:**
- Modify: `src/main.ts`（import 追加 + setupSelectionWatcher 登録の直後に配線、~185行目付近）

**Interfaces:**
- Consumes: `setupAutoReadTTS`（Task 4）、既存 `addTextToTTS`
- Produces: なし（配線のみ）

- [ ] **Step 1: import 追加**

`src/main.ts` の import ブロック（`import { addTextToTTS } from './features/tts/core';` の直後）:

```typescript
import { setupAutoReadTTS } from './features/tts/auto-read';
```

- [ ] **Step 2: 配線追加**

`this.register(cleanupSelection);` / `diag('selection watcher registered');` の直後に:

```typescript
      // ★ v0.11.0: タスク終了時の自動読み上げ（📢 報告検出）
      const cleanupAutoRead = setupAutoReadTTS({
        app: this.app,
        store: this.store,
        speak: async (text) => {
          const cfg = this.store.load();
          if (!cfg.tts.enabled || cfg.tts.autoRead?.enabled === false) return false;
          return addTextToTTS(this.app, text, cfg.tts);
        },
      });
      this.register(cleanupAutoRead);
      diag('auto-read registered');
```

- [ ] **Step 3: 型チェック + 全テスト + ビルド**

Run: `npm run typecheck && npm test && npm run build`
Expected: tsc エラーなし / 全テスト PASS / ビルド成功

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire auto-read TTS on streaming completion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 設定タブ UI + i18n

**Files:**
- Modify: `src/core/i18n.ts`（LocaleStrings インターフェース + ja/en/zh の3ロケール）
- Modify: `src/settings/SettingTabTts.ts`（CLI セクションの直後に追加、~325行目付近）
- Test: `tests/core/i18n.test.ts`（既存のキーパリティ検証で自動カバー。失敗した場合のみ確認）

**Interfaces:**
- Consumes: `TtsAutoReadSettings` / `DEFAULT_TTS_AUTO_READ_SETTINGS`（Task 1）
- Produces: i18n キー `ttsAutoReadHeading` / `ttsAutoReadEnabled` / `ttsAutoReadEnabledDesc` / `ttsAutoReadScope` / `ttsAutoReadScopeDesc` / `ttsAutoReadScopeHeader` / `ttsAutoReadScopeFull`

- [ ] **Step 1: i18n キー追加**

`src/core/i18n.ts` の `LocaleStrings` インターフェース（`ttsCliFilterShortcode: string;` の直後）:

```typescript
  ttsAutoReadHeading: string;
  ttsAutoReadEnabled: string;
  ttsAutoReadEnabledDesc: string;
  ttsAutoReadScope: string;
  ttsAutoReadScopeDesc: string;
  ttsAutoReadScopeHeader: string;
  ttsAutoReadScopeFull: string;
```

ja ロケール（`ttsCliFilterShortcode: 'Emoji 短コード',` の直後）:

```typescript
    ttsAutoReadHeading: '📢 タスク終了時の自動読み上げ',
    ttsAutoReadEnabled: '🔊 自動読み上げ',
    ttsAutoReadEnabledDesc: 'タスク終了報告（📢）を検出して自動で読み上げ',
    ttsAutoReadScope: '📏 読み上げ範囲',
    ttsAutoReadScopeDesc: 'ヘッダーのみ: 📢 ブロックのみ / 全文: 報告メッセージ全体',
    ttsAutoReadScopeHeader: '📢 ヘッダーのみ',
    ttsAutoReadScopeFull: '📄 メッセージ全文',
```

en ロケール:

```typescript
    ttsAutoReadHeading: '📢 Auto-read task completion',
    ttsAutoReadEnabled: '🔊 Auto-read',
    ttsAutoReadEnabledDesc: 'Detect task completion report (📢) and read it aloud',
    ttsAutoReadScope: '📏 Reading scope',
    ttsAutoReadScopeDesc: 'Header only: 📢 blockquote / Full: entire report message',
    ttsAutoReadScopeHeader: '📢 Header only',
    ttsAutoReadScopeFull: '📄 Full message',
```

zh ロケール:

```typescript
    ttsAutoReadHeading: '📢 任务完成时自动朗读',
    ttsAutoReadEnabled: '🔊 自动朗读',
    ttsAutoReadEnabledDesc: '检测到任务完成报告（📢）时自动朗读',
    ttsAutoReadScope: '📏 朗读范围',
    ttsAutoReadScopeDesc: '仅标题: 只读 📢 引用块 / 全文: 朗读整个报告消息',
    ttsAutoReadScopeHeader: '📢 仅标题',
    ttsAutoReadScopeFull: '📄 全文',
```

- [ ] **Step 2: 設定タブに UI 追加**

`src/settings/SettingTabTts.ts`:

import 更新（`import type { TtsCliSettings } from '../core/settings';` の行を置換）:

```typescript
import type { TtsCliSettings, TtsAutoReadSettings } from '../core/settings';
```

CLI セクション（`// 6. v0.10.0: Claude Code CLI 用設定` ブロック）の閉じ括弧の直後、`// 5. 削除注意文` の直前に追加:

```typescript
    // 7. v0.11.0: タスク終了時の自動読み上げ
    {
      const arBox = containerEl.createDiv({ cls: 'cb-tts-autoread' });
      arBox.createEl('h3', { text: s.ttsAutoReadHeading });

      const saveAutoRead = (patch: Partial<TtsAutoReadSettings>): void => {
        const latest = store.load();
        const base = latest.tts.autoRead ?? { enabled: true, scope: 'header' as const };
        store.save({ ...latest, tts: { ...latest.tts, autoRead: { ...base, ...patch } } });
        draw();
      };

      new Setting(arBox)
        .setName(s.ttsAutoReadEnabled)
        .setDesc(s.ttsAutoReadEnabledDesc)
        .addToggle((t) => t.setValue(cfg.tts.autoRead?.enabled ?? true).onChange((v) => saveAutoRead({ enabled: v })));

      new Setting(arBox)
        .setName(s.ttsAutoReadScope)
        .setDesc(s.ttsAutoReadScopeDesc)
        .addDropdown((d) => {
          d.addOption('header', s.ttsAutoReadScopeHeader);
          d.addOption('full', s.ttsAutoReadScopeFull);
          d.setValue(cfg.tts.autoRead?.scope ?? 'header');
          d.onChange((v) => saveAutoRead({ scope: v as 'header' | 'full' }));
        });
    }
```

- [ ] **Step 3: 型チェック + i18n テスト + 全テスト**

Run: `npm run typecheck && npm test`
Expected: tsc エラーなし / 全テスト PASS（i18n パリティ含む）

- [ ] **Step 4: Commit**

```bash
git add src/core/i18n.ts src/settings/SettingTabTts.ts
git commit -m "feat(settings): add auto-read toggle + scope dropdown to TTS tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: バージョン v0.11.0・リリース・Vault 文書更新

**Files:**
- Modify: `package.json`（version → 0.11.0）
- Modify: `manifest.json`（version → 0.11.0）
- Vault: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`
- Vault: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/01_バージョン履歴/バージョン履歴.md`
- Vault: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/00_アーキテクチャ総覧.md`（auto-read.ts / extract-report.ts / speak-coordinator.ts 追記）

- [ ] **Step 1: バージョン更新**

`package.json` と `manifest.json` の `"version": "0.10.0"` → `"0.11.0"`

- [ ] **Step 2: 全検証 + デプロイ**

Run: `npm run typecheck && npm test && npm run build && npm run deploy`
Expected: 全 PASS / ビルド成功 / vault `.obsidian/plugins/claudian-bridge/` へコピー完了

- [ ] **Step 3: 実機 UAT（ユーザー依頼）**

ユーザーに依頼:
1. Ctrl+R で Obsidian 再読み込み
2. Claudian でタスクを実行し、📢 終了報告が自動読み上げされることを確認
3. 設定 → TTS タブに「📢 タスク終了時の自動読み上げ」セクション（トグル + 範囲ドロップダウン）が表示されることを確認

- [ ] **Step 4: Vault 文書更新（コントローラ実施）**

- リリースノート: v0.11.0 エントリ（自動読み上げ機能・抽出・latest-wins・設定 UI）
- バージョン履歴: v0.11.0 行追加
- 00_アーキテクチャ総覧: 新規 3 ファイルを TTS セクションに追記

- [ ] **Step 5: Commit**

```bash
git add package.json manifest.json
git commit -m "chore(release): v0.11.0 task-completion auto TTS

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 結果

| チェック | 結果 |
|---------|:----:|
| Spec カバレッジ（hook/抽出/コーディネータ/設定/配線/UI/リリース → Task 1-7） | ✅ 全項目対応 |
| プレースホルダ（TBD/TODO/「適切な処理」） | ✅ なし |
| 型整合性（AutoReadScope/SpeakFn/AutoReadDeps/setupAutoReadTTS が Task 間で一致） | ✅ |
| 既存テスト非破壊（settings.test.ts は追加のみ、i18n は3ロケール同期追加） | ✅ |

---

## 実装後の修正（v0.11.1 〜 v0.13.0）

> 📅 2026-08-15 追記。リリース後の実機フィードバックによる修正を記録する。

### v0.13.0: 全応答読み上げへの拡張 + Stop hook 廃止（KB-016）

読み上げ中にミュートアイコンが点滅しない問題の**根因**を特定。

| 項目 | 内容 |
|------|------|
| 根因 | Claude Code CLI の **Stop hook**（`~/.claude/settings.json` → `hooks/tts-speak.py`）が全応答完了時に `Pipeline.invoke()` を直接実行 → プラグインの再生レジストリ非経由のためミュートボタンが「再生中」を検知できない |
| 対策① | `extractReportText()` を scope=full 時は 📢 有無に関わらず**最後の応答を全文読み上げ**るよう変更（プラグイン一元化） |
| 対策② | Stop hook を無効化（`hooks.Stop` 削除・バックアップ: `~/.claude/settings.json.bak_2026-08-15`） |
| 効果 | 全読み上げが再生レジストリ経由になり、**ミュートボタンの点滅・停止が機能**。📢 応答での二重読み上げも解消 |

### v0.11.1: hook 先の修正（KB-004）

実機調査で **view 直下の `callbacks` / `onStreamingChanged` は実在しない**ことが判明。実測では `view.getTabManager().callbacks.onTabStreamingChanged` に存在したため、hook 先を変更。

```typescript
// 修正前（v0.11.0）: view.callbacks を前提 → 不発火
// 修正後（v0.11.1）: view.getTabManager().callbacks をチェーン
const tm = typeof view.getTabManager === 'function' ? view.getTabManager() : null;
if (tm?.callbacks && typeof tm.callbacks === 'object') {
  hookCallbacks(view, tm.callbacks);
}
```

### v0.12.1: 誤報修正・複数タブ対応・抽出リトライ（KB-008 / KB-009）

| 項目 | 内容 |
|------|------|
| 誤報修正 | 📢 報告の無い通常応答でも「⚠️ 自動読み上げ: 📢 検出不可」通知が毎回表示された。**📢 なしは静かにスキップ**（通知削除・console.debug のみ） |
| 複数タブ対応 | `view.containerEl.querySelector('.claudian-messages')` が最初のタブの領域を返す問題。**アクティブタブ優先**（`.claudian-tab-content:not(.claudian-hidden) .claudian-messages`）に変更 |
| 抽出リトライ | stream-end 直後は markdown レンダリング未完了のことがあるため、400ms × 最大5回リトライして 📢 blockquote を検出 |
| ログ整理 | イベント毎ログを `console.debug` に格下げ（成功時 🔊 通知は維持） |

### v0.12.3: ミュートボタン点滅・停止修正（KB-013 / KB-014）

- 読み上げ中にミュートボタンが点滅しない問題: edge エンジンで音声再生が別プロセス（PowerShell）実行のため、再生レジストリが「再生中」を検知できなかった
  - claude-tts スキル `CrossPlatformPlayer` を `subprocess.run`（音声終了まで待機）に変更 → 子プロセスが再生中ずっと生存し点滅が機能
- ミュートボタンで音声が停止しない問題: 停止ハンドラが `commands.py` 子プロセスを kill しても PowerShell プレイヤーが別プロセスで継続
  - edge 停止ハンドラを `taskkill /T`（プロセスツリーごと kill）に変更 → PowerShell も停止
- ボタンラベル最小化（ミュートは全状態で「ミュート」表記）

### v0.12.2: speech_filter 全経路適用（KB-011 / KB-012）

`tts.cli.speech_filter`（emoji/顔文字/ASCII表情/短コード除去）が**定義・UI・CLI同期のみで実際の読み上げに未適用**だった問題を修正。

- `addTextToTTS` 冒頭で `filterSpeechText()` を適用（チャット自動読み上げ・手動 Add to TTS）
- claude-tts スキル `extractor.py` に speech_filter 実装を復元（POC_015 由来）+ pipeline 配線

### テスト件数

| バージョン | テスト | 備考 |
|-----------|-------|------|
| v0.11.0 | 全395件 PASS | auto-read 9件追加 |
| v0.12.1 | 全424件 PASS | 複数タブテスト1件追加 |
| v0.12.2 | 全435件 PASS | speech-filter 9件 + core 統合2件追加 |
| v0.13.0 | 全438件 PASS | extract-report 2件 + auto-read 1件追加（全応答読み上げ対応） |
