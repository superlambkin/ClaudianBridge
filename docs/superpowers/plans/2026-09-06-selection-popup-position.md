# 選択ポップアップ位置設定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MD テキスト選択時に表示される `Add to Claudian` / `Add to TTS` ポップアップの**表示位置**を「右上」または「下」から選択できる設定を追加する（既定 `top-right`）。

**Architecture:** `selection.popupPosition: 'top-right' \| 'bottom'` を `SelectionSettings` に追加し、`positionPopup(popupEl, rect, mode)` の第3引数で配置ロジックを切り替える。`SettingTabSelection.ts` に dropdown を追加し、`watcher.ts` から設定値を渡す。

**Tech Stack:** TypeScript / Obsidian Plugin API / Vitest / esbuild

---

## Global Constraints

| # | 制約 |
|---|------|
| 1 | TypeScript 5.x strict mode（既存プロジェクト設定） |
| 2 | 既存テストは 1 件も壊さない（既存ケースは `mode='bottom'` 明示で動作維持） |
| 3 | `positionPopup` の第3引数 `mode` は省略時 `'top-right'`（新既定） |
| 4 | viewport はみ出し時の margin は 6px を保証（両モード共通） |
| 5 | 既存 CSS（`.cb-popup` の `position: fixed`）に変更を加えない |
| 6 | i18n キーは `selectionPopupPosition*` 形式でキャメルケース（既存パターンに揃える） |
| 7 | バージョンは v0.36.0（マイナー追加：新規設定・既定値追加のため） |
| 8 | コミットメッセージは `feat(scope): ...` / `test(scope): ...` / `docs(scope): ...` 形式（既存ログ準拠） |

---

## File Structure

| ファイル | 変更種別 | 責務 |
|---------|---------|------|
| `src/core/settings.ts` | 修正 | `PopupPosition` 型 + `SelectionSettings.popupPosition` + 既定値 + normalize フォールバック |
| `src/core/i18n.ts` | 修正 | `LocaleStrings` に 4 キー追加（日本語/英語） |
| `src/features/selection/popup.ts` | 修正 | `positionPopup` に第3引数 `mode` 追加、top-right 配置ロジック追加 |
| `src/settings/SettingTabSelection.ts` | 修正 | ポップアップ位置 dropdown を末尾に追加 |
| `src/features/selection/watcher.ts` | 修正 | `positionPopup` 呼び出しに `cfg.selection.popupPosition` を渡す |
| `tests/core/settings.test.ts` | 修正 | popupPosition 既定値 + normalize テスト追加 |
| `tests/features/selection/popup.test.ts` | 修正 | top-right ケース追加、既存テストに `mode` 引数追加 |
| `tests/features/selection/watcher.test.ts` | 修正 | popupPosition 反映テスト追加 |
| `tests/core/i18n.test.ts` | 修正 | 新 i18n キー存在テスト追加 |
| `CHANGELOG.md` | 修正 | v0.36.0 エントリ追加 |
| `src/manifest.json` | 修正 | version: 0.36.0 |
| `data.json` | 修正 | マイナー番号上げ |
| `versions.json` | 修正 | 0.36.0 追加 |
| `08_説明書/03_リリースノート/リリースノート.md` | 修正 | v1.X.0 リリース |
| `03_開発文書/05_進捗ボード.md` | 修正 | F-032 追加・進捗更新 |

---

## Task 1: 設定データモデル拡張（`popupPosition` フィールド追加）

**Files:**
- Modify: `src/core/settings.ts`（`PopupPosition` 型 + `SelectionSettings.popupPosition` + 既定値 + normalize）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: 既存 `SelectionSettings` 型、`normalizeClaudianBridgeSettings`
- Produces: 新規 `PopupPosition` 型（`'top-right' | 'bottom'`）、`SelectionSettings.popupPosition`、`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection.popupPosition: 'top-right'`

---

### Step 1.1: 失敗するテストを追加

`tests/core/settings.test.ts` の `describe('settings', () => { ... })` ブロック内、既存 `selection` 関連テストの近くに以下を追加：

```typescript
  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection.popupPosition は "top-right"', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection.popupPosition).toBe('top-right');
  });

  it('normalize は popupPosition 未指定時に "top-right" を既定とする', () => {
    const norm = normalizeClaudianBridgeSettings({ selection: { delayMs: 400 } });
    expect(norm.selection.popupPosition).toBe('top-right');
  });

  it('normalize は popupPosition="bottom" を保持する', () => {
    const norm = normalizeClaudianBridgeSettings({ selection: { popupPosition: 'bottom' } });
    expect(norm.selection.popupPosition).toBe('bottom');
  });

  it('normalize は popupPosition 不正値を "top-right" にフォールバック', () => {
    const norm = normalizeClaudianBridgeSettings({ selection: { popupPosition: 'left' as never } });
    expect(norm.selection.popupPosition).toBe('top-right');
  });
```

- [ ] **Step 1.2: テストが失敗することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/core/settings.test.ts -t "popupPosition"`
Expected: 4 件全て FAIL（`popupPosition` プロパティ未定義）

- [ ] **Step 1.3: 実装追加**

`src/core/settings.ts` の `SelectionSettings` 型定義を探す（`enabled: boolean; folderEnabled: boolean; delayMs: number; objectMenuEnabled: boolean;` を含む箇所）。

型定義直後に PopupPosition 型を追加：

```typescript
export type PopupPosition = 'top-right' | 'bottom';
```

`SelectionSettings` 型に `popupPosition: PopupPosition;` を追加（`objectMenuEnabled` の直下）。

`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection` オブジェクトの末尾に `popupPosition: 'top-right' as const,` を追加。

`normalizeClaudianBridgeSettings` 内の `selection: { ... }` スプレッド末尾に以下を追加：

```typescript
popupPosition: r.selection?.popupPosition === 'bottom' ? 'bottom' : 'top-right',
```

- [ ] **Step 1.4: テストが成功することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/core/settings.test.ts`
Expected: 既存 + 新規 4 件すべて PASS

- [ ] **Step 1.5: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): selection.popupPosition 追加（既定 'top-right'）

- 背景: 選択ポップアップ位置を 'top-right' と 'bottom' で切替可能に
- 追加: SelectionSettings.popupPosition + normalize フォールバック
- テスト: 既定値・保持・不正値の 4 ケース追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: i18n キー追加

**Files:**
- Modify: `src/core/i18n.ts`（`LocaleStrings` 型 + 日本語既定 + 英語既定に 4 キー）
- Test: `tests/core/i18n.test.ts`

**Interfaces:**
- Consumes: 既存 `LocaleStrings` 型、`ja`/`en`/`zh` 既定オブジェクト
- Produces: `selectionPopupPosition` / `selectionPopupPositionDesc` / `selectionPopupPositionTopRight` / `selectionPopupPositionBottom`

---

### Step 2.1: 失敗するテストを追加

`tests/core/i18n.test.ts` に describe を追加（既存パターン参照）：

```typescript
describe('i18n: selection popup position', () => {
  it('日本語既定に selectionPopupPosition* が含まれる', () => {
    const ja = getLocaleStrings('ja');
    expect(ja.selectionPopupPosition).toMatch(/ポップアップ位置/);
    expect(ja.selectionPopupPositionDesc).toMatch(/テキスト選択時/);
    expect(ja.selectionPopupPositionTopRight).toBe('右上');
    expect(ja.selectionPopupPositionBottom).toBe('下');
  });

  it('英語既定に selectionPopupPosition* が含まれる', () => {
    const en = getLocaleStrings('en');
    expect(en.selectionPopupPosition).toMatch(/popup position/i);
    expect(en.selectionPopupPositionDesc).toMatch(/text selection/i);
    expect(en.selectionPopupPositionTopRight).toBe('Top right');
    expect(en.selectionPopupPositionBottom).toBe('Bottom');
  });
});
```

- [ ] **Step 2.2: テストが失敗することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/core/i18n.test.ts -t "selection popup position"`
Expected: 2 件 FAIL（型に 4 キー未定義）

- [ ] **Step 2.3: i18n.ts に実装追加**

`src/core/i18n.ts` の `LocaleStrings` 型（`selectionEnabled` の近く）に 4 行追加：

```typescript
  selectionPopupPosition: string;
  selectionPopupPositionDesc: string;
  selectionPopupPositionTopRight: string;
  selectionPopupPositionBottom: string;
```

`ja` 既定オブジェクト（`selectionDelayMsDesc` の直後）に追加：

```typescript
    selectionPopupPosition: '🌐 ポップアップ位置',
    selectionPopupPositionDesc: 'テキスト選択時のポップアップ表示位置',
    selectionPopupPositionTopRight: '右上',
    selectionPopupPositionBottom: '下',
```

`en` 既定オブジェクトの同位置に：

```typescript
    selectionPopupPosition: 'Popup position',
    selectionPopupPositionDesc: 'Position of the popup on text selection',
    selectionPopupPositionTopRight: 'Top right',
    selectionPopupPositionBottom: 'Bottom',
```

`zh` 既定オブジェクトの同位置に（既存 zh フォールバックに合わせる）：

```typescript
    selectionPopupPosition: '弹出位置',
    selectionPopupPositionDesc: '文本选择时弹出框的显示位置',
    selectionPopupPositionTopRight: '右上',
    selectionPopupPositionBottom: '下方',
```

- [ ] **Step 2.4: テストが成功することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/core/i18n.test.ts`
Expected: 既存 + 新規 2 件すべて PASS

- [ ] **Step 2.5: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/i18n.ts tests/core/i18n.test.ts
git commit -m "feat(i18n): selectionPopupPosition* 4 キー追加（ja/en/zh）

- 背景: 選択ポップアップ位置設定の UI 文字列
- 追加: 名称・説明・選択肢 2 つ（top-right / bottom）
- テスト: 日本語既定・英語既定の 2 ケース追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `positionPopup` を `mode` 引数対応に拡張

**Files:**
- Modify: `src/features/selection/popup.ts`（`PopupPosition` 型 export + `positionPopup` 第3引数）
- Test: `tests/features/selection/popup.test.ts`

**Interfaces:**
- Consumes: `PopupPosition` 型（settings.ts から re-export）
- Produces: `positionPopup(popupEl, rect, mode?)` シグネチャ（`mode` 既定 `'top-right'`）

---

### Step 3.1: 失敗するテストを追加

`tests/features/selection/popup.test.ts` を以下の通り全面書き換え（既存 4 ケース + 新規 4 ケース）：

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { positionPopup } from '../../../src/features/selection/popup';

function makePopupEl(offsetWidth: number, offsetHeight: number): HTMLElement {
  return { offsetWidth, offsetHeight, style: {} } as unknown as HTMLElement;
}

function setViewport(width: number, height: number): void {
  (globalThis as { window?: { innerWidth: number; innerHeight: number } }).window = { innerWidth: width, innerHeight: height };
}

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

describe('positionPopup - bottom モード（既存互換）', () => {
  it('選択範囲の直下（bottom + 6px）に配置する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 }, 'bottom');
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('226px');
  });

  it('右端にはみ出す場合は左にクランプする', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 950, top: 200, right: 990, bottom: 220 }, 'bottom');
    expect(el.style.left).toBe('894px');
    expect(el.style.top).toBe('226px');
  });

  it('下端にはみ出す場合は選択範囲の上に反転する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 640, right: 300, bottom: 680 }, 'bottom');
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('594px');
  });

  it('クランプ時も margin 未満にはならない', () => {
    setViewport(100, 100);
    const el = makePopupEl(80, 80);
    positionPopup(el, { left: -50, top: 90, right: 50, bottom: 100 }, 'bottom');
    expect(Number.parseFloat(el.style.left)).toBeGreaterThanOrEqual(6);
    expect(Number.parseFloat(el.style.top)).toBeGreaterThanOrEqual(6);
  });
});

describe('positionPopup - top-right モード（新既定）', () => {
  it('選択範囲の右上に外接配置する（rect.right - w, rect.top - h - margin）', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 }, 'top-right');
    // right(300) - w(100) = 200, top(200) - h(40) - 6 = 154
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('154px');
  });

  it('上端にはみ出す場合は選択範囲の下に反転する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    // rect.top=10, h=40 → 10-40-6=-36 < margin(6) → 220+6=226
    positionPopup(el, { left: 100, top: 10, right: 300, bottom: 220 }, 'top-right');
    expect(el.style.top).toBe('226px');
  });

  it('右端にはみ出す場合は左にクランプする', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    // right(990) - w(100) = 890, 890+100+6=996 < 1000 → クランプ不要だがテスト用に小さく viewport
    setViewport(800, 700);
    positionPopup(el, { left: 700, top: 200, right: 790, bottom: 240 }, 'top-right');
    // right(790) - w(100) = 690, 690+100+6=796 < 800 → クランプ不要、ただし left=690
    expect(el.style.left).toBe('690px');

    // クランプが必要なケース: rect.right=790, vw=800 → right(790) - w(100) = 690 で OK
    // より厳しい: rect.right=895, vw=800 → 895-100=795, 795+100+6=901>800 → 800-100-6=694
    setViewport(800, 700);
    positionPopup(el, { left: 800, top: 200, right: 895, bottom: 240 }, 'top-right');
    expect(el.style.left).toBe('694px');
  });

  it('上端にはみ出し反転後さらに下端を超える場合はクランプで margin を保つ', () => {
    setViewport(1000, 100);
    const el = makePopupEl(80, 80);
    // rect.top=10, h=80 → -76 < margin → 90+6=96, 96+80+6=182 > vh(100) → 100-80-6=14 でクランプ
    positionPopup(el, { left: 100, top: 10, right: 200, bottom: 90 }, 'top-right');
    expect(Number.parseFloat(el.style.top)).toBeGreaterThanOrEqual(6);
  });
});

describe('positionPopup - mode 既定値', () => {
  it('mode 未指定時は top-right として配置する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 });
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('154px');
  });
});
```

- [ ] **Step 3.2: テストが失敗することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/features/selection/popup.test.ts`
Expected: 新規 5 件すべて FAIL（`positionPopup` が第3引数を受け付けない）

- [ ] **Step 3.3: 実装**

`src/features/selection/popup.ts` を以下の通り全面書き換え：

```typescript
import type { App } from 'obsidian';
import type { PopupPosition } from '../../core/settings';

export { PopupPosition };

export function buildPopup(app: App, onClaudian: () => void, onTts: () => void): HTMLElement {
  const div = document.createElement('div');
  div.classList.add('cb-popup');

  const btnClaudian = document.createElement('button');
  btnClaudian.classList.add('cb-action-btn');
  btnClaudian.textContent = 'Add to Claudian';
  btnClaudian.onclick = onClaudian;

  const btnTts = document.createElement('button');
  btnTts.classList.add('cb-action-btn');
  btnTts.textContent = 'Add to TTS';
  btnTts.onclick = onTts;

  div.appendChild(btnClaudian);
  div.appendChild(btnTts);
  return div;
}

/** 選択範囲（ビューポート基準の矩形）にポップアップを配置する。
 *  - 'top-right': 選択範囲の右上に外接（right 端合わせ、top - h - margin）
 *  - 'bottom':    選択範囲の直下（bottom + margin、既存挙動）
 *  いずれもビューポート端ではクランプ、選択テキストを覆う場合は反転する。 */
export function positionPopup(
  popupEl: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
  mode: PopupPosition = 'top-right',
): void {
  const margin = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = popupEl.offsetWidth;
  const h = popupEl.offsetHeight;

  // --- 横方向 ---
  let left = mode === 'top-right' ? rect.right - w : rect.left;
  if (left + w + margin > vw) left = vw - w - margin;
  left = Math.max(margin, left);

  // --- 縦方向 ---
  let top: number;
  if (mode === 'top-right') {
    top = rect.top - h - margin;
    if (top < margin) {
      // 上はみ出し → 選択範囲の下に反転
      top = rect.bottom + margin;
    }
  } else {
    top = rect.bottom + margin;
    if (top + h + margin > vh) {
      // 下はみ出し → 選択範囲の上に反転
      top = rect.top - h - margin;
    }
  }
  top = Math.max(margin, top);

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
}
```

- [ ] **Step 3.4: テストが成功することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/features/selection/popup.test.ts`
Expected: 既存 4 + 新規 5 = 9 件すべて PASS

- [ ] **Step 3.5: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/selection/popup.ts tests/features/selection/popup.test.ts
git commit -m "feat(popup): positionPopup に mode 引数追加（top-right 既定）

- 背景: 選択ポップアップ位置設定（top-right / bottom）対応
- 変更: positionPopup(popupEl, rect, mode='top-right') に第3引数追加
- ロジック: top-right は右上外接 + 上はみ出し時下に反転、bottom は既存挙動
- テスト: top-right 4 ケース + mode 既定 1 ケース追加、既存 4 ケースは mode='bottom' 明示

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `SettingTabSelection.ts` に dropdown 追加

**Files:**
- Modify: `src/settings/SettingTabSelection.ts`（`delayMs` の設定ブロック直後に dropdown を追加）

**Interfaces:**
- Consumes: 既存 `PopupPosition` 型（settings.ts）、i18n キー（Task 2）
- Produces: UI 上の dropdown（`'top-right'` ↔ `'bottom'` 切替、`store.save` で永続化）

---

### Step 4.1: 実装追加

`src/settings/SettingTabSelection.ts` の `selectionDelayMs` 設定ブロック（行 41-54、`.addText` の末尾 `});` の直後、`// Object context menu` 見出しの直前）に以下を挿入：

```typescript
    new Setting(containerEl)
      .setName(s.selectionPopupPosition)
      .setDesc(s.selectionPopupPositionDesc)
      .addDropdown((dd) => {
        dd.addOption('top-right', s.selectionPopupPositionTopRight);
        dd.addOption('bottom', s.selectionPopupPositionBottom);
        dd.setValue(cfg.selection.popupPosition);
        dd.onChange(async (value) => {
          try {
            const latest = store.load();
            store.save({
              ...latest,
              selection: { ...latest.selection, popupPosition: value as PopupPosition },
            });
            new Notice(s.noticeSaved);
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        });
      });
```

ファイル先頭の import 群に以下を追加：

```typescript
import type { PopupPosition } from '../core/settings';
```

- [ ] **Step 4.2: TypeScript 型チェック**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx tsc --noEmit`
Expected: 既存と同じ数のエラー（popupPosition 関連は 0 件）

- [ ] **Step 4.3: 既存テストが壊れていないことを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/core/settings.test.ts tests/core/i18n.test.ts tests/features/selection/popup.test.ts`
Expected: 全件 PASS

- [ ] **Step 4.4: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/settings/SettingTabSelection.ts
git commit -m "feat(ui): SettingTabSelection にポップアップ位置 dropdown 追加

- 背景: selection.popupPosition の UI 露出（F-032）
- 追加: 'top-right' / 'bottom' 2 値の dropdown（既存 selection.* セクション末尾）
- 永続化: store.save で即時反映、Notice で保存成功/失敗を表示

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: `watcher.ts` から `popupPosition` を渡す

**Files:**
- Modify: `src/features/selection/watcher.ts`（`positionPopup` 呼び出しに第3引数追加）
- Test: `tests/features/selection/watcher.test.ts`

**Interfaces:**
- Consumes: `cfg.selection.popupPosition`（`store.load()` から取得）
- Produces: `positionPopup(popupEl, rect, cfg.selection.popupPosition)`

---

### Step 5.1: 失敗するテストを追加

`tests/features/selection/watcher.test.ts` の既存 `describe('setupSelectionWatcher', () => { ... })` ブロック末尾に以下を追加：

```typescript
  it('popupPosition="top-right"（既定）で右上に配置される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore(); // 既定
    const { cleanup, popup } = await showPopup(app, store);
    // rect={left:100, top:100, right:200, bottom:120}
    // jsdom の offsetWidth/Height は通常 0
    // left = right(200) - 0 = 200, top = top(100) - 0 - 6 = 94
    expect(popup!.style.left).toBe('200px');
    expect(popup!.style.top).toBe('94px');
    cleanup();
  });

  it('popupPosition="bottom" で直下に配置される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore({ popupPosition: 'bottom' });
    const { cleanup, popup } = await showPopup(app, store);
    // left = left(100), top = bottom(120) + 6 = 126
    expect(popup!.style.left).toBe('100px');
    expect(popup!.style.top).toBe('126px');
    cleanup();
  });
```

`makeStore` の型定義に `popupPosition?: 'top-right' | 'bottom'` を追加：

```typescript
function makeStore(overrides?: Partial<{ enabled: boolean; delayMs: number; popupPosition: 'top-right' | 'bottom' }>) {
  return {
    load: () => ({
      selection: { enabled: true, delayMs: 0, folderEnabled: true, popupPosition: 'top-right', ...overrides },
    }),
  } as unknown as import('../../../src/core/config-store').ConfigStore;
}
```

**重要**: 既存テスト「ポップアップが選択位置に配置される（left/top 設定）」（行 64-72）は既定 `bottom` を期待しているため、`mode='bottom'` の `makeStore({ popupPosition: 'bottom' })` を使うよう修正する：

```typescript
  it('ポップアップが選択位置に配置される（left/top 設定）', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore({ popupPosition: 'bottom' });
    const { cleanup, popup } = await showPopup(app, store);
    // 回帰テスト: position: fixed のまま top/left 未設定だと画面外に出て見えない
    expect(popup!.style.left).toBe('100px');
    expect(popup!.style.top).toBe('126px'); // bottom(120) + 6
    cleanup();
  });
```

- [ ] **Step 5.2: テストが失敗することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/features/selection/watcher.test.ts -t "popupPosition"`
Expected: 2 件 FAIL（`watcher.ts` が mode 未指定のため、`bottom` テストは通るが `top-right` テストは top=126 を期待して実際は 6 になる差異）

- [ ] **Step 5.3: watcher.ts を修正**

`src/features/selection/watcher.ts` の `setTimeout` コールバック内、`positionPopup(popupEl, rect);` の行を以下に置換：

```typescript
      const cfgAtFire = store.load();
      positionPopup(popupEl, rect, cfgAtFire.selection.popupPosition);
```

（コールバック外の `cfg` は `delayMs` 用に存在。発火時点の設定を `store.load()` で再取得するのが堅牢）

- [ ] **Step 5.4: テストが成功することを確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run tests/features/selection/watcher.test.ts`
Expected: 既存 + 新規 2 件すべて PASS

- [ ] **Step 5.5: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/selection/watcher.ts tests/features/selection/watcher.test.ts
git commit -m "feat(watcher): selection popupPosition を positionPopup に渡す

- 背景: 設定値に応じて配置モードを切り替える（F-032）
- 変更: 発火時点の設定を store.load() で再取得し positionPopup に渡す
- テスト: top-right（既定）と bottom の 2 ケースを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: ビルド・全体テスト・ドキュメント更新

**Files:**
- Run: `npm run build`（esbuild）
- Run: `npx vitest run`（全テスト）
- Modify: `CHANGELOG.md`, `src/manifest.json`, `data.json`, `versions.json`, `08_説明書/03_リリースノート/リリースノート.md`, `03_開発文書/05_進捗ボード.md`

**Interfaces:**
- Produces: リリース可能な状態（ビルド成功 + 全テスト PASS + ドキュメント整合）

---

### Step 6.1: 全テスト実行

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run`
Expected: 既存 + 新規すべてのテストが PASS（最終確認）

- [ ] **Step 6.2: ビルド成功を確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run build`
Expected: 0 エラー、`Plugin/main.js` が更新される

- [ ] **Step 6.3: CHANGELOG.md 更新**

`CHANGELOG.md` の最上位（既存最新エントリの上）に以下を追加：

```markdown
## v0.36.0 (2026-09-06)

### 新機能

- 選択ポップアップの位置を選択可能に（既定: 右上）

### 詳細

- `selection.popupPosition: 'top-right' | 'bottom'` を追加
- `SettingTabSelection` に「ポップアップ位置」dropdown を追加
- 既定値は `top-right`（選択範囲の右上に外接 6px）
- ビューポート上端をはみ出す場合は自動的に下に反転

### テスト

- 追加: 11 ケース（settings 4 / i18n 2 / popup 5 / watcher 2 − 一部既存拡張）
- 既存テストは全て維持

```

- [ ] **Step 6.4: manifest.json のバージョン上げ**

`src/manifest.json` の `"version"` を `"0.35.1"` → `"0.36.0"` に書き換え。

- [ ] **Step 6.5: data.json / versions.json 更新**

`data.json` 内の `"version"` キーを `"0.35.1"` → `"0.36.0"` に書き換え。

`versions.json` の先頭に以下を追加：

```json
"0.36.0": "2026-09-06",
```

（カンマ位置は既存エントリに応じて調整）

- [ ] **Step 6.6: リリースノート更新**

`08_説明書/03_リリースノート/リリースノート.md` の最上位に新バージョンの節を追加（既存パターンを踏襲）：

```markdown
## v1.X.0 (2026-09-06) — ポップアップ位置設定

### 🌟 主な変更

- 選択ポップアップの位置を「右上」「下」から選択できるようになりました（既定: 右上）
- 設定タブ「選択」で切替可能

### 🔧 改善

- ビューポート上端をはみ出す場合に自動的に下に反転するように
- i18n 対応（日本語 / 英語 / 中文）
```

- [ ] **Step 6.7: 進捗ボード更新**

`03_開発文書/05_進捗ボード.md` の `F-032` 行を追加（既存 F-NNN パターンを踏襲）：

```markdown
| F-032 | 選択ポップアップ位置設定 | ✅ 完了 | v0.36.0 | [[2026-09-06-selection-popup-position-design]] |
```

- [ ] **Step 6.8: 変更ファイル確認**

Run: `cd "D:/AI-Agent/ClaudianBridge" && git status`
Expected: 上記ファイルが modified として表示される

- [ ] **Step 6.9: コミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add CHANGELOG.md src/manifest.json data.json versions.json "08_説明書/03_リリースノート/リリースノート.md" "03_開発文書/05_進捗ボード.md"
git commit -m "docs(release): v0.36.0 リリース準備

- CHANGELOG.md: v0.36.0 エントリ追加
- manifest.json: version 0.36.0
- data.json / versions.json: 0.36.0 追加
- リリースノート: v1.X.0 節追加
- 進捗ボード: F-032 完了マーク

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6.10: E2E sanity（任意・手動）**

Obsidian を起動し、プラグインを有効化して以下を確認：
1. MD 上でテキストを選択 → ポップアップが右上に表示される
2. 設定タブ「選択」→「ポップアップ位置」を「下」に変更 → ポップアップが下に表示される
3. ビューポート上端に近い位置でテキスト選択 → ポップアップが下に反転する

---

## Self-Review Checklist

実装者がこの計画を実行する前に確認する事項：

- [ ] 設計書 §3.3（マイグレーション）のフォールバック仕様（`'bottom'` のみ認め、それ以外は `'top-right'`）が Task 1 で実装されている
- [ ] Task 2 の i18n キーが設計書 §5.2 と完全一致（`selectionPopupPosition` / `selectionPopupPositionDesc` / `selectionPopupPositionTopRight` / `selectionPopupPositionBottom`）
- [ ] Task 3 のビューポート処理が設計書 §4.3 と一致（margin 6px・top はみ出しで下反転・右はみ出しで左クランプ）
- [ ] Task 4 の dropdown が Task 2 で追加した i18n キーのみを使用（`t()` ではない）
- [ ] Task 5 で `popupPosition` を `store.load()` から再取得しているのは、設定変更中のレース防止のため
- [ ] Task 6 で全テスト → ビルド → ドキュメント更新の順序になっている
- [ ] Global Constraints の 8 項目すべてが各タスクで守られている
