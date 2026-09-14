# チャット読上げハイライト (F-050) + MD 画面 Add to TTS ボタン (F-051) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian 画面の最終回答自動読み上げ中にメッセージブロックをハイライト（F-050）し、MD 画面のビューヘッダ右上に「Add to TTS」ボタンを追加し（F-051）、設定タブ「Memory」にアイコンを付与する（v0.49.0）。

**Architecture:** F-050 は `chat-read-highlight` モジュールを新設し、`auto-read.ts` が `createLatestWinsSpeaker` に渡す `SpeakFn` を薄くラップして activate/deactivate（世代トークンで割り込み時の誤解除を防止）。F-051 は `md-file-read.ts` に `setupMdViewButton` を追加し、既存 `addMdToTts` フローを呼ぶだけ。Memory アイコンは i18n ラベル変更のみ。

**Tech Stack:** TypeScript / vitest (jsdom) / Obsidian Plugin API（`ItemView.addAction`, `workspace.on('layout-change')`）

**Design doc（SSOT）:** Vault `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/32_チャット読上げハイライト設計.md`（v1.1・approved）

## Global Constraints

- ターゲットバージョン: **v0.49.0**（Minor）。`manifest.json` / `package.json` は最終タスクで 0.49.0 に更新
- F-番号付与規約: コミットメッセージに F-番号を含める（例: `feat(F050): ...`）
- i18n は **ja / en / zh の 3 ロケール全て**に必ず追加（1 ロケールでも欠落で lang テストが失敗する）
- CSS クラスは `cb-` 接頭辞規約に従う
- 設定キーの追加パターン: `src/core/settings.ts` に 型 + DEFAULT + normalize の 3 点セット
- 現状テストスコア: 1348 total（1347 passed / 1 skipped）。各タスク完了時点で全テスト PASS + `npm run typecheck` 0 を維持
- 全コマンドはリポジトリルート `D:\AI-Agent\ClaudianBridge` で実行

---

### Task 1: Memory タブのアイコン追加（i18n）

**Files:**
- Modify: `src/core/i18n.ts`（L920 / L1418 / L1916 付近の `tabMemory`）

**Interfaces:**
- Consumes: なし
- Produces: `tabMemory: '🧠 Memory'`（3 ロケール共通の値）

- [ ] **Step 1: 3 ロケールの `tabMemory` を一括置換**

`src/core/i18n.ts` で `tabMemory: 'Memory',` を検索（3 件ヒット: ja ≒ L920 / en ≒ L1418 / zh ≒ L1916）。すべて以下に置換する（`replace_all` で可。値は 3 ロケール同一でよい — 他の絵文字付きタブも全ロケール同値のため）:

```ts
    tabMemory: '🧠 Memory',
```

- [ ] **Step 2: テストを実行して既存テストが壊れていないことを確認**

Run: `npx vitest run tests/features/tts/lang.test.ts tests/features/tts/core-lang-consistency.test.ts`
Expected: PASS（lang テストはキー存在一致性質のため、値変更では壊れない）

- [ ] **Step 3: typecheck + 全テスト**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck エラー 0・全テスト PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/i18n.ts
git commit -m "style(i18n): Memory 設定タブにアイコン追加 (🧠)"
```

---

### Task 2: 設定キー `tts.chatReadHighlight` の追加

**Files:**
- Modify: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `ChatReadHighlightSettings` 型・`ClaudianBridgeSettings['tts']['chatReadHighlight']`（Task 3/5 が消費）

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/settings.test.ts` に既存の `mdReadHighlight` normalize テスト群（`describe` ブロック内）に倣い、追記する。ファイル冒頭の import は既存のものを流用（`normalizeClaudianBridgeSettings` 等は既に import 済みのはず。無ければ既存テストの import 行に合わせる）:

```ts
  describe('tts.chatReadHighlight (v0.49.0 / F-050)', () => {
    it('欠落時は既定 ON で補填される', () => {
      const s = normalizeClaudianBridgeSettings({});
      expect(s.tts.chatReadHighlight).toEqual({ enabled: true });
    });

    it('enabled: false は保持される', () => {
      const s = normalizeClaudianBridgeSettings({
        tts: { chatReadHighlight: { enabled: false } },
      } as never);
      expect(s.tts.chatReadHighlight.enabled).toBe(false);
    });

    it('型不正（enabled が boolean 以外）は既定 ON にフォールバック', () => {
      const s = normalizeClaudianBridgeSettings({
        tts: { chatReadHighlight: { enabled: 'yes' } },
      } as never);
      expect(s.tts.chatReadHighlight.enabled).toBe(true);
    });
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`chatReadHighlight` が undefined）

- [ ] **Step 3: settings.ts に型・既定・normalize を追加**

`src/core/settings.ts` — `MdReadHighlightSettings` インターフェース定義（L470-477）の直後に追加:

```ts
/**
 * v0.49.0 (F-050): Claudian 画面の最終回答自動読み上げ中のメッセージハイライト設定。
 */
export interface ChatReadHighlightSettings {
  /** ハイライト機能の有効化（デフォルト true） */
  enabled: boolean;
}
```

`ClaudianBridgeSettings` の `tts` セクション内（`mdReadHighlight: MdReadHighlightSettings;` の行・L668 の直後）に追加:

```ts
    /** v0.49.0 (F-050): Claudian 画面の自動読み上げ中のメッセージハイライト設定。 */
    chatReadHighlight: ChatReadHighlightSettings;
```

`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS` の `tts.mdReadHighlight`（L783-787）の直後に追加:

```ts
    // v0.49.0 (F-050): Claudian 画面の自動読み上げ中のメッセージハイライト
    chatReadHighlight: { enabled: true },
```

`normalizeClaudianBridgeSettings` 内の IIFE 戻り値（`mdReadHighlight: {...}` の L987-994 ブロックの直後・`mdReadProfile` の前）に追加:

```ts
          // v0.49.0 (F-050): Claudian 画面の自動読み上げハイライト（旧 data.json には存在しないため補填）
          chatReadHighlight: {
            enabled: typeof r.tts?.chatReadHighlight?.enabled === 'boolean'
              ? r.tts.chatReadHighlight.enabled
              : true,
          },
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/core/settings.test.ts && npm run typecheck`
Expected: PASS・typecheck 0

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(F050): tts.chatReadHighlight 設定キー追加（既定 ON）"
```

---

### Task 3: `chat-read-highlight` モジュール + CSS

**Files:**
- Create: `src/features/tts/chat-read-highlight/index.ts`
- Modify: `styles.css`（末尾に追記）
- Test: `tests/features/tts/chat-read-highlight.test.ts`

**Interfaces:**
- Consumes: `ConfigStore`（`src/core/config-store` の `load(): ClaudianBridgeSettings`）
- Produces: `createChatReadHighlighter(deps: { store: ConfigStore }): ChatReadHighlighter`、`ChatReadHighlighter = { activate(messagesEl: Element): number; deactivate(token: number): void }`（Task 4 が消費）

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/chat-read-highlight.test.ts` を新規作成（`// @vitest-environment jsdom` を必須 — `scrollIntoView` は jsdom に存在しないためスタブする）:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatReadHighlighter } from '../../../src/features/tts/chat-read-highlight';
import type { ConfigStore } from '../../../src/core/config-store';

// jsdom には scrollIntoView が無いためスタブ
beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
});

function makeStore(enabled: boolean, highlightColor = ''): ConfigStore {
  return {
    load: () => ({
      tts: {
        chatReadHighlight: { enabled },
        mdReadHighlight: { enabled: true, highlightColor, scrollPositionPct: 40 },
      },
    }),
  } as unknown as ConfigStore;
}

function makeMessages(assistantCount = 1): HTMLElement {
  const messages = document.createElement('div');
  messages.className = 'claudian-messages';
  for (let i = 0; i < assistantCount; i++) {
    const m = document.createElement('div');
    m.className = 'claudian-message-assistant';
    messages.appendChild(m);
  }
  return messages;
}

describe('createChatReadHighlighter (v0.49.0 / F-050)', () => {
  it('activate で最後の assistant メッセージにクラス + 背景色を付与し scrollIntoView する', () => {
    const el = makeMessages(2);
    const h = createChatReadHighlighter({ store: makeStore(true, '#ffe680') });
    h.activate(el);
    const items = el.querySelectorAll('.claudian-message-assistant');
    expect(items[0].classList.contains('cb-chat-read-active')).toBe(false);
    expect(items[1].classList.contains('cb-chat-read-active')).toBe(true);
    expect(items[1].style.getPropertyValue('background')).toBe('#ffe680');
    expect(items[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('highlightColor が空文字ならインライン背景は付与しない（CSS 既定色）', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '') });
    h.activate(el);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(true);
    expect(last.style.getPropertyValue('background')).toBe('');
  });

  it('deactivate でクラス + インラインスタイルが完全解除される', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '#ffe680') });
    const token = h.activate(el);
    h.deactivate(token);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(false);
    expect(last.style.getPropertyValue('background')).toBe('');
  });

  it('割り込み時: 旧トークンの deactivate は新ハイライトを解除しない（世代ガード）', () => {
    const el1 = makeMessages(1);
    const el2 = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(true, '') });
    const t1 = h.activate(el1);
    const t2 = h.activate(el2); // 後勝ち割り込み
    h.deactivate(t1); // 旧 speak の finally（無効であるべき）
    const last2 = el2.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last2.classList.contains('cb-chat-read-active')).toBe(true); // 残る
    h.deactivate(t2); // 新しい方の finally（有効）
    expect(last2.classList.contains('cb-chat-read-active')).toBe(false);
  });

  it('設定 OFF では何もしない', () => {
    const el = makeMessages(1);
    const h = createChatReadHighlighter({ store: makeStore(false) });
    h.activate(el);
    const last = el.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(false);
  });

  it('assistant メッセージが無い場合は無害動作（例外を出さない）', () => {
    const el = document.createElement('div');
    const h = createChatReadHighlighter({ store: makeStore(true) });
    expect(() => h.activate(el)).not.toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/chat-read-highlight.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: モジュールを実装**

`src/features/tts/chat-read-highlight/index.ts` を新規作成:

```ts
/**
 * v0.49.0 (F-050): Claudian 画面の最終回答自動読み上げ中のメッセージハイライト。
 * MD 読上げハイライト (F-028) の Claudian 画面版（メッセージ単位・チャンク範囲は対象外）。
 *
 * - activate(messagesEl): 最後の .claudian-message-assistant にクラス + 背景色を付与し
 *   画面中央へスクロール。トークン（世代番号）を返す。
 * - deactivate(token): token が最新世代と一致する場合のみ解除。
 *   後勝ち割り込み時に旧 speak の finally が新ハイライトを誤解除しないためのガード
 *   （speak-coordinator の世代カウンタと同パターン）。
 */

import type { ConfigStore } from '../../../core/config-store';

const ASSISTANT_SELECTOR = '.claudian-message-assistant';
const ACTIVE_CLASS = 'cb-chat-read-active';

export interface ChatReadHighlighter {
  /** ハイライトを開始し、世代トークンを返す */
  activate: (messagesEl: Element) => number;
  /** トークンが最新世代の場合のみハイライトを解除 */
  deactivate: (token: number) => void;
}

export function createChatReadHighlighter(deps: { store: ConfigStore }): ChatReadHighlighter {
  let latestToken = 0;
  let current: HTMLElement | null = null;

  const clear = (): void => {
    if (!current) return;
    current.classList.remove(ACTIVE_CLASS);
    current.style.removeProperty('background');
    current = null;
  };

  const activate = (messagesEl: Element): number => {
    const token = ++latestToken;
    clear();
    try {
      const cfg = deps.store.load();
      if (cfg.tts.chatReadHighlight?.enabled === false) return token;
      const root = messagesEl.querySelector('.claudian-messages') ?? messagesEl;
      const items = root.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR);
      const last = items.length ? items[items.length - 1] : null;
      if (!last) return token; // 対象欠落 → 静かにスキップ（設計 5.3）
      last.classList.add(ACTIVE_CLASS);
      const color = cfg.tts.mdReadHighlight?.highlightColor;
      if (color) last.style.setProperty('background', color);
      current = last;
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      console.warn('[cb-chat-highlight] activate error:', e);
    }
    return token;
  };

  const deactivate = (token: number): void => {
    if (token !== latestToken) return; // 割り込み済み → 何もしない
    clear();
  };

  return { activate, deactivate };
}
```

`styles.css` の末尾に追記:

```css
/* =========================================
 * v0.49.0 (F-050): チャット読上げハイライト（メッセージ単位）
 * ========================================= */
.claudian-message-assistant.cb-chat-read-active {
  background: rgba(255, 230, 128, 0.18);
  border-left: 3px solid #e6b800;
  border-radius: 6px;
  transition: background 0.3s ease;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/chat-read-highlight.test.ts && npm run typecheck`
Expected: 6 テスト PASS・typecheck 0

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/chat-read-highlight/index.ts styles.css tests/features/tts/chat-read-highlight.test.ts
git commit -m "feat(F050): chat-read-highlight モジュール新設（メッセージ単位ハイライト + 世代ガード）"
```

---

### Task 4: `auto-read.ts` への配線

**Files:**
- Modify: `src/features/tts/auto-read.ts`

**Interfaces:**
- Consumes: Task 3 の `createChatReadHighlighter` / `ChatReadHighlighter`（`activate: (el: Element) => number`・`deactivate: (token: number) => void`）
- Produces: なし（外部 API 変更なし — 既存 `setupAutoReadTTS(deps)` シグネチャ維持）

- [ ] **Step 1: 失敗するテストを auto-read.test.ts に追加**

`tests/features/tts/auto-read.test.ts` に追記。既存ヘルパー（`makeView` / `makeApp` / `makeStore`）を流用する。`REPORT_HTML` は最後の assistant メッセージが最終回答として検出される既存パターン:

```ts
describe('チャット読上げハイライト連動 (v0.49.0 / F-050)', () => {
  it('自動読み上げ中に最後の assistant メッセージがハイライトされ、完了で解除される', async () => {
    const { setupAutoReadTTS } = await import('../../../src/features/tts/auto-read');
    let resolveSpeak: (v: boolean) => void = () => {};
    const speak = vi.fn(() => new Promise<boolean>((res) => { resolveSpeak = res; }));
    const view = makeView(REPORT_HTML);
    const app = makeApp([view]);
    const store = makeStore({ enabled: true, scope: 'full' });
    const stop = setupAutoReadTTS({ app: app.app as never, store: store as never, speak });
    const fire = () => view.callbacks.onTabStreamingChanged?.('tab1', false);
    fire();
    await vi.waitFor(() => expect(speak).toHaveBeenCalled());
    const last = view.containerEl.querySelector('.claudian-message-assistant') as HTMLElement;
    expect(last.classList.contains('cb-chat-read-active')).toBe(true); // 読み上げ中
    resolveSpeak(true); // 読み上げ完了
    await vi.waitFor(() => expect(last.classList.contains('cb-chat-read-active')).toBe(false));
    stop();
  });
});
```

注意: 既存 `makeStore` のシグネチャ（autoRead 設定のみ受ける場合）に合わせ、`tts.chatReadHighlight: { enabled: true }` と `tts.mdReadHighlight` を含むオブジェクトを返すよう調整すること（既存テストの store 生成関数が `DEFAULT` をベースに部分的なオーバーライドをしている場合は最小変更で可）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/auto-read.test.ts`
Expected: 新規テストのみ FAIL（ハイライトされない）

- [ ] **Step 3: auto-read.ts を修正**

`src/features/tts/auto-read.ts` — import に追加:

```ts
import { createChatReadHighlighter } from './chat-read-highlight';
```

`setupAutoReadTTS` 冒頭（L51 付近・`enqueue` 生成前）を以下のように変更 — `speak` をハイライトラッパーで包んでから `createLatestWinsSpeaker` に渡す:

```ts
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });
  // v0.49.0 (F-050): チャット読上げハイライト。speak を薄くラップし、
  // activate → speak → finally deactivate のライフサイクルで確実に解除する
  // （完了・失敗・後勝ち割り込み・手動停止の全経路を finally が網羅）。
  const highlighter = createChatReadHighlighter({ store: deps.store });
  let highlightTargetEl: Element | null = null;
  const speakWithHighlight: SpeakFn = (text: string) => {
    const token = highlightTargetEl ? highlighter.activate(highlightTargetEl) : -1;
    return deps.speak(text).finally(() => {
      if (token >= 0) highlighter.deactivate(token);
    });
  };
  const enqueue = createLatestWinsSpeaker(speakWithHighlight, stopAllPlayback);
```

`tryExtract` の `state === 'ready'` 分岐（`const text = extractReportText(...)` の直後・`if (text)` ブロック内）を修正 — `enqueue(text)` の前に対象要素を記録:

```ts
        if (text) {
          notice(`🔊 自動読み上げ: ${text.length} 文字を読み上げます`);
          // v0.49.0 (F-050): 読み上げ対象のメッセージ領域をハイライトに渡す
          highlightTargetEl = messages;
          enqueue(text);
          return;
        }
```

- [ ] **Step 4: テストが通ることを確認（既存 auto-read テストも含む）**

Run: `npx vitest run tests/features/tts/auto-read.test.ts && npm run typecheck`
Expected: 全 PASS・typecheck 0（既存テストは `deps.speak` の Promise を await していれば影響なし。`speak` モックが `Promise.resolve(true)` を返す形であれば finally 追加で壊れない）

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/auto-read.ts tests/features/tts/auto-read.test.ts
git commit -m "feat(F050): 自動読み上げとチャットハイライトを連動（speak ラップ + finally 解除）"
```

---

### Task 5: 設定 UI トグル + i18n キー

**Files:**
- Modify: `src/core/i18n.ts`（interface L232 付近 + 3 ロケール）
- Modify: `src/settings/SettingTabTts.ts`（L669 の mdReadHighlight トグル直後）

**Interfaces:**
- Consumes: Task 2 の `tts.chatReadHighlight`
- Produces: i18n キー `ttsChatReadHighlightEnabled: string`（3 ロケール必須）

- [ ] **Step 1: i18n にキーを追加（4 箇所）**

`src/core/i18n.ts`:

1. インターフェース（L233 `ttsMdReadHighlightHighlightColor: string;` の直後）:

```ts
  ttsChatReadHighlightEnabled: string;
```

2. ja ブロック（L736-737 付近の直後）:

```ts
    ttsChatReadHighlightEnabled: 'Claudian 画面の自動読み上げ中にメッセージをハイライト',
```

3. en ブロック（L1234-1235 付近の直後）:

```ts
    ttsChatReadHighlightEnabled: 'Highlight the message during Claudian auto-read',
```

4. zh ブロック（L1727-1728 付近の直後）:

```ts
    ttsChatReadHighlightEnabled: 'Claudian 自动朗读时高亮对应消息',
```

- [ ] **Step 2: SettingTabTts にトグルを追加**

`src/settings/SettingTabTts.ts` — mdReadHighlight 有効トグル（L650-669）の直後に追加:

```ts
    // v0.49.0 (F-050): Claudian 画面の自動読み上げハイライト
    new Setting(containerEl)
      .setName(s.ttsChatReadHighlightEnabled)
      .addToggle((t) =>
        t
          .setValue(cfg.tts.chatReadHighlight?.enabled ?? true)
          .onChange((v) => {
            const latest = store.load();
            store.save({
              ...latest,
              tts: { ...latest.tts, chatReadHighlight: { enabled: v } },
            });
          }),
      );
```

- [ ] **Step 3: テスト + typecheck**

Run: `npx vitest run tests/features/tts/lang.test.ts tests/features/tts/core-lang-consistency.test.ts && npm run typecheck`
Expected: PASS・typecheck 0（キー欠落があれば lang テストが失敗する）

- [ ] **Step 4: Commit**

```bash
git add src/core/i18n.ts src/settings/SettingTabTts.ts
git commit -m "feat(F050): チャット読上げハイライトの設定トグル追加（i18n 3 ロケール）"
```

---

### Task 6: MD 画面ビューヘッダ Add to TTS ボタン（F-051）

**Files:**
- Modify: `src/features/tts/md-file-read.ts`（末尾に `setupMdViewButton` を追加）
- Modify: `src/main.ts`（L348-349 の `setupMdFileRead` 登録直後）
- Test: `tests/features/tts/md-view-button.test.ts`

**Interfaces:**
- Consumes: `addMdToTts(app, file, cfg)`（同ファイルが既に import — `src/features/tts/md-file-read-flow.ts`）
- Produces: `setupMdViewButton(app: App, store: ConfigStore): () => void`（main.ts が消費）

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/md-view-button.test.ts` を新規作成:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMdViewButton } from '../../../src/features/tts/md-file-read';
import type { ConfigStore } from '../../../src/core/config-store';

function makeLeaf(file: { extension?: string } | null) {
  const actionBtn = document.createElement('div');
  const view = {
    file,
    containerEl: document.createElement('div'),
    addAction: vi.fn(() => actionBtn),
  };
  return { view, actionBtn, leaf: { view } };
}

function makeApp(leaves: Array<{ view: unknown }>) {
  const listeners: Array<() => void> = [];
  return {
    app: {
      workspace: {
        getLeavesOfType: vi.fn(() => leaves),
        on: (_n: string, cb: () => void) => { listeners.push(cb); return {}; },
        offref: vi.fn(),
      },
    } as never,
    fireLayoutChange: () => listeners.forEach((cb) => (cb as () => void)()),
    listeners,
  };
}

function makeStore(): ConfigStore {
  return { load: () => ({}) } as unknown as ConfigStore;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupMdViewButton (v0.49.0 / F-051)', () => {
  it('md ファイルの view に Add to TTS ボタンを追加する', () => {
    const { view } = makeLeaf({ extension: 'md' });
    const app = makeApp([makeLeaf({ extension: 'md' }).leaf]);
    // leaf.view と view を同一にするため差し替え
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).toHaveBeenCalledWith('volume-2', expect.any(String), expect.any(Function));
    stop();
  });

  it('非 md ファイルには追加しない', () => {
    const { view } = makeLeaf({ extension: 'png' });
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).not.toHaveBeenCalled();
    stop();
  });

  it('マーカー済み（重複）の場合は追加しない（冪等）', () => {
    const { view, actionBtn } = makeLeaf({ extension: 'md' });
    actionBtn.setAttribute('data-cb-add-tts', '1');
    view.containerEl.appendChild(actionBtn);
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).not.toHaveBeenCalled();
    stop();
  });

  it('クリックで addMdToTts 経由の読み上げフローが走る（file 欠落時はスキップ）', () => {
    const { view } = makeLeaf(null);
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    const [, , cb] = (view.addAction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(() => (cb as () => void)()).not.toThrow(); // file=null → 静かにスキップ
    stop();
  });

  it('addAction が存在しない view では無害動作', () => {
    const leaf = { view: { file: { extension: 'md' }, containerEl: document.createElement('div') } };
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [leaf]);
    expect(() => setupMdViewButton(app.app, makeStore())).not.toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/md-view-button.test.ts`
Expected: FAIL（`setupMdViewButton` が存在しない）

- [ ] **Step 3: md-file-read.ts に setupMdViewButton を実装**

`src/features/tts/md-file-read.ts` — import に `TFile` は既存、`addMdToTts` も既存のため新規 import は不要。ファイル末尾（`setupMdFileRead` の後）に追加:

```ts
/**
 * v0.49.0 (F-051): MD 画面ビューヘッダ右上に「Add to TTS」ボタンを追加。
 * 既存アイコン（✏️ 編集/読切切替・⋮ メニュー）の左側に addAction で描画される
 * （ItemView.addAction 公開 API・DOM ハック不要）。クリック動作は右クリック
 * メニューと同一経路（addMdToTts）のためハイライト連動も自動的に有効。
 */
export function setupMdViewButton(app: App, store: ConfigStore): () => void {
  const s = getLocaleStrings(getUILanguage());
  const MARKER = 'data-cb-add-tts';

  const scan = (): void => {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as unknown as {
        file?: { extension?: string } | null;
        addAction?: (icon: string, title: string, cb: () => void) => HTMLElement | void;
        containerEl?: HTMLElement;
      } | null;
      if (!view || view.file?.extension !== 'md') continue;
      if (typeof view.addAction !== 'function') continue; // 将来の API 変更に備えたガード
      if (view.containerEl?.querySelector(`[${MARKER}]`)) continue; // 冪等ガード
      const el = view.addAction('volume-2', s.ttsAddToTts, () => {
        const f = view.file;
        if (!f) return; // 新規空タブ等 → 静かにスキップ
        void (async () => {
          try {
            await addMdToTts(app, f as TFile, store.load());
          } catch (e) {
            console.warn('[cb-md-read] view-button failed:', e);
            new Notice(`⚠️ MD 読み上げ失敗: ${(e as Error).message}`);
          }
        })();
      });
      if (el && typeof (el as HTMLElement).setAttribute === 'function') {
        (el as HTMLElement).setAttribute(MARKER, '1');
      } else if (view.containerEl) {
        // addAction が要素を返さない環境ではアクション領域の最後の要素にマーカー
        const last = view.containerEl.querySelector('.view-actions')?.lastElementChild;
        last?.setAttribute(MARKER, '1');
      }
    }
  };

  scan();
  const evRef = app.workspace.on('layout-change', scan);
  return () => { app.workspace.offref(evRef); };
}
```

- [ ] **Step 4: main.ts に配線**

`src/main.ts` — L348-349 の直後に追加。import 行は `setupMdFileRead` と同一モジュールからの既存 import に `setupMdViewButton` を追加:

```ts
      // ★ v0.49.0 (F-051): MD 画面ビューヘッダ「Add to TTS」ボタン
      this.register(setupMdViewButton(this.app, this.store));
      diag('md-view-button registered');
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/md-view-button.test.ts tests/features/tts/md-file-read.test.ts && npm run typecheck`
Expected: 全 PASS・typecheck 0

- [ ] **Step 6: Commit**

```bash
git add src/features/tts/md-file-read.ts src/main.ts tests/features/tts/md-view-button.test.ts
git commit -m "feat(F051): MD 画面ビューヘッダ右上に Add to TTS ボタン追加"
```

---

### Task 7: v0.49.0 リリース処理 + 最終検証

**Files:**
- Modify: `manifest.json`（version）
- Modify: `package.json`（version）
- Modify: `versions.json`（`"0.49.0": <minAppVersion>` を追記 — 既存エントリの書式に合わせる）
- Modify: `CHANGELOG.md`（先頭に v0.49.0 エントリ追加）

**Interfaces:**
- Consumes: Task 1〜6 の実装完了
- Produces: v0.49.0 リリース候補

- [ ] **Step 1: CHANGELOG.md に v0.49.0 エントリを追加**

既存エントリの書式（`## [0.48.0]` 等の見出し + Added/Changed セクション）に合わせ、先頭に追加:

```markdown
## [0.49.0] - 2026-09-14

### Added

- **F-050**: チャット読上げハイライト — Claudian 画面の最終回答自動読み上げ中に、読み上げ対象のメッセージブロックをハイライト + スクロール追随（メッセージ単位・設定 `tts.chatReadHighlight.enabled` 既定 ON・ハイライト色は MD 読上げハイライト色を流用）
- **F-051**: MD 画面ビューヘッダ右上（✏️ 編集切替の左）に「Add to TTS」ボタン追加（`ItemView.addAction` 公開 API・クリックで右クリックメニューと同一の読み上げフロー）

### Changed

- 設定タブ「Memory」のラベルに 🧠 アイコンを付与（i18n 3 ロケール）
```

- [ ] **Step 2: バージョン更新**

- `manifest.json`: `"version": "0.49.0"`
- `package.json`: `"version": "0.49.0"`
- `versions.json`: 既存エントリ書式に合わせ `"0.49.0"` を追加

- [ ] **Step 3: リリースゲート + 全検証**

Run: `npm run check:changelog && npm run typecheck && npx vitest run && npm run build`
Expected: check:changelog PASS・typecheck 0・全テスト PASS（新規 +11 件程度で 1359 total 付近）・ビルド成功（deploy も走る）

- [ ] **Step 4: F-番号マスター更新（Vault 側・手動）**

Vault `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/F-number_master.md` に F050 / F051 の行を追加（付与規約: 新規機能は本マスターに追記してからリリース）:

```markdown
| F050 | チャット読上げハイライト | v0.49.0 | Claudian 画面の最終回答自動読み上げ中にメッセージブロックをハイライト + スクロール追随（メッセージ単位・`tts.chatReadHighlight.enabled` 既定 ON・世代トークンで割り込み時の誤解除を防止） | `[[32_チャット読上げハイライト設計]]` |
| F051 | MD 画面ビューヘッダ Add to TTS ボタン | v0.49.0 | MD 画面右上（✏️ の左）に 🔊 ボタン追加（`ItemView.addAction` 公開 API・`layout-change` で冪等追加・クリックで右クリックメニューと同一の `addMdToTts` フロー） | `[[32_チャット読上げハイライト設計]]` |
```

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json versions.json CHANGELOG.md
git commit -m "chore(release): v0.49.0 (F-050 チャット読上げハイライト / F-051 MD画面 Add to TTS ボタン)"
```

- [ ] **Step 6: 実機 UAT（Vault 側・手動確認）**

1. Obsidian で Claudian 画面の自動読み上げを発生させ、メッセージがハイライト + スクロール追随すること
2. 読み上げ完了・✖ 停止・次の応答で割り込みの 3 パターンでハイライトが消えること
3. 設定 → テキスト読み上げに「Claudian 画面の自動読み上げ中にメッセージをハイライト」トグルが出ること・OFF でハイライト非表示
4. MD ファイルを開き、右上 ✏️ の左に 🔊 ボタンが出ること・クリックで読み上げ + ハイライト開始・レイアウト変更後もボタン重複なし
5. 設定タブ一覧に「🧠 Memory」が表示されること
