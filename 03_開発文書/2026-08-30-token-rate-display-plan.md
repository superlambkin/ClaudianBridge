# トークン速度（tok/s）表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianBridge v0.30.0 で、realclaudian ホストの Claudian 入力画面下部に LLM 応答のトークン生成速度（tok/s）をライブ表示。設定画面で ON/OFF 切替。

**Architecture:** 新規 `src/features/token-rate/` モジュール。MutationObserver で realclaudian のレスポンス DOM を監視し、250ms インターバルで現在のテキスト長 / 経過時間から tok/s を算出。ストリーミング中のみ表示、終了後 3 秒でフェードアウト。設定は `general.tokenRateEnabled`（既定 false）。

**Tech Stack:** TypeScript / vitest / MutationObserver / Obsidian Plugin API / esbuild

## Global Constraints

- バージョン: v0.30.0（Minor）
- 機能 ID: F024
- テスト: 既存 812 件 + 新規 10 件 = 822 件目標（100% PASS 維持）
- トークン推定: `chars / 3`（CJK + English 混合ヒューリスティック — Claude BPE は CJK で ~1.5 char/token、English で ~4 char/token、平均 ~3）
- DOM セレクタ: realclaudian 構造を実装時に実機検証して決定（リスク #1 参照）
- 設定既定: `general.tokenRateEnabled = false`（明示オプトイン）
- i18n: 日本語（既定）/ English
- ライセンス・依存追加: なし
- TDD: RED → GREEN → commit を厳守

---

### Task 1: 設定 + i18n + 配線

**Files:**
- Modify: `src/core/settings.ts`（`general.tokenRateEnabled` 追加 + default + migration + validation）
- Modify: `src/core/i18n.ts`（`tokenRateLabel/Desc/Suffix` 追加）
- Modify: `src/settings/SettingTabGeneral.ts`（toggle 項目追加）
- Modify: `src/main.ts`（`setupTokenRate` の import + onload/onunload 配線）
- Test: （次タスクで実装）

**Interfaces:**
- `ClaudianBridgeSettings['general']['tokenRateEnabled']: boolean`
- `setupTokenRate(app: App, store: ConfigStore): () => void`

- [ ] **Step 1: settings.ts に tokenRateEnabled を追加**

`src/core/settings.ts` の `ClaudianBridgeSettings` 型に追加:
```ts
tokenRateEnabled: boolean;
```

`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general` に:
```ts
tokenRateEnabled: false,
```

マイグレーション関数（`migrateSettings` 等、既存パターンに合わせる）:
```ts
tokenRateEnabled: typeof r.general?.tokenRateEnabled === 'boolean'
  ? r.general.tokenRateEnabled : false,
```

バリデーション:
```ts
if (typeof cfg.general.tokenRateEnabled !== 'boolean')
  return 'general.tokenRateEnabled は boolean である必要があります';
```

- [ ] **Step 2: i18n.ts に tokenRate* キーを追加**

`src/core/i18n.ts` の `LocaleStrings` インターフェースと各言語定義に追加:
```ts
tokenRateLabel: 'トークン速度を表示',
tokenRateDesc: 'レスポンス生成速度を入力画面の下にライブ表示します',
tokenRateSuffix: 'tok/s',
```

English 定義:
```ts
tokenRateLabel: 'Show token rate',
tokenRateDesc: 'Display live token generation rate below input',
tokenRateSuffix: 'tok/s',
```

- [ ] **Step 3: SettingTabGeneral.ts に toggle 項目を追加**

既存パターンに従い、`renderGeneralTab` 内の `quickReplyEnabled` toggle の近くに追加:
```ts
new Setting(containerEl)
  .setName(s.tokenRateLabel)
  .setDesc(s.tokenRateDesc)
  .addToggle((t) =>
    t.setValue(store.load()?.general?.tokenRateEnabled ?? false)
     .onChange(async (v) => {
       await store.update({ general: { ...cfg.general, tokenRateEnabled: v } });
     }),
  );
```

import 確認: `Setting` from 'obsidian' が既にあることを想定（既存パターン踏襲）。

- [ ] **Step 4: main.ts に setupTokenRate 呼び出しを追加**

```ts
import { setupTokenRate } from './features/token-rate';

// onload 内、既存 setupXxx() 群と同じブロックに:
const offTokenRate = setupTokenRate(this.app, this.store);

// onunload 内:
offTokenRate?.();
```

※ この時点では `src/features/token-rate/index.ts` が未実装のため、import で TypeScript エラーになる。Task 3 で作成後にこの Step が成立する。実装時は Task 1 → Task 2 → Task 3 の順で、最後に Step 4 を確定すること。

- [ ] **Step 5: TypeScript 型チェック**

実行: `npm run typecheck`
期待結果: Task 1-4 完了時点で `src/features/token-rate/index.ts` が未実装なら import エラー。Task 3 完了後に通過。

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/core/settings.ts src/core/i18n.ts src/settings/SettingTabGeneral.ts src/main.ts
git commit -m "feat(POC_017): token rate 表示設定・i18n・配線（F024 v0.30.0 準備）

- settings.ts: general.tokenRateEnabled 追加（既定 false）
- i18n.ts: tokenRateLabel/Desc/Suffix 追加（ja/en）
- SettingTabGeneral.ts: toggle 項目追加
- main.ts: setupTokenRate 呼び出し追加（Task 3 で index.ts 実装後に成立）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: counter.ts（RED → GREEN）— 計測ロジック本体

**Files:**
- Create: `src/features/token-rate/counter.ts`
- Test: `tests/features/token-rate/counter.test.ts`

**Interfaces:**
- `TokenRateState` / `CounterOptions` / `createTokenRateCounter()`

- [ ] **Step 1: RED テスト先行作成**

`tests/features/token-rate/counter.test.ts` を作成。`tests/features/token-rate/` ディレクトリも新規作成。

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTokenRateCounter } from '../../../src/features/token-rate/counter';

describe('createTokenRateCounter', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('初期化直後は startTime=null, rate=0', () => {
    const c = createTokenRateCounter(container);
    const s = c.getState();
    expect(s.startTime).toBeNull();
    expect(s.rate).toBe(0);
    expect(s.isStreaming).toBe(false);
    c.destroy();
  });

  it('start() で startTime がセットされる', () => {
    const c = createTokenRateCounter(container);
    c.start();
    const s = c.getState();
    expect(s.startTime).not.toBeNull();
    c.destroy();
  });

  it('DOM テキスト追加で currentChars が増える', async () => {
    const c = createTokenRateCounter(container);
    c.start();
    // target ノード作成 + 監視開始
    const target = document.createElement('div');
    target.className = 'claudian-message';
    target.setAttribute('data-role', 'assistant');
    document.body.appendChild(target);
    // counter の MutationObserver に target を登録（実装依存、ここでは仮）
    target.textContent = 'Hello world';
    await vi.waitFor(() => {
      expect(c.getState().currentChars).toBeGreaterThan(0);
    }, { timeout: 500 });
    c.destroy();
  });

  it('速度計算: 250ms で 60 chars 追加 → 約 80 tok/s', async () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const target = document.createElement('div');
    document.body.appendChild(target);
    target.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(250);
    const rate = c.getState().rate;
    expect(rate).toBeGreaterThan(70);
    expect(rate).toBeLessThan(90);
    vi.useRealTimers();
    c.destroy();
  });

  it('ゼロ除算防止: 経過時間 0 で rate が NaN にならない', () => {
    const c = createTokenRateCounter(container);
    c.start();
    // DOM 変更なしで state.rate を確認
    expect(Number.isNaN(c.getState().rate)).toBe(false);
    c.destroy();
  });

  it('stop() でフェードアウト: 3 秒後に .is-fading', async () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { fadeOutMs: 3000 });
    c.start();
    c.stop();
    vi.advanceTimersByTime(3100);
    expect(container.querySelector('.cb-token-rate')?.classList.contains('is-fading')).toBe(true);
    vi.useRealTimers();
    c.destroy();
  });

  it('destroy() で MutationObserver disconnect + DOM 要素削除', () => {
    const c = createTokenRateCounter(container);
    c.start();
    expect(container.querySelector('.cb-token-rate')).not.toBeNull();
    c.destroy();
    expect(container.querySelector('.cb-token-rate')).toBeNull();
  });
});
```

- [ ] **Step 2: テスト実行で RED 確認**

実行: `npx vitest run tests/features/token-rate/counter.test.ts`
期待結果: 7 failed（counter.ts 未実装のため module not found）

- [ ] **Step 3: counter.ts 実装（GREEN）**

```ts
// src/features/token-rate/counter.ts
export interface TokenRateState {
  startTime: number | null;
  startChars: number;
  currentChars: number;
  lastUpdateTime: number;
  lastTokens: number;
  rate: number;
  isStreaming: boolean;
}

export interface CounterOptions {
  charPerToken?: number;
  intervalMs?: number;
  fadeOutMs?: number;
}

const DEFAULTS: Required<CounterOptions> = {
  charPerToken: 3,
  intervalMs: 250,
  fadeOutMs: 3000,
};

export function createTokenRateCounter(
  containerEl: HTMLElement,
  options: CounterOptions = {},
) {
  const opts = { ...DEFAULTS, ...options };
  const state: TokenRateState = {
    startTime: null,
    startChars: 0,
    currentChars: 0,
    lastUpdateTime: 0,
    lastTokens: 0,
    rate: 0,
    isStreaming: false,
  };

  // 表示要素
  const el = document.createElement('div');
  el.className = 'cb-token-rate';
  el.innerHTML = `<span class="cb-token-rate-value">0.0 tok/s</span><span class="cb-token-rate-dot"></span>`;
  containerEl.appendChild(el);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastChangeTime = 0;

  const readChars = (): number => {
    // 監視対象: .claudian-message[data-role="assistant"]:last-of-type
    const target = document.querySelector('.claudian-message[data-role="assistant"]:last-of-type');
    return target ? (target.textContent?.length ?? 0) : state.currentChars;
  };

  const tick = (): void => {
    const chars = readChars();
    const tokens = chars / opts.charPerToken;
    const now = Date.now();
    if (state.startTime === null) {
      state.startTime = now;
      state.startChars = chars;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    } else {
      const dt = (now - state.lastUpdateTime) / 1000;
      const dTokens = tokens - state.lastTokens;
      state.rate = dt > 0 ? dTokens / dt : 0;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    }
    state.currentChars = chars;
    state.isStreaming = now - lastChangeTime < 2500;
    el.classList.toggle('is-streaming', state.isStreaming);
    el.querySelector('.cb-token-rate-value')!.textContent = `${state.rate.toFixed(1)} ${'tok/s'}`;
  };

  const handleMutation = (): void => {
    lastChangeTime = Date.now();
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    el.classList.remove('is-fading');
    state.isStreaming = true;
  };

  const start = (): void => {
    lastChangeTime = Date.now();
    observer = new MutationObserver(handleMutation);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    intervalId = setInterval(tick, opts.intervalMs);
  };

  const stop = (): void => {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    state.isStreaming = false;
    el.classList.remove('is-streaming');
    fadeTimer = setTimeout(() => el.classList.add('is-fading'), opts.fadeOutMs);
  };

  const destroy = (): void => {
    if (intervalId !== null) clearInterval(intervalId);
    if (observer) observer.disconnect();
    if (fadeTimer) clearTimeout(fadeTimer);
    el.remove();
  };

  return { start, stop, destroy, getState: () => ({ ...state }) };
}
```

- [ ] **Step 4: テスト実行で GREEN 確認**

実行: `npx vitest run tests/features/token-rate/counter.test.ts`
期待結果: 7 passed

- [ ] **Step 5: 全テスト実行で回帰なし確認**

実行: `npm test`
期待結果: 既存 812 件 + 新規 7 件 = 819 件 PASS

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/token-rate/counter.ts tests/features/token-rate/counter.test.ts
git commit -m "feat(POC_017): token rate counter.ts 実装（RED→GREEN, 7/7 PASS）

- createTokenRateCounter: MutationObserver + 250ms インターバルで tok/s 計算
- chars / 3 ヒューリスティック（混合 CJK/English 平均）
- フェードアウト: stop() 後 fadeOutMs (3000) で .is-fading
- destroy() で Observer disconnect + DOM 要素削除
- 7 テスト全 PASS（初期化 / start / DOM 変更 / 速度計算 / NaN 防止 / fade / destroy）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: index.ts（RED → GREEN）— setupTokenRate エントリ + counter.css

**Files:**
- Create: `src/features/token-rate/index.ts`
- Create: `src/features/token-rate/counter.css`
- Test: `tests/features/token-rate/index.test.ts`
- Modify: `src/main.ts`（`setupTokenRate` 呼び出しが既に Task 1 Step 4 で追加されているはず — 確認のみ）

- [ ] **Step 1: counter.css 作成**

`src/features/token-rate/counter.css`:

```css
.cb-token-rate {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  border-top: 1px solid var(--background-modifier-border);
  transition: opacity 500ms ease-out;
}
.cb-token-rate.is-streaming .cb-token-rate-dot {
  background: var(--color-accent);
  animation: cb-token-rate-pulse 1s ease-in-out infinite;
}
.cb-token-rate.is-fading {
  opacity: 0;
}
.cb-token-rate-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}
@keyframes cb-token-rate-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

- [ ] **Step 2: index.ts RED テスト先行作成**

`tests/features/token-rate/index.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupTokenRate } from '../../../src/features/token-rate';
import { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
}));

describe('setupTokenRate', () => {
  let storeMock: { load: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    document.body.innerHTML = '';
    storeMock = { load: vi.fn(), update: vi.fn() };
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('設定 OFF で非注入', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: false } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    // .claudian-input-container を作成
    const c = document.createElement('div');
    c.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    c.appendChild(messages);
    document.body.appendChild(c);
    expect(document.querySelector('.cb-token-rate')).toBeNull();
    cleanup();
  });

  it('設定 ON で .claudian-messages 直後に注入', async () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    container.appendChild(messages);
    document.body.appendChild(container);
    await vi.waitFor(() => {
      expect(messages.nextElementSibling?.classList.contains('cb-token-rate')).toBe(true);
    });
    cleanup();
  });

  it('クリーンアップで全 counter destroy', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    container.appendChild(messages);
    document.body.appendChild(container);
    expect(document.querySelector('.cb-token-rate')).not.toBeNull();
    cleanup();
    // 全 .cb-token-rate 要素が削除される（fadeOut 待たず即時）
    expect(document.querySelector('.cb-token-rate')).toBeNull();
  });
});
```

- [ ] **Step 3: テスト実行で RED 確認**

実行: `npx vitest run tests/features/token-rate/index.test.ts`
期待結果: 3 failed（index.ts 未実装）

- [ ] **Step 4: index.ts 実装（GREEN）**

```ts
// src/features/token-rate/index.ts
import type { App } from 'obsidian';
import { createTokenRateCounter } from './counter';
import type { ConfigStore } from '../../core/config-store';

const CONTAINER_SELECTOR = '.claudian-input-container';
const MESSAGES_SELECTOR = '.claudian-messages';

interface CounterHandle {
  destroy: () => void;
}

export function setupTokenRate(
  app: App,
  store: ConfigStore,
): () => void {
  const counters = new Map<Element, CounterHandle>();
  const loadEnabled = (): boolean => {
    try {
      const cfg = store.load() as { general?: { tokenRateEnabled?: boolean } } | null;
      return cfg?.general?.tokenRateEnabled ?? false;
    } catch {
      return false;
    }
  };

  const injectAll = (): void => {
    if (!loadEnabled()) return;
    document.querySelectorAll(CONTAINER_SELECTOR).forEach((container) => {
      const messages = container.querySelector(MESSAGES_SELECTOR);
      if (!messages) return;
      if (counters.has(container)) return;
      const counterEl = document.createElement('div');
      messages.parentElement?.insertBefore(counterEl, messages.nextSibling);
      const counter = createTokenRateCounter(counterEl);
      counter.start();
      counters.set(container, counter);
    });
  };

  const removeAll = (): void => {
    counters.forEach((c) => c.destroy());
    counters.clear();
  };

  const rescan = (): void => {
    if (!loadEnabled()) { removeAll(); return; }
    // 削除されたコンテナの counter を破棄
    counters.forEach((_, el) => {
      if (!document.contains(el)) counters.get(el)?.destroy();
    });
    injectAll();
  };

  injectAll();

  const observer = new MutationObserver(() => rescan());
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    removeAll();
  };
}
```

- [ ] **Step 5: テスト実行で GREEN 確認**

実行: `npx vitest run tests/features/token-rate/index.test.ts`
期待結果: 3 passed

- [ ] **Step 6: 全テスト実行で回帰なし確認**

実行: `npm test`
期待結果: 既存 812 件 + 既存 7 件 + 新規 3 件 = 822 件 PASS

- [ ] **Step 7: main.ts の import が成立しているか確認**

`src/main.ts` に Task 1 Step 4 で追加した `import { setupTokenRate } from './features/token-rate';` が生きていることを確認。

実行: `npm run typecheck`
期待結果: エラーなし

- [ ] **Step 8: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/token-rate/index.ts src/features/token-rate/counter.css tests/features/token-rate/index.test.ts
git commit -m "feat(POC_017): token rate setupTokenRate() 配線 + counter.css

- index.ts: .claudian-input-container 内の .claudian-messages 直後に注入
- 設定 OFF: 非注入 / 設定 ON: 各コンテナの messages 直後に counter 注入
- MutationObserver で body 監視 → 新規/削除 Claudian インスタンスに対応
- cleanup で全 counter destroy + Observer disconnect
- counter.css: 12px / --text-muted / streaming 中はドットパルス / フェード 500ms
- 3 テスト全 PASS（設定 OFF / 設定 ON 注入 / クリーンアップ）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: ドキュメント更新 + リリース v0.30.0

**Files:**
- Modify: `src/manifest.json`（version 0.29.1 → 0.30.0）
- Modify: `package.json`（version 0.29.1 → 0.30.0）
- Modify: `versions.json`（`{"0.30.0": "1.7.2"}` 追加）
- Modify: `CHANGELOG.md`（v0.30.0 エントリ追加）
- Modify: `01_要件定義/01_機能要件.md`（F024 追加）
- Modify: `02_設計文書/2026-08-18-claudian-chat-quick-reply-buttons-design.md`（影響なし、必要なら参照追記のみ）
- Modify: `08_説明書/03_リリースノート/リリースノート.md`（v0.30.0 エントリ追加）
- Modify: `08_説明書/03_リリースノート/バージョン履歴.md`（v0.30.0 行追加）
- Modify: `README.md`（v1.12.0 → v1.13.0、テスト数更新、F024 追記）

- [ ] **Step 1: バージョン番号を v0.30.0 に更新**

`manifest.json` の `"version"` を `"0.30.0"` に。
`package.json` の `"version"` を `"0.30.0"` に。
`versions.json` の先頭に `"0.30.0": "1.7.2",` を追加。

- [ ] **Step 2: CHANGELOG.md に v0.30.0 エントリ追加**

ファイル先頭に:

```markdown
## [0.30.0] - 2026-08-30 — トークン速度（tok/s）表示 (F024)

### Added

- **トークン速度のライブ表示**: LLM 応答のトークン生成速度（tok/s）を Claudian 入力画面下部にライブ表示
  - `.claudian-input-container` 内のレスポンスエリア（`.claudian-messages`）直後に挿入
  - MutationObserver で応答 DOM のテキスト長を追跡、250ms ごとに `chars / 3 / 0.25s` で tok/s 算出
  - ストリーミング中は `12.3 tok/s ●` のライブ更新、終了後 3 秒でフェードアウト
  - 設定 `general.tokenRateEnabled`（既定 OFF）で明示オプトイン
  - トークン推定: 文字数 / 3（混合 CJK/English のヒューリスティック）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **822 件 PASS**（v0.29.1 の 812 件 + 新規 10 件） |
| 影響範囲 | `src/features/token-rate/`（新規 3 ファイル）/ `src/core/settings.ts` / `src/core/i18n.ts` / `src/settings/SettingTabGeneral.ts` / `src/main.ts` |
```

- [ ] **Step 3: 機能要件 F024 追加**

`01_要件定義/01_機能要件.md` の機能一覧表に追加:

```markdown
| F024 | トークン速度（tok/s）表示 | `general.tokenRateEnabled` で LLM 応答のトークン生成速度を入力画面下部にライブ表示 | v0.30.0 |
```

必要なら F024 詳細セクションを追加。

- [ ] **Step 4: ユーザーマニュアル（クイックスタート）追記**

`08_説明書/02_ユーザーマニュアル/クイックスタート.md` の「機能入口」表に v0.29.0 の次に追加:

```markdown
| トークン速度（tok/s）表示 | 入力画面の下に応答速度をライブ表示します（v0.30.0〜） |
```

- [ ] **Step 5: リリースノート + バージョン履歴を更新**

`08_説明書/03_リリースノート/リリースノート.md` の先頭に:

```markdown
## v0.30.0（2026-08-30）— トークン速度（tok/s）表示

### 追加

- **トークン速度のライブ表示**: LLM 応答のトークン生成速度（tok/s）を Claudian 入力画面下部に表示
  - ストリーミング中は `12.3 tok/s ●` のライブ更新
  - 終了後 3 秒でフェードアウト
  - 設定画面で ON/OFF（既定 OFF）

### ファイル

- `src/features/token-rate/`（新規: counter.ts / counter.css / index.ts）

→ 詳細: [[../CHANGELOG|CHANGELOG]]
```

frontmatter も更新:
- `version: 1.9.0` → `1.10.0`
- `modified: 2026-08-30`（据置）

`08_説明書/03_リリースノート/バージョン履歴.md` の末尾に追加:

```markdown
| v0.30.0 | 2026-08-30 | Minor | トークン速度（tok/s）のライブ表示を追加 (F024) |
```

frontmatter 更新:
- `version: 1.6.0` → `1.7.0`
- `modified: 2026-08-30`（据置）

- [ ] **Step 6: README.md を v1.13.0 に更新**

frontmatter:
- `version: 1.12.0` → `1.13.0`
- `modified: 2026-08-30`（据置）

「概要」セクション:
- 「現在バージョン」を v0.30.0 に
- 「テスト実績」を 822 件 PASS に

「機能一覧」表に F024 追記:
```markdown
| F024 | トークン速度（tok/s）表示 | `general.tokenRateEnabled` で LLM 応答のトークン生成速度を入力画面下部にライブ表示 | v0.30.0 |
```

「更新履歴」末尾に追加:
```markdown
| v1.13.0 | 2026-08-30 | **v0.30.0 反映**：トークン速度（tok/s）表示を追加 (F024)・テスト 812 → 822 件 | MiuMiu 🐾 |
```

末尾フッタを `v1.13.0 · v0.30.0` に。

- [ ] **Step 7: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/manifest.json package.json versions.json CHANGELOG.md \
        "01_要件定義/01_機能要件.md" \
        "08_説明書/02_ユーザーマニュアル/クイックスタート.md" \
        "08_説明書/03_リリースノート/リリースノート.md" \
        "08_説明書/03_リリースノート/バージョン履歴.md" \
        README.md
git commit -m "docs(POC_017): v0.30.0 リリース文書を反映 (F024)

- manifest.json / package.json を v0.30.0 に
- versions.json に '0.30.0': '1.7.2' 追加
- CHANGELOG.md に v0.30.0 エントリ追加
- 機能要件 F024 追加
- クイックスタートに「トークン速度表示」行追加
- リリースノート v1.9.0 → v1.10.0 + v0.30.0 エントリ
- バージョン履歴 v1.6.0 → v1.7.0 + v0.30.0 行追加
- README.md を v1.13.0 に（テスト 822 件・F024 追記・更新履歴）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ビルド + デプロイ + タグ

**Files:**
- Build: `npm run build`（main.js 生成 + Vault デプロイ）
- Tag: `git tag -a v0.30.0`

- [ ] **Step 1: 最終テスト**

実行: `npm test`
期待結果: 822 件 PASS（1 skipped 含む）

- [ ] **Step 2: ビルド + デプロイ**

実行: `npm run build`
期待結果:
- main.js 生成（warning なし）
- Vault plugin ディレクトリへのデプロイ成功
- manifest version 0.30.0 確認
- `🎉 Deploy complete` メッセージ

- [ ] **Step 3: タグ作成**

```bash
cd D:/AI-Agent/ClaudianBridge
git tag -a v0.30.0 -m "v0.30.0: トークン速度（tok/s）表示 (F024)"
git tag -n5 v0.30.0
```

期待結果: annotated tag が main の最新コミットに付与されている。

- [ ] **Step 4: Vault worktree マージ**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge"
git checkout vault-poc-017  # 既に main を追跡中のはず
git merge --ff-only main    # v0.29.1 → v0.30.0 へ fast-forward
git log --oneline -3
git rev-parse v0.30.0^{commit}
```

期待結果:
- Fast-forward 成功
- HEAD が v0.30.0 タグのコミットと一致
- コンフリクトなし

- [ ] **Step 5: 実機確認（推奨）**

Obsidian をリロードして以下を確認:
1. 設定画面 → 一般タブに「トークン速度を表示」toggle が存在
2. toggle を ON にして Claudian チャットで LLM に質問
3. 入力画面の下（レスポンス下・入力欄の前）に `N.N tok/s ●` がライブ表示される
4. ストリーミング終了後 3 秒でフェードアウト
5. toggle を OFF にして再ロード → 表示されない

---

## Self-Review

### 1. Spec coverage
| Spec requirement | Task |
|------------------|------|
| ストリーミング中ライブ更新 | Task 2（counter.ts tick ロジック）|
| DOM MutationObserver で追跡 | Task 2（handleMutation）|
| 入力画面全体の下（レスポンス下）| Task 3（`.claudian-messages` の `nextSibling` 注入）|
| 設定 ON/OFF トグル | Task 1（settings + SettingTab）+ Task 3（loadEnabled 判定）|
| 既存 812 件回帰なし | Task 2-3（各 `npm test`）|

### 2. Placeholder scan
- "realclaudian の DOM 構造は推定" の旨を Task 2-3 のセレクタ指定箇所で明示（リスク #1 として設計書に記載済み）
- 数値（charPerToken=3, intervalMs=250, fadeOutMs=3000）は全て literal で記載

### 3. Type consistency
- `TokenRateState`, `CounterOptions`, `CounterHandle` の型が Task 2-3 で一貫
- `setupTokenRate(app, store)` の引数・戻り値は Task 1 と Task 3 で一致

### 4. Scope check
- 単一機能（tok/s 表示）のみの 5 タスク。スコープ肥大なし。