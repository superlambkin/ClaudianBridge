# メッセージ読上げボタン実装計画（v0.14.0）

> 📂 パス：`03_開発文書/2026-08-15-message-read-button-plan.md`
> 📍 設計：[[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-15-message-read-button-design.md]]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianChat の各メッセージテキストブロックのコピーボタン左隣に読上げボタンを追加し、クリックで該当テキストを `addTextToTTS` 経由で読み上げる。

**Architecture:** 既存の `setupToolbarButtons` と同じ「DOM スキャン + MutationObserver + マーカー属性による重複防止」パターンで、`.claudian-text-block` 内の `.claudian-text-copy-btn` 直前に `<span>` を注入。クリック時は `readVisibleTextExcluding`（既存）でブロックの可視テキストを取得し、依存注入された `speak(text)`（main.ts で `addTextToTTS` に接続）を呼ぶ。`speech_filter` は `addTextToTTS` 内で自動適用。

**Tech Stack:** TypeScript / Obsidian API（`Notice`・`setIcon`）/ vitest + jsdom

## Global Constraints

- バージョン: `0.13.1` → `0.14.0`（package.json・src/manifest.json・versions.json を同時更新）
- `minAppVersion`: `1.7.2`
- 新規ボタンは `.claudian-text-block` 内のコピーボタン**左隣**（`inset-inline-end:22px`）
- 読み上げ範囲は**コピーボタンと同じ**（当該テキストブロック）
- エンジン・音声は既存設定に従う（変更しない）
- テストは vitest + jsdom（`// @vitest-environment jsdom`）
- コミットメッセージ末尾に `Co-Authored-By: Claude <noreply@anthropic.com>` を付与

---

### Task 1: message-read-button モジュール + テスト

**Files:**
- Create: `D:/AI-Agent/ClaudianBridge/src/features/tts/message-read-button.ts`
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/extract-report.ts`（`readVisibleTextExcluding` と `EXCLUDED_FROM_SPEECH` を export）
- Create: `D:/AI-Agent/ClaudianBridge/tests/features/tts/message-read-button.test.ts`

**Interfaces:**
- Consumes: `readVisibleTextExcluding(el: Element, excludeSel: string): string`・`EXCLUDED_FROM_SPEECH: string`（extract-report.ts から export）
- Produces: `setupMessageReadButtons(deps: MessageReadDeps): () => void`
  - `interface MessageReadDeps { app: App; store: ConfigStore; speak: (text: string) => Promise<boolean>; noticeFn?: (m: string) => void }`
  - cleanup 関数（observer 切断 + 注入ボタン削除）

- [ ] **Step 1: extract-report.ts の export 化**

`D:/AI-Agent/ClaudianBridge/src/features/tts/extract-report.ts` を開き、次を編集する：

```ts
// 変更前
function readVisibleTextExcluding(el: Element, excludeSel: string): string {
// 変更後
export function readVisibleTextExcluding(el: Element, excludeSel: string): string {
```

```ts
// 変更前
const EXCLUDED_FROM_SPEECH = '.claudian-thinking-block';
// 変更後
export const EXCLUDED_FROM_SPEECH = '.claudian-thinking-block';
```

- [ ] **Step 2: 失敗するテストを書く**

`D:/AI-Agent/ClaudianBridge/tests/features/tts/message-read-button.test.ts` を作成：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMessageReadButtons } from '../../../src/features/tts/message-read-button';
import type { ConfigStore } from '../../../src/core/config-store';

function makeBlock(body = '<p>読み上げテキスト</p>'): HTMLElement {
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
    load: () => ({
      tts: {
        enabled,
        engine: 'edge',
        voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' } },
        cli: { speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
      },
    }),
  } as unknown as ConfigStore;
}

describe('setupMessageReadButtons', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('コピーボタンの左隣に読上げボタンを 1 つ注入し、cleanup で削除される', () => {
    const block = makeBlock();
    const cleanup = setupMessageReadButtons({ app: {} as never, store: makeStore(), speak: vi.fn(async () => true) });
    const btn = block.querySelector('[data-cb-msg-read]');
    const copyBtn = block.querySelector('.claudian-text-copy-btn');
    expect(btn).not.toBeNull();
    expect(copyBtn).not.toBeNull();
    expect(btn!.nextElementSibling).toBe(copyBtn); // 直前（コピーボタンの左隣）
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(1); // 重複なし
    cleanup();
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(0);
  });

  it('クリックでブロックの可視テキストを speak に渡す', async () => {
    const block = makeBlock('<p>こんにちは</p><p>世界</p>');
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('こんにちは');
    expect(speak.mock.calls[0][0]).toContain('世界');
  });

  it('tts.enabled=false のときは speak を呼ばずミュート通知を出す', () => {
    const block = makeBlock();
    const speak = vi.fn(async () => true);
    const noticeFn = vi.fn();
    setupMessageReadButtons({ app: {} as never, store: makeStore(false), speak, noticeFn });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    expect(speak).not.toHaveBeenCalled();
    expect(noticeFn).toHaveBeenCalledTimes(1);
  });

  it('空テキストのブロックでは speak を呼ばない', () => {
    const block = makeBlock('<p>   </p>');
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    expect(speak).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/message-read-button.test.ts`
Expected: FAIL — `Cannot find module '...message-read-button'`

- [ ] **Step 4: 実装（message-read-button.ts）**

`D:/AI-Agent/ClaudianBridge/src/features/tts/message-read-button.ts` を作成：

```ts
/**
 * v0.14.0: ClaudianChat 結果欄（.claudian-text-block）のコピーボタン左隣に
 * 読上げボタンを注入。クリックで該当ブロックの可視テキストを
 * deps.speak（main.ts では addTextToTTS）へ渡して読み上げる。
 *
 * realclaudian 構造（main.js / styles.css 実測）:
 *   .claudian-text-block                    position:relative
 *     └── .claudian-text-copy-btn           absolute; bottom:0; inset-inline-end:0
 * 読上げボタンは inset-inline-end:22px でコピーボタンの左隣に配置する。
 */
import { Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { readVisibleTextExcluding, EXCLUDED_FROM_SPEECH } from './extract-report';

const TEXT_BLOCK_SELECTOR = '.claudian-text-block';
const COPY_BTN_SELECTOR = '.claudian-text-copy-btn';
const READ_MARK = 'data-cb-msg-read';

export interface MessageReadDeps {
  app: App;
  store: ConfigStore;
  speak: (text: string) => Promise<boolean>;
  noticeFn?: (m: string) => void;
}

export function setupMessageReadButtons(deps: MessageReadDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const inject = (block: HTMLElement): void => {
    if (block.querySelector(`[${READ_MARK}]`)) return;
    const copyBtn = block.querySelector(COPY_BTN_SELECTOR);
    if (!copyBtn) return;
    const btn = document.createElement('span');
    btn.className = 'claudian-text-tts-btn';
    btn.setAttribute(READ_MARK, 'true');
    btn.title = '読み上げ';
    try { setIcon(btn, 'volume-2'); } catch { btn.textContent = '🔊'; }
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void (async () => {
        const cfg = deps.store.load();
        if (!cfg.tts.enabled) { notice('🔇 ミュート中です'); return; }
        const text = readVisibleTextExcluding(
          block,
          `${COPY_BTN_SELECTOR}, [${READ_MARK}], ${EXCLUDED_FROM_SPEECH}`,
        );
        if (!text) return;
        await deps.speak(text);
      })();
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
        if (node instanceof HTMLElement && (node.matches(TEXT_BLOCK_SELECTOR) || node.querySelector(TEXT_BLOCK_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${READ_MARK}]`).forEach((el) => el.remove());
  };
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/message-read-button.test.ts`
Expected: 4 tests PASS

- [ ] **Step 6: 既存テストが壊れていないか確認**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/extract-report.test.ts`
Expected: 11 tests PASS

- [ ] **Step 7: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/tts/extract-report.ts src/features/tts/message-read-button.ts tests/features/tts/message-read-button.test.ts
git commit -m "feat(tts): add message read-aloud button (left of copy button)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: main.ts 配線 + スタイル + バージョン 0.14.0

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/main.ts`（import + 登録）
- Modify: `D:/AI-Agent/ClaudianBridge/styles.css`（`.claudian-text-tts-btn`）
- Modify: `D:/AI-Agent/ClaudianBridge/package.json`・`src/manifest.json`・`versions.json`

**Interfaces:**
- Consumes: `setupMessageReadButtons({ app, store, speak })`（Task 1）・`addTextToTTS(app, text, settings)`（既存 core.ts）
- Produces: 起動時登録（cleanup は `this.register`）、v0.14.0 成果物

- [ ] **Step 1: main.ts に import を追加**

`D:/AI-Agent/ClaudianBridge/src/main.ts` の既存 import（`import { setupAutoReadTTS } from './features/tts/auto-read';` 付近）に追記：

```ts
import { setupMessageReadButtons } from './features/tts/message-read-button';
```

- [ ] **Step 2: main.ts に登録を追加**

`main.ts` の「toolbar fulltext button registered」の `diag` 直後（`this.register(setupToolbarButtons(this.store));` の後）に追記：

```ts
      // ★ v0.14.0: メッセージ結果欄の読上げボタン（コピーボタン左隣）
      this.register(setupMessageReadButtons({
        app: this.app,
        store: this.store,
        speak: async (text) => {
          const cfg = this.store.load();
          if (!cfg.tts.enabled) return false;
          return addTextToTTS(this.app, text, cfg.tts);
        },
      }));
      diag('message read button registered');
```

- [ ] **Step 3: styles.css にスタイル追加**

`D:/AI-Agent/ClaudianBridge/styles.css` の末尾に追記：

```css
/* v0.14.0: メッセージ結果欄の読上げボタン（コピーボタン左隣） */
.claudian-text-tts-btn {
  position: absolute;
  bottom: 0;
  inset-inline-end: 22px;
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
.claudian-text-tts-btn svg {
  width: 16px;
  height: 16px;
}
.claudian-text-block:hover .claudian-text-tts-btn {
  opacity: 1;
}
.claudian-text-tts-btn:hover {
  color: var(--text-normal);
}
```

- [ ] **Step 4: バージョン 0.13.1 → 0.14.0**

- `package.json`: `"version": "0.13.1"` → `"version": "0.14.0"`
- `src/manifest.json`: `"version": "0.13.1"` → `"version": "0.14.0"`
- `versions.json`: 先頭に `"0.14.0": "1.7.2",` を追加

- [ ] **Step 5: typecheck + 全テスト**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck && npm test`
Expected: typecheck 成功・全テスト PASS（440 件 = 439 + message-read-button 4件 − extract-report増分なし。※既存 439 に 4 件追加 → 443 になる想定。実際の PASS 数を確認）

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/main.ts styles.css package.json src/manifest.json versions.json
git commit -m "feat(tts): wire message read-aloud button + v0.14.0

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: ドキュメント更新 + ビルド・デプロイ・検証

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/CHANGELOG.md`
- Modify: `C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`

**Interfaces:**
- Consumes: v0.14.0 成果物

- [ ] **Step 1: CHANGELOG.md に v0.14.0 追記**

`D:/AI-Agent/ClaudianBridge/CHANGELOG.md` の先頭（`# Changelog` 直後）に追記：

```markdown
## [0.14.0] - 2026-08-15
### Added
- メッセージ読上げボタン: ClaudianChat 結果欄の各テキストブロックの**コピーボタン左隣**に読上げボタンを追加
  - クリックで該当ブロックの可視テキストを `addTextToTTS` 経由で読み上げ（speech_filter・ミュート連動は既存踏襲）
  - 範囲はコピーボタンと同じ（当該テキストブロック）
```

- [ ] **Step 2: リリースノートに v0.14.0 節を追記**

`リリースノート.md` の先頭に `# 📢 v0.14.0 リリースノート` 節を追加し、v0.13.1 を `<details>` 履歴へ繰り下げる（既存 v0.13.1 節を `<details><summary>📜 v0.13.1（履歴）</summary>` で包む）。

- [ ] **Step 3: ビルド + デプロイ + ハッシュ確認**

```bash
cd D:/AI-Agent/ClaudianBridge
npm run build
md5sum main.js "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/claudian-bridge/main.js"
```
Expected: ビルド成功・デプロイ成功・両ハッシュ一致・vault manifest が `0.14.0`

- [ ] **Step 4: コミット（CHANGELOG）**

```bash
cd D:/AI-Agent/ClaudianBridge
git add CHANGELOG.md
git commit -m "docs(tts): v0.14.0 release notes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: 実機確認依頼（ユーザー）**

Obsidian をリロードし、ClaudianChat のメッセージ右上（コピーアイコン左）にスピーカーアイコンが出るか、hover 表示か、クリックで読み上げるかを確認。

---

## セルフレビュー（実施済み）

- **Spec 網羅**: 設計書の 3.1（注入）・3.2（クリック）・3.3（observer）・3.4（cleanup）・5（テスト）を Task1/2/3 でカバー
- **Placeholder なし**: 全コードブロックに実コード記載
- **型整合**: `setupMessageReadButtons(deps: MessageReadDeps)`・`MessageReadDeps`・`readVisibleTextExcluding`・`EXCLUDED_FROM_SPEECH` を全 Task で同一シグネチャで参照
