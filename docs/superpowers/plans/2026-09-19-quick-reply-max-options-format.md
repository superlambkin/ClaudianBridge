# F-058 方案ボタン最大数・番号フォーマット切替 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 方案ボタン（Claudian チャット入力欄の 1〜5）に「最大表示数」と「番号フォーマット（数字／丸数字／絵文字／テキスト）」を設定画面から切替可能にする（F-058 / v0.56.0）

**Architecture:** 既存 `quickReplyShowAllOptions`（F-021・v0.24.0）の隣に 2 つの設定（`quickReplyMaxOptions` + `quickReplyNumberFormat`）を `general` 配下に追加。`renderGroup` の引数を拡張し、`BUTTONS` 配列は据え置き（5 個固定・DOM 軽量更新）。既存挙動は 100% 維持（後方互換）。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest / esbuild

## Global Constraints

- バージョン: v0.56.0（F-058）
- 既存挙動維持: v0.55.1 の F-021 テスト 16 ケース + 既存 1428 テスト全 PASS
- TDD 厳守: 失敗テスト → 実装 → PASS → コミット の順
- コミット粒度: タスク単位（複数タスクを 1 コミットにまとめない）
- i18n 対応言語: ja / en / zh（簡体字）
- スコープ厳守: OK/NG ボタンのデザイン変更・サブタブ化・ライブプレビューは含めない（YAGNI）
- 既存命名規則遵守: `camelCase` (TS) / `snake_case` (i18n key 一部) / `data-*` 属性
- 既存パターン遵守: 設定保存失敗時の `Notice(s.noticeSaveFailed)` + `draw()` 復元
- 既存レイアウト遵守: 設定 UI は `SettingTabGeneral.ts` 既存 quickReply 群の直下

---

## File Structure

### 新規ファイル
なし

### 変更ファイル（9 個）

| ファイル | 責務 |
|:--|:--|
| `src/core/settings.ts` | `QuickReplyNumberFormat` 型・定数・`general.quickReplyMaxOptions`/`quickReplyNumberFormat` 追加・normalize・validate |
| `src/core/i18n.ts` | `LocaleStrings` に 8 キー追加 + ja/en/zh の文字列 |
| `src/features/quick-reply/nav-buttons.ts` | `loadMaxOptions` / `loadNumberFormat` (hoisted & exported) + `applyQuickReplySettingsToExistingGroups` (exported) + `renderGroup` 引数拡張 + `createNumberedBadge(n, format)` + `formatText(n, format)` + `applyNumberFormat(btn, n, format)` |
| `src/settings/SettingTabGeneral.ts` | Slider (1〜5) + Dropdown (4 種) + onChange ハンドラ |
| `tests/features/quick-reply/nav-buttons.test.ts` | F-058 テスト 11 ケース追加 |
| `src/core/settings.test.ts` | normalize テスト 4 ケース追加 |
| `tests/settings/ClaudianBridgeSettingTab.test.ts` | SettingTab 描画テスト 5 ケース追加 |
| `CHANGELOG.md` | v0.56.0 エントリ追加 |
| `package.json` / `Plugin/manifest.json` / `src/manifest.json` | version 0.55.1 → 0.56.0 |

---

## Task 1: 設定スキーマ追加（型・定数・normalize・validate）+ テスト

**Files:**
- Modify: `src/core/settings.ts` （`QuickReplyNumberFormat` 型・定数追加 + `general` interface + `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general` + `normalizeClaudianBridgeSettings` 内補完ロジック + `validateClaudianBridgeSettings` 内検証）
- Modify: `src/core/settings.test.ts` （`normalizeClaudianBridgeSettings` の quickReplyMaxOptions / quickReplyNumberFormat 補完テスト 4 ケース）

**Interfaces:**
- Consumes: 既存 `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general` 構造
- Produces: エクスポート定数 `QUICK_REPLY_NUMBER_FORMATS`, `QUICK_REPLY_MAX_OPTIONS_MIN/MAX/DEFAULT`、型 `QuickReplyNumberFormat`、フィールド `general.quickReplyMaxOptions: number` と `general.quickReplyNumberFormat: QuickReplyNumberFormat`

### Step 1.1: 既存ファイルを読んで現状確認

`src/core/settings.ts` を読んで以下を確認：
- `general` interface の `quickReplyShowAllOptions`（line 612 付近）
- `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general`（line 748 付近）
- `normalizeClaudianBridgeSettings` 内 `quickReplyShowAllOptions` 補完（line 855 付近）
- `validateClaudianBridgeSettings` 内 `quickReplyShowAllOptions` 検証（line 1224 付近）
- `clampNum` ヘルパー（line 1073 付近）が既に存在し流用可能

### Step 1.2: 失敗テストを先に書く

`src/core/settings.test.ts` に以下 4 ケースを追加：

```typescript
describe('normalizeClaudianBridgeSettings - quickReply F-058', () => {
  it('quickReplyMaxOptions 欠落時は既定値 5', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyMaxOptions).toBe(5);
  });

  it('quickReplyNumberFormat 欠落時は既定値 "arabic"', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.general.quickReplyNumberFormat).toBe('arabic');
  });

  it('quickReplyMaxOptions=10 → 5 にクランプ', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyMaxOptions: 10 } as never });
    expect(result.general.quickReplyMaxOptions).toBe(5);
  });

  it('quickReplyNumberFormat="unknown" → "arabic" にフォールバック', () => {
    const result = normalizeClaudianBridgeSettings({ general: { quickReplyNumberFormat: 'unknown' } as never });
    expect(result.general.quickReplyNumberFormat).toBe('arabic');
  });
});
```

### Step 1.3: テスト実行（失敗確認）

```bash
cd D:\AI-Agent\ClaudianBridge
npx vitest run src/core/settings.test.ts -t "quickReply F-058"
```

期待結果: 4 ケースすべて FAIL（`quickReplyMaxOptions` / `quickReplyNumberFormat` が型定義に存在しないため TypeError または undefined assertion fail）

### Step 1.4: `src/core/settings.ts` に型・定数追加

ファイル冒頭の型・定数定義セクション（`DEFAULT_OFFICE_SETTINGS` の上あたり）に追記：

```typescript
// === v0.56.0 (F-058): 方案ボタンの番号フォーマット ===
export type QuickReplyNumberFormat = 'arabic' | 'circled' | 'emoji' | 'text';

export const QUICK_REPLY_NUMBER_FORMATS: readonly QuickReplyNumberFormat[] =
  ['arabic', 'circled', 'emoji', 'text'] as const;

export const QUICK_REPLY_MAX_OPTIONS_MIN = 1;
export const QUICK_REPLY_MAX_OPTIONS_MAX = 5;
export const QUICK_REPLY_MAX_OPTIONS_DEFAULT = 5;
```

### Step 1.5: `general` interface に 2 フィールド追加

`src/core/settings.ts` line 612 付近の `quickReplyEnabled: boolean;` の直後に追加：

```typescript
// === v0.24.0: クイック返信ボタンの方案ボタンを常に表示 ===
quickReplyShowAllOptions: boolean;
// === v0.25.0: クイック返信ボタン全体の ON/OFF ===
quickReplyEnabled: boolean;
// === v0.56.0 (F-058): 方案ボタンの最大表示数（1〜5・既定 5）===
quickReplyMaxOptions: number;
// === v0.56.0 (F-058): 方案ボタンの番号フォーマット（既定 'arabic'）===
quickReplyNumberFormat: QuickReplyNumberFormat;
```

### Step 1.6: `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general` に 2 フィールド追加

`src/core/settings.ts` line 748 付近の `quickReplyShowAllOptions: false,` の行を探して直後に追加：

```typescript
quickReplyShowAllOptions: false, quickReplyEnabled: true,
// === v0.56.0 (F-058) ===
quickReplyMaxOptions: QUICK_REPLY_MAX_OPTIONS_DEFAULT,
quickReplyNumberFormat: 'arabic' as QuickReplyNumberFormat,
```

### Step 1.7: `normalizeClaudianBridgeSettings` 内補完ロジック追加

`src/core/settings.ts` line 855 付近の `quickReplyShowAllOptions: ...` の行の直後に追加：

```typescript
// v0.24.0: クイック返信ボタンの方案ボタンを常に表示（既定 OFF=動的表示）
quickReplyShowAllOptions: typeof r.general?.quickReplyShowAllOptions === 'boolean' ? r.general.quickReplyShowAllOptions : false,
// === v0.56.0 (F-058): 方案ボタンの最大表示数（1〜5 にクランプ・既定 5）===
quickReplyMaxOptions: clampNum(
  r.general?.quickReplyMaxOptions,
  QUICK_REPLY_MAX_OPTIONS_MIN,
  QUICK_REPLY_MAX_OPTIONS_MAX,
  QUICK_REPLY_MAX_OPTIONS_DEFAULT,
),
// === v0.56.0 (F-058): 方案ボタンの番号フォーマット（不正値は 'arabic' にフォールバック）===
quickReplyNumberFormat: QUICK_REPLY_NUMBER_FORMATS.includes(
  r.general?.quickReplyNumberFormat as QuickReplyNumberFormat,
)
  ? (r.general?.quickReplyNumberFormat as QuickReplyNumberFormat)
  : 'arabic',
```

### Step 1.8: `validateClaudianBridgeSettings` 内検証ロジック追加

`src/core/settings.ts` line 1224 付近の `quickReplyShowAllOptions` 検証の直後に追加：

```typescript
if (typeof cfg.general.quickReplyShowAllOptions !== 'boolean') return 'general.quickReplyShowAllOptions は boolean である必要があります';
// === v0.56.0 (F-058) ===
if (!Number.isInteger(cfg.general.quickReplyMaxOptions) ||
    cfg.general.quickReplyMaxOptions < QUICK_REPLY_MAX_OPTIONS_MIN ||
    cfg.general.quickReplyMaxOptions > QUICK_REPLY_MAX_OPTIONS_MAX) {
  return `general.quickReplyMaxOptions は ${QUICK_REPLY_MAX_OPTIONS_MIN}〜${QUICK_REPLY_MAX_OPTIONS_MAX} の整数である必要があります`;
}
if (!QUICK_REPLY_NUMBER_FORMATS.includes(cfg.general.quickReplyNumberFormat)) {
  return `general.quickReplyNumberFormat は ${QUICK_REPLY_NUMBER_FORMATS.join(' / ')} のいずれかである必要があります`;
}
```

### Step 1.9: テスト実行（成功確認）

```bash
cd D:\AI-Agent\ClaudianBridge
npx vitest run src/core/settings.test.ts -t "quickReply F-058"
```

期待結果: 4 ケースすべて PASS

### Step 1.10: typecheck

```bash
cd D:\AI-Agent\ClaudianBridge
npm run typecheck
```

期待結果: エラー 0

### Step 1.11: 既存テスト回帰

```bash
cd D:\AI-Agent\ClaudianBridge
npm run test
```

期待結果: 1429 PASS（1425 v0.55.0 + 3 v0.55.1 F-021 + 4 F-058 settings = 1432 想定。差異は他の既存テスト数のため実行結果で確認）

### Step 1.12: コミット

```bash
cd D:\AI-Agent\ClaudianBridge
git add src/core/settings.ts src/core/settings.test.ts
git commit -m "feat: F-058 quickReplyMaxOptions / quickReplyNumberFormat 設定スキーマ追加

src/core/settings.ts:
- QuickReplyNumberFormat 型 ('arabic' | 'circled' | 'emoji' | 'text') 追加
- QUICK_REPLY_NUMBER_FORMATS / QUICK_REPLY_MAX_OPTIONS_MIN/MAX/DEFAULT 定数追加
- general interface に quickReplyMaxOptions: number / quickReplyNumberFormat: QuickReplyNumberFormat 追加
- DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general に既定値（5 / 'arabic'）追加
- normalizeClaudianBridgeSettings で補完（max は [1,5] にクランプ・format はホワイトリスト）
- validateClaudianBridgeSettings で検証

src/core/settings.test.ts:
- normalize 4 ケース追加（欠落・上限超過・不正値のフォールバック）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: i18n キー追加（8 キー × 4 言語 = 32 文字列）

**Files:**
- Modify: `src/core/i18n.ts` （`LocaleStrings` interface に 8 フィールド追加 + ja/en/zh の翻訳文字列）

**Interfaces:**
- Consumes: 既存 `LocaleStrings` 型
- Produces: 8 キー（`quickReplyMaxOptions`, `quickReplyMaxOptionsDesc`, `quickReplyNumberFormat`, `quickReplyNumberFormatDesc`, `quickReplyNumberFormatArabic`, `quickReplyNumberFormatCircled`, `quickReplyNumberFormatEmoji`, `quickReplyNumberFormatText`）

### Step 2.1: 既存ファイルを読んで現状確認

`src/core/i18n.ts` を開いて以下を確認：
- `LocaleStrings` interface の `quickReplyShowAllOptions: string;` 周辺（line 434 付近）
- ja の `quickReplyShowAllOptions` 翻訳（line 947 付近）
- en の `quickReplyShowAllOptions` 翻訳（line 1457 付近）
- zh の `quickReplyShowAllOptions` 翻訳（line 1967 付近）

### Step 2.2: `LocaleStrings` interface に 8 フィールド追加

`src/core/i18n.ts` line 435 付近の `quickReplyShowAllOptions: string;` の直後に追加：

```typescript
// v0.24.0: クイック返信ボタンの方案ボタン常時表示
quickReplyShowAllOptions: string;
quickReplyShowAllOptionsDesc: string;
// v0.25.0: クイック返信ボタン全体の ON/OFF
quickReplyEnabled: string;
quickReplyEnabledDesc: string;
// v0.56.0 (F-058): 方案ボタンの最大表示数
quickReplyMaxOptions: string;
quickReplyMaxOptionsDesc: string;
// v0.56.0 (F-058): 方案ボタンの番号フォーマット
quickReplyNumberFormat: string;
quickReplyNumberFormatDesc: string;
quickReplyNumberFormatArabic: string;
quickReplyNumberFormatCircled: string;
quickReplyNumberFormatEmoji: string;
quickReplyNumberFormatText: string;
```

### Step 2.3: ja（日本語）翻訳追加

`src/core/i18n.ts` line 950 付近の `quickReplyEnabledDesc: 'ON（既定）で Claudian チャット入力欄に ✅ ❌ 1️⃣〜5️⃣ のクイック返信ボタンを表示。OFF でボタンの注入自体を停止',` の直後に追加：

```typescript
quickReplyEnabledDesc: 'ON（既定）で Claudian チャット入力欄に ✅ ❌ 1️⃣〜5️⃣ のクイック返信ボタンを表示。OFF でボタンの注入自体を停止',
// v0.56.0 (F-058): 方案ボタンの最大表示数
quickReplyMaxOptions: '方案を最大 N 個表示',
quickReplyMaxOptionsDesc: '「方案ボタンを常に表示」ON 時の方案ボタン数を 1〜5 で制限。スライダーで選択した数だけ 1〜N が表示されます',
// v0.56.0 (F-058): 方案ボタンの番号フォーマット
quickReplyNumberFormat: '方案ボタン番号フォーマット',
quickReplyNumberFormatDesc: '方案 1〜5 の表示方法を選択（数字／丸数字／絵文字／テキスト）',
quickReplyNumberFormatArabic: '数字 (1, 2, 3, 4, 5)',
quickReplyNumberFormatCircled: '丸付き数字 (①, ②, ③, ④, ⑤)',
quickReplyNumberFormatEmoji: '絵文字 (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)',
quickReplyNumberFormatText: 'テキスト (方案1, 方案2)',
```

### Step 2.4: en（English）翻訳追加

`src/core/i18n.ts` line 1461 付近の `quickReplyEnabledDesc: ...` の直後に追加：

```typescript
quickReplyEnabledDesc: 'ON (default): show ✅ ❌ 1️⃣–5️⃣ buttons in the Claudian chat input toolbar. OFF: stop injecting buttons entirely.',
// v0.56.0 (F-058)
quickReplyMaxOptions: 'Max options to show',
quickReplyMaxOptionsDesc: 'When "always show option buttons" is ON, limit option buttons to 1–5. Only 1–N will be displayed',
quickReplyNumberFormat: 'Option button number format',
quickReplyNumberFormatDesc: 'Choose how options 1–5 are displayed (Arabic/Circled/Emoji/Text)',
quickReplyNumberFormatArabic: 'Arabic (1, 2, 3, 4, 5)',
quickReplyNumberFormatCircled: 'Circled (①, ②, ③, ④, ⑤)',
quickReplyNumberFormatEmoji: 'Emoji (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)',
quickReplyNumberFormatText: 'Text (方案1, 方案2)',
```

### Step 2.5: zh（簡体字）翻訳追加

`src/core/i18n.ts` line 1971 付近の `quickReplyEnabledDesc: ...` の直後に追加：

```typescript
quickReplyEnabledDesc: '开启（默认）时在 Claudian 聊天输入栏显示 ✅ ❌ 1️⃣–5️⃣。关闭时停止注入按钮',
// v0.56.0 (F-058)
quickReplyMaxOptions: '最多显示 N 个方案',
quickReplyMaxOptionsDesc: '开启"始终显示方案按钮"时，限制方案按钮数为 1–5。仅显示 1–N',
quickReplyNumberFormat: '方案按钮编号格式',
quickReplyNumberFormatDesc: '选择方案 1–5 的显示方式（阿拉伯数字／带圈数字／表情符号／文本）',
quickReplyNumberFormatArabic: '阿拉伯数字 (1, 2, 3, 4, 5)',
quickReplyNumberFormatCircled: '带圈数字 (①, ②, ③, ④, ⑤)',
quickReplyNumberFormatEmoji: '表情符号 (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)',
quickReplyNumberFormatText: '文本 (方案1, 方案2)',
```

### Step 2.6: typecheck

```bash
cd D:\AI-Agent\ClaudianBridge
npm run typecheck
```

期待結果: エラー 0（i18n の型網羅性が検証される）

### Step 2.7: コミット

```bash
cd D:\AI-Agent\ClaudianBridge
git add src/core/i18n.ts
git commit -m "feat: F-058 quickReply 最大数・フォーマット i18n キー追加

8 キー × 4 言語（ja/en/zh + LocaleStrings interface）= 32 文字列追加
- quickReplyMaxOptions / quickReplyMaxOptionsDesc
- quickReplyNumberFormat / quickReplyNumberFormatDesc
- quickReplyNumberFormatArabic / Circled / Emoji / Text

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `nav-buttons.ts` 実装（loaders + apply ヘルパー + renderGroup + formatText）

**Files:**
- Modify: `src/features/quick-reply/nav-buttons.ts` （`loadMaxOptions` / `loadNumberFormat` をモジュールトップに hoist + export、`applyQuickReplySettingsToExistingGroups` を export、`renderGroup` の引数拡張、`createNumberedBadge(n, format)` 修正、`formatText` 関数追加、`applyNumberFormat` 関数追加、`inject()` 末尾と `setupRecommendDetection` の callback の更新）
- Modify: `tests/features/quick-reply/nav-buttons.test.ts` （F-058 テスト 11 ケース追加）

**Interfaces:**
- Consumes: `settings.ts` から `QuickReplyNumberFormat`, `QUICK_REPLY_NUMBER_FORMATS`, `QUICK_REPLY_MAX_OPTIONS_MIN/MAX/DEFAULT` を import
- Produces: エクスポート `loadMaxOptions()`, `loadNumberFormat()`, `applyQuickReplySettingsToExistingGroups(showAll, max, format)`

### Step 3.1: 既存ファイルを読んで現状確認

`src/features/quick-reply/nav-buttons.ts` を読んで以下を確認：
- import ブロック（line 18-25）
- `MAX_OPTIONS = 5;` 定数（line 36）
- `BUTTONS` 配列定義（line 75-83）
- `makeButton` 関数（line 85-114）
- `createNumberedBadge` 関数（line 48-73）
- `renderGroup` 関数（line 117-125）
- `setupQuickReplyButtons` 内の `loadShowAll` / `loadEnabled`（line 128-144）
- `setupRecommendDetection` callback（line 146-150）
- `inject` 関数（line 153-178）

### Step 3.2: 失敗テストを先に書く

`tests/features/quick-reply/nav-buttons.test.ts` に新規 describe ブロック `describe('setupQuickReplyButtons — F-058 最大数・フォーマット切替（v0.56.0）', ...)` を追加：

```typescript
describe('setupQuickReplyButtons — F-058 最大数・フォーマット切替（v0.56.0）', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    sendToClaudian.mockClear();
    setupRecommendDetectionMock.mockClear();
    capturedOnChange = null;
    setupRecommendDetectionMock.mockImplementation((_app: unknown, onChange: (s: RecommendState) => void) => {
      capturedOnChange = onChange;
      return () => {};
    });
    cleanup = undefined;
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  // 設定モック用ヘルパー（F-058 拡張）
  function stubLoadF058(general: {
    quickReplyShowAllOptions?: boolean;
    quickReplyEnabled?: boolean;
    quickReplyMaxOptions?: number;
    quickReplyNumberFormat?: 'arabic' | 'circled' | 'emoji' | 'text';
  }): void {
    vi.spyOn(ConfigStore.prototype, 'load').mockReturnValue({
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      general: {
        ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general,
        quickReplyEnabled: general.quickReplyEnabled ?? true,
        quickReplyShowAllOptions: general.quickReplyShowAllOptions ?? true,
        quickReplyMaxOptions: general.quickReplyMaxOptions ?? 5,
        quickReplyNumberFormat: general.quickReplyNumberFormat ?? 'arabic',
      },
    } as ClaudianBridgeSettings);
  }

  it('maxOptions=3 + showAll=true → 方案 1〜3 が表示、4〜5 は cb-hidden', async () => {
    stubLoadF058({ quickReplyMaxOptions: 3 });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3',
    ]);
  });

  it('maxOptions=1 + showAll=true → 方案 1 のみ表示', async () => {
    stubLoadF058({ quickReplyMaxOptions: 1 });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual(['check', 'x', 'number-1']);
  });

  it('maxOptions=5 + showAll=false + state.maxOptionCount=3 → 既存挙動通り 1〜3 表示', async () => {
    stubLoadF058({ quickReplyShowAllOptions: false, quickReplyMaxOptions: 5 });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3',
    ]);
  });

  it('maxOptions=3 + showAll=false + state.maxOptionCount=5 → 1〜3 表示（maxOptions でクランプ）', async () => {
    stubLoadF058({ quickReplyShowAllOptions: false, quickReplyMaxOptions: 3 });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 5 });
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3',
    ]);
  });

  it('format="circled" → SVG badge textContent="①"', async () => {
    stubLoadF058({ quickReplyMaxOptions: 2, quickReplyNumberFormat: 'circled' });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const btn3 = group.querySelector('[data-cb-qr-2]');
    const text = btn3?.querySelector('svg text');
    expect(text?.textContent).toBe('②');
  });

  it('format="emoji" → SVG badge textContent="1️⃣"', async () => {
    stubLoadF058({ quickReplyMaxOptions: 1, quickReplyNumberFormat: 'emoji' });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const btn1 = group.querySelector('[data-cb-qr-1]');
    const text = btn1?.querySelector('svg text');
    expect(text?.textContent).toBe('1️⃣');
  });

  it('format="text" → SVG 撤去・textContent="方案1"', async () => {
    stubLoadF058({ quickReplyMaxOptions: 1, quickReplyNumberFormat: 'text' });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const btn1 = group.querySelector('[data-cb-qr-1]');
    expect(btn1?.querySelector('svg')).toBeNull();
    expect(btn1?.textContent).toBe('方案1');
  });

  it('不正な maxOptions（10）→ 5 にフォールバック', async () => {
    stubLoadF058({ quickReplyMaxOptions: 10 }); // ただし stubLoadF058 はそのまま渡すので applyMaxOptionsToExistingGroups の clamp は対象外
    // inject 時の loadMaxOptions は型ガード + clamp で 5 になる
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.length).toBe(7); // OK/NG + 1〜5 = 7
  });

  it('不正な numberFormat（"binary"）→ "arabic" にフォールバック', async () => {
    stubLoadF058({ quickReplyMaxOptions: 1, quickReplyNumberFormat: 'binary' as never });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const btn1 = group.querySelector('[data-cb-qr-1]');
    const text = btn1?.querySelector('svg text');
    expect(text?.textContent).toBe('1');
  });

  it('既存挙動回帰: F-021 テスト 16 ケースは引き続き PASS（v0.55.1 維持）', async () => {
    // この describe は他の describe と独立なので、既存 16 ケースが pass することは
    // 他の describe ブロックで確認する。ここでは F-058 設定でも F-021 の showAll=true 即時表示が動くことを確認
    stubLoadF058({ quickReplyShowAllOptions: true });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    expect(capturedOnChange).toBeNull();
    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3', 'number-4', 'number-5',
    ]);
  });

  it('applyQuickReplySettingsToExistingGroups → 既存グループに即時反映', async () => {
    stubLoadF058({ quickReplyShowAllOptions: false, quickReplyMaxOptions: 5, quickReplyNumberFormat: 'arabic' });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    // 新しい設定を「適用」
    const { applyQuickReplySettingsToExistingGroups, loadMaxOptions, loadNumberFormat } = await import(
      '../../../src/features/quick-reply/nav-buttons'
    );
    vi.spyOn(ConfigStore.prototype, 'load').mockReturnValue({
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      general: {
        ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general,
        quickReplyShowAllOptions: true,
        quickReplyMaxOptions: 2,
        quickReplyNumberFormat: 'emoji',
      },
    } as ClaudianBridgeSettings);

    applyQuickReplySettingsToExistingGroups(true, loadMaxOptions(), loadNumberFormat());

    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2',
    ]);
    const btn1 = group.querySelector('[data-cb-qr-1]');
    const text = btn1?.querySelector('svg text');
    expect(text?.textContent).toBe('1️⃣');
  });
});
```

### Step 3.3: テスト実行（失敗確認）

```bash
cd D:\AI-Agent\ClaudianBridge
npx vitest run tests/features/quick-reply/nav-buttons.test.ts -t "F-058"
```

期待結果: 11 ケースすべて FAIL（`loadMaxOptions` / `loadNumberFormat` / `applyQuickReplySettingsToExistingGroups` が export されていないため）

### Step 3.4: import ブロック拡張

`src/features/quick-reply/nav-buttons.ts` line 18-25 の import を以下に置換：

```typescript
import type { App } from 'obsidian';
import { Notice, setIcon } from 'obsidian';
import { sendToClaudian } from './core';
import { setupRecommendDetection, type RecommendState } from './recommend-detector';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings } from '../../core/settings';
import {
  DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
  QUICK_REPLY_MAX_OPTIONS_DEFAULT,
  QUICK_REPLY_MAX_OPTIONS_MAX,
  QUICK_REPLY_MAX_OPTIONS_MIN,
  QUICK_REPLY_NUMBER_FORMATS,
  type QuickReplyNumberFormat,
} from '../../core/settings';
```

### Step 3.5: モジュールトップレベルに loader 関数を追加

`src/features/quick-reply/nav-buttons.ts` line 28 の `const store = new ConfigStore();` の直後に追加：

```typescript
// ConfigStore は configPath を引数に取るため、app 参照は不要
const store = new ConfigStore();

/** v0.56.0 (F-058): 方案ボタンの最大表示数を store から取得（[1,5] にクランプ・既定 5） */
export function loadMaxOptions(): number {
  try {
    const cfg = store.load() as ClaudianBridgeSettings | null;
    const v = cfg?.general?.quickReplyMaxOptions;
    if (typeof v === 'number' && Number.isInteger(v)) {
      return Math.max(QUICK_REPLY_MAX_OPTIONS_MIN, Math.min(QUICK_REPLY_MAX_OPTIONS_MAX, v));
    }
    return QUICK_REPLY_MAX_OPTIONS_DEFAULT;
  } catch {
    return QUICK_REPLY_MAX_OPTIONS_DEFAULT;
  }
}

/** v0.56.0 (F-058): 方案ボタンの番号フォーマットを store から取得（不正値は 'arabic' にフォールバック） */
export function loadNumberFormat(): QuickReplyNumberFormat {
  try {
    const cfg = store.load() as ClaudianBridgeSettings | null;
    const f = cfg?.general?.quickReplyNumberFormat;
    return QUICK_REPLY_NUMBER_FORMATS.includes(f as QuickReplyNumberFormat)
      ? (f as QuickReplyNumberFormat)
      : 'arabic';
  } catch {
    return 'arabic';
  }
}
```

### Step 3.6: `createNumberedBadge(n, format)` の修正

`src/features/quick-reply/nav-buttons.ts` line 48-73 の `createNumberedBadge` を以下に置換：

```typescript
/** v0.29.1: 方案ボタン用カスタム SVG（circle + 数字テキスト）を生成
 *  v0.56.0 (F-058): format 引数追加（arabic / circled / emoji）*/
function createNumberedBadge(n: number, format: QuickReplyNumberFormat): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '6.5');
  svg.appendChild(circle);
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', '8');
  text.setAttribute('y', '11');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '9');
  text.setAttribute('font-weight', '600');
  text.setAttribute('fill', 'currentColor');
  text.setAttribute('stroke', 'none');
  text.textContent = formatText(n, format);
  svg.appendChild(text);
  return svg;
}

/** v0.56.0 (F-058): 方案ボタンのテキストを format に応じて生成 */
function formatText(n: number, format: QuickReplyNumberFormat): string {
  switch (format) {
    case 'circled':
      return ['', '①', '②', '③', '④', '⑤'][n] ?? String(n);
    case 'emoji':
      return ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][n] ?? String(n);
    case 'text':
    case 'arabic':
    default:
      return String(n);
  }
}
```

### Step 3.7: `renderGroup(group, state, showAllOptions)` の引数拡張

`src/features/quick-reply/nav-buttons.ts` line 117-125 の `renderGroup` を以下に置換：

```typescript
/** 選択肢数に応じて方案ボタンの表示と推奨ハイライトを更新する
 *  v0.56.0 (F-058): maxOptions / numberFormat 引数追加 */
function renderGroup(
  group: Element,
  state: RecommendState,
  showAllOptions: boolean,
  maxOptions: number,
  numberFormat: QuickReplyNumberFormat,
): void {
  const optionCount = showAllOptions
    ? maxOptions
    : Math.min(state.maxOptionCount, maxOptions);
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const btn = group.querySelector(`[data-cb-qr-${i}]`);
    if (!btn) continue;
    btn.classList.toggle('cb-hidden', i > optionCount);
    btn.classList.toggle('is-recommended', state.recommended === i);
    if (i <= optionCount) {
      applyNumberFormat(btn, i, numberFormat);
    }
  }
}

/** v0.56.0 (F-058): 単一ボタンの番号フォーマットを適用 */
function applyNumberFormat(btn: Element, n: number, format: QuickReplyNumberFormat): void {
  if (format === 'text') {
    // 方案N テキスト: SVG バッジを撤去してプレーンな文字に
    btn.replaceChildren(document.createTextNode(`方案${n}`));
  } else {
    // SVG 円バッジ維持（中の数字だけ差し替え）
    btn.replaceChildren(createNumberedBadge(n, format));
  }
}
```

### Step 3.8: `applyQuickReplySettingsToExistingGroups` を export 追加

`src/features/quick-reply/nav-buttons.ts` の `renderGroup` 関数の直後（`setupQuickReplyButtons` の直前）に追加：

```typescript
/** v0.56.0 (F-058): 既存グループ全てに showAll / maxOptions / numberFormat を即時反映。
 *  Slider / Dropdown / Toggle のいずれが変更されても全設定を見る renderGroup を呼ぶので 1 関数に統合。*/
export function applyQuickReplySettingsToExistingGroups(
  showAllOptions: boolean,
  maxOptions: number,
  numberFormat: QuickReplyNumberFormat,
): void {
  document.querySelectorAll(`[${GROUP_MARK}]`).forEach((group) => {
    renderGroup(group, { recommended: null, maxOptionCount: 0 }, showAllOptions, maxOptions, numberFormat);
  });
}
```

### Step 3.9: `setupQuickReplyButtons` 内の callback と `inject` を更新

`src/features/quick-reply/nav-buttons.ts` line 146-150 の `setupRecommendDetection` callback を以下に置換：

```typescript
const offDetect = setupRecommendDetection(app, (state) => {
  const showAll = loadShowAll();
  const max = loadMaxOptions();
  const fmt = loadNumberFormat();
  if (!loadEnabled()) return;
  document.querySelectorAll(`[${GROUP_MARK}]`).forEach((group) =>
    renderGroup(group, state, showAll, max, fmt),
  );
});
```

`src/features/quick-reply/nav-buttons.ts` line 171-177 の `inject` 末尾の `renderGroup` 呼び出しを以下に置換：

```typescript
    // F-021 + F-058: 注入直後に showAll 設定と maxOptions / numberFormat を即時反映
    renderGroup(
      group,
      { recommended: null, maxOptionCount: 0 },
      loadShowAll(),
      loadMaxOptions(),
      loadNumberFormat(),
    );
```

### Step 3.10: テスト実行（成功確認）

```bash
cd D:\AI-Agent\ClaudianBridge
npx vitest run tests/features/quick-reply/nav-buttons.test.ts
```

期待結果: 16 + 11 = 27 ケース全 PASS

### Step 3.11: typecheck

```bash
cd D:\AI-Agent\ClaudianBridge
npm run typecheck
```

期待結果: エラー 0

### Step 3.12: コミット

```bash
cd D:\AI-Agent\ClaudianBridge
git add src/features/quick-reply/nav-buttons.ts tests/features/quick-reply/nav-buttons.test.ts
git commit -m "feat: F-058 方案ボタン最大数・番号フォーマット切替実装

src/features/quick-reply/nav-buttons.ts:
- loadMaxOptions() / loadNumberFormat() をモジュールトップレベルに hoist & export
  （SettingTabGeneral.ts から参照できるよう）
- createNumberedBadge(n, format) に format 引数追加
- formatText(n, format) ヘルパー追加（arabic/circled/emoji テキスト生成）
- applyNumberFormat(btn, n, format) 追加（'text' は SVG 撤去＋方案N テキスト）
- renderGroup(group, state, showAll, maxOptions, numberFormat) に 2 引数追加
- applyQuickReplySettingsToExistingGroups(showAll, maxOptions, numberFormat) export
  （Slider/Dropdown/Toggle いずれの変更も 1 関数で吸収）
- setupRecommendDetection callback と inject() 末尾の renderGroup 呼び出しを新シグネチャに更新

tests/features/quick-reply/nav-buttons.test.ts:
- F-058 describe ブロック追加（11 ケース）
  - maxOptions=3/1 + showAll=true
  - maxOptions=5/3 + showAll=false + state.maxOptionCount
  - format=circled/emoji/text
  - 不正な maxOptions (10) のフォールバック
  - 不正な numberFormat (binary) のフォールバック
  - 既存 F-021 showAll=true 即時表示の回帰
  - applyQuickReplySettingsToExistingGroups の即時反映

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: SettingTabGeneral.ts に Slider + Dropdown 追加

**Files:**
- Modify: `src/settings/SettingTabGeneral.ts` （`quickReplyShowAllOptions` の直後に Slider + Dropdown 2 コントロール追加 + onChange ハンドラ）
- Modify: `tests/settings/SettingTabGeneral.test.ts` （既存 `Setting` モックに `addSlider` 追加 + `sliderHandlers` ストア + F-058 describe 5 ケース追加）
- Modify: `tests/settings/SettingTabGeneral.test.ts` の `makeStore` ヘルパーに `quickReplyMaxOptions` / `quickReplyNumberFormat` フィールド追加

**Interfaces:**
- Consumes: `nav-buttons.ts` から `applyQuickReplySettingsToExistingGroups`, `loadMaxOptions`, `loadNumberFormat` を import、`settings.ts` から `QuickReplyNumberFormat`, `QUICK_REPLY_MAX_OPTIONS_MIN/MAX` を import
- Produces: 設定画面「一般」タブの quickReply セクションに 2 コントロール追加

### Step 4.1: 既存ファイルを読んで現状確認

`src/settings/SettingTabGeneral.ts` を開いて以下を確認：
- import ブロック（先頭数行）
- `quickReplyShowAllOptions` Toggle の実装（line 161-174 付近）
- `quickReplyEnabled` Toggle の実装（line 176-189 付近）

`tests/settings/SettingTabGeneral.test.ts` を開いて以下を確認：
- `vi.mock('obsidian', ...)` 内の `Setting` クラスモック（line 22-77）
- `toggleHandlers` / `dropdownHandlers` キャプチャストア（line 7-20）
- `makeStore` ヘルパー（line 103-142）

### Step 4.2: import ブロック拡張

`src/settings/SettingTabGeneral.ts` の import ブロック末尾に追加：

```typescript
import {
  QUICK_REPLY_MAX_OPTIONS_MIN,
  QUICK_REPLY_MAX_OPTIONS_MAX,
  type QuickReplyNumberFormat,
} from '../core/settings';
import {
  applyQuickReplySettingsToExistingGroups,
  loadMaxOptions,
  loadNumberFormat,
} from '../features/quick-reply/nav-buttons';
```

### Step 4.3: 失敗テストを先に書く

`tests/settings/SettingTabGeneral.test.ts` を以下 3 箇所修正：

**① ファイル先頭の `dropdownHandlers` 直後に `sliderHandlers` キャプチャストア追加**：

```typescript
// ドロップダウンハンドラを記録するストア（v0.32.0 で追加）
const dropdownHandlers: Array<{
  name: string;
  value: unknown;
  disabled: boolean | null;
  onChange: ((v: unknown) => void) | null;
}> = [];

// スライダーハンドラを記録するストア（v0.56.0 F-058 で追加）
const sliderHandlers: Array<{
  name: string;
  value: unknown;
  min: number | null;
  max: number | null;
  step: number | null;
  onChange: ((v: number) => void) | null;
}> = [];
```

**② `vi.mock('obsidian', ...)` 内の `Setting` クラスに `addSlider` メソッド追加**（`addButton` の直前）：

```typescript
      addSlider(cb: (s: unknown) => unknown) {
        const captured: { name: string; value: unknown; min: number | null; max: number | null; step: number | null; onChange: ((v: number) => void) | null } = {
          name: this._name,
          value: undefined,
          min: null,
          max: null,
          step: null,
          onChange: null,
        };
        const s = {
          setLimits: function (min: number, max: number, step: number) { captured.min = min; captured.max = max; captured.step = step; return this; },
          setValue: function (v: number) { captured.value = v; return this; },
          setDynamicTooltip: function () { return this; },
          onChange: function (h: (v: number) => void) { captured.onChange = h; return this; },
        };
        cb(s);
        sliderHandlers.push(captured);
        return this;
      }
      addButton(cb: (b: unknown) => unknown) {
```

**③ `makeStore` ヘルパーの `general` 既定値に F-058 フィールド追加**（line 124-125 付近）：

```typescript
      quickReplyShowAllOptions: false,
      quickReplyEnabled: true,
      // v0.56.0 (F-058)
      quickReplyMaxOptions: 5,
      quickReplyNumberFormat: 'arabic',
```

**④ ファイル末尾に新規 describe ブロック追加**：

```typescript
describe('renderGeneralTab - quickReply F-058 (v0.56.0)', () => {
  let containerEl: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    toggleHandlers.length = 0;
    dropdownHandlers.length = 0;
    sliderHandlers.length = 0;
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
  });

  it('Slider が描画される（limits=1〜5, step=1）', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const s = getLocaleStrings('ja');
    const slider = sliderHandlers.find((x) => x.name === s.quickReplyMaxOptions);
    expect(slider).toBeDefined();
    expect(slider?.min).toBe(1);
    expect(slider?.max).toBe(5);
    expect(slider?.step).toBe(1);
  });

  it('Slider のデフォルト値が 5', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const s = getLocaleStrings('ja');
    const slider = sliderHandlers.find((x) => x.name === s.quickReplyMaxOptions);
    expect(slider?.value).toBe(5);
  });

  it('Dropdown (4 種) が描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const s = getLocaleStrings('ja');
    const dd = dropdownHandlers.find((x) => x.name === s.quickReplyNumberFormat);
    expect(dd).toBeDefined();
    expect(dd?.value).toBe('arabic');
  });

  it('Slider 変更 → store.save + ハンドラ呼び出し', () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const s = getLocaleStrings('ja');
    const slider = sliderHandlers.find((x) => x.name === s.quickReplyMaxOptions);
    expect(slider?.onChange).not.toBeNull();
    // onChange を呼ぶと store.save が呼ばれる
    slider?.onChange?.(3);
    expect(store.save).toHaveBeenCalled();
    const savedArg = (store.save as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { general: { quickReplyMaxOptions: number } };
    expect(savedArg.general.quickReplyMaxOptions).toBe(3);
  });

  it('Dropdown 変更 → store.save + ハンドラ呼び出し', () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const s = getLocaleStrings('ja');
    const dd = dropdownHandlers.find((x) => x.name === s.quickReplyNumberFormat);
    expect(dd?.onChange).not.toBeNull();
    dd?.onChange?.('emoji');
    expect(store.save).toHaveBeenCalled();
    const savedArg = (store.save as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { general: { quickReplyNumberFormat: string } };
    expect(savedArg.general.quickReplyNumberFormat).toBe('emoji');
  });
});
```

### Step 4.4: テスト実行（失敗確認）

```bash
cd D:\AI-Agent\ClaudianBridge
npx vitest run tests/settings/SettingTabGeneral.test.ts -t "F-058"
```

期待結果: 5 ケースすべて FAIL（SettingTabGeneral.ts が Slider/Dropdown を描画していないため）

### Step 4.5: `SettingTabGeneral.ts` に Slider 追加

`src/settings/SettingTabGeneral.ts` line 174 付近の `quickReplyShowAllOptions` Toggle の直後に追加：

```typescript
    // === v0.56.0 (F-058): 方案ボタンの最大表示数 ===
    new Setting(containerEl)
      .setName(s.quickReplyMaxOptions)
      .setDesc(s.quickReplyMaxOptionsDesc)
      .addSlider((slider) =>
        slider
          .setLimits(QUICK_REPLY_MAX_OPTIONS_MIN, QUICK_REPLY_MAX_OPTIONS_MAX, 1)
          .setValue(cfg.general.quickReplyMaxOptions)
          .setDynamicTooltip()
          .onChange(async (v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, general: { ...latest.general, quickReplyMaxOptions: v } });
              new Notice(s.noticeSaved);
              applyQuickReplySettingsToExistingGroups(loadShowAll(), v, loadNumberFormat());
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          }));

    // === v0.56.0 (F-058): 方案ボタンの番号フォーマット ===
    new Setting(containerEl)
      .setName(s.quickReplyNumberFormat)
      .setDesc(s.quickReplyNumberFormatDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('arabic', s.quickReplyNumberFormatArabic)
          .addOption('circled', s.quickReplyNumberFormatCircled)
          .addOption('emoji', s.quickReplyNumberFormatEmoji)
          .addOption('text', s.quickReplyNumberFormatText)
          .setValue(cfg.general.quickReplyNumberFormat)
          .onChange(async (v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, general: { ...latest.general, quickReplyNumberFormat: v as QuickReplyNumberFormat } });
              new Notice(s.noticeSaved);
              applyQuickReplySettingsToExistingGroups(loadShowAll(), loadMaxOptions(), v as QuickReplyNumberFormat);
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          }));
```

### Step 4.6: typecheck + テスト実行

```bash
cd D:\AI-Agent\ClaudianBridge
npm run typecheck
npx vitest run tests/settings/SettingTabGeneral.test.ts
```

期待結果: typecheck エラー 0、SettingTabGeneral テスト全 PASS（既存 + 5 新規）

### Step 4.7: 全テスト回帰

```bash
cd D:\AI-Agent\ClaudianBridge
npm run test
```

期待結果: 既存 + 4（settings normalize）+ 11（nav-buttons F-058）+ 5（SettingTab F-058）= 約 +20 件の PASS 増加（v0.55.1 の 1428 から）

### Step 4.8: コミット

```bash
cd D:\AI-Agent\ClaudianBridge
git add src/settings/SettingTabGeneral.ts tests/settings/SettingTabGeneral.test.ts
git commit -m "feat: F-058 一般タブに方案ボタン最大数 Slider + 番号フォーマット Dropdown 追加

src/settings/SettingTabGeneral.ts:
- quickReplyShowAllOptions の直下に Slider (1〜5) 追加
- 同じ位置に Dropdown (arabic/circled/emoji/text) 追加
- onChange で store.save + applyQuickReplySettingsToExistingGroups で即時 DOM 反映
- 既存パターン（Notice + draw 復元）に準拠

tests/settings/SettingTabGeneral.test.ts:
- Setting モックに addSlider メソッド追加 + sliderHandlers キャプチャストア追加
- makeStore ヘルパーに quickReplyMaxOptions / quickReplyNumberFormat 既定値追加
- F-058 describe ブロック 5 ケース追加（Slider/Dropdown 描画・onChange・store.save）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + version + build + deploy + UAT + commit + tag

**Files:**
- Modify: `CHANGELOG.md` （v0.56.0 エントリ追加）
- Modify: `package.json` （version 0.55.1 → 0.56.0）
- Modify: `Plugin/manifest.json` （version 0.55.1 → 0.56.0）
- Modify: `src/manifest.json` （version 0.55.1 → 0.56.0）

### Step 5.1: `CHANGELOG.md` に v0.56.0 エントリ追加

`CHANGELOG.md` の先頭（`## [0.55.1]` の上）に以下を挿入：

```markdown
# Changelog

## [0.56.0] - 2026-09-19 — 方案ボタン最大数・番号フォーマット切替 (F-058)

ご主人様要望「設定画面にて最大数とデザインを選択切替できるようにしたい」への対応。
F-021（v0.24.0）の bool トグルに数値・enum 設定を追加する形での機能拡張。

### Added

- 🆕 **`general.quickReplyMaxOptions`** (number 1〜5・既定 5):
  「方案ボタンを常に表示」ON 時の方案ボタン数を 1〜5 で制限。
  スライダーで選択した数だけ方案 1〜N が即時表示される。
- 🆕 **`general.quickReplyNumberFormat`** ('arabic' | 'circled' | 'emoji' | 'text'・既定 'arabic'):
  方案 1〜5 の表示方法を選択可能に。
  - `arabic`（既定）: 1, 2, 3, 4, 5
  - `circled`: ①, ②, ③, ④, ⑤
  - `emoji`: 1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣
  - `text`: 方案1, 方案2, 方案3, 方案4, 方案5（SVG バッジ撤去・テキスト）

### Changed

- 🔧 **`renderGroup` の引数拡張** (`src/features/quick-reply/nav-buttons.ts`):
  `renderGroup(group, state, showAll, maxOptions, numberFormat)` に 2 引数追加。
  既存挙動は 100% 維持（F-021 テスト 16 ケース全 PASS）。
- 🔧 **`loadMaxOptions` / `loadNumberFormat` をモジュールトップレベルに hoist**:
  SettingTabGeneral.ts から設定変更時に直接呼べるよう export。
  既存 `loadShowAll` / `loadEnabled` はスコープ最小化のため closure のまま据え置き。

### UI

- 一般タブ「クイック返信ボタン」セクションに 2 コントロール追加:
  - 「方案を最大 N 個表示」Slider（1〜5・既定 5）
  - 「方案ボタン番号フォーマット」Dropdown（4 種・既定 'arabic'）
- i18n 8 キー追加（ja / en / zh 簡体字）

### Tests

- +20 cases（1428 → 1448）
  - `src/core/settings.test.ts`: normalize 4 ケース（欠落・上限超過・不正値のフォールバック）
  - `tests/features/quick-reply/nav-buttons.test.ts`: F-058 describe 11 ケース
  - `tests/settings/ClaudianBridgeSettingTab.test.ts`: 描画 5 ケース

### Migration Notes

- **既存ユーザー**: `data.json` に `quickReplyMaxOptions` / `quickReplyNumberFormat` が
  存在しない場合は normalize が既定値（5 / 'arabic'）で補完。既存挙動は 100% 維持。
- **設定保存失敗時**: 既存パターン通り `Notice(noticeSaveFailed)` + UI 復元。

```

### Step 5.2: version 0.55.1 → 0.56.0 に更新

3 ファイルを編集（各ファイル 1 行）：

```bash
cd D:\AI-Agent\ClaudianBridge
```

**`package.json` line 3**: `"version": "0.55.1"` → `"version": "0.56.0"`

**`Plugin/manifest.json` line 4**: `"version": "0.55.1"` → `"version": "0.56.0"`

**`src/manifest.json` line 4**: `"version": "0.55.1"` → `"version": "0.56.0"`

### Step 5.3: CHANGELOG リリースゲート確認

```bash
cd D:\AI-Agent\ClaudianBridge
npm run check:changelog
```

期待結果: `✅ CHANGELOG.md に "## [0.56.0]" が存在します。`

### Step 5.4: 全テスト再実行

```bash
cd D:\AI-Agent\ClaudianBridge
npm run test
```

期待結果: 約 1448 PASS / 1 skipped

### Step 5.5: typecheck

```bash
cd D:\AI-Agent\ClaudianBridge
npm run typecheck
```

期待結果: エラー 0

### Step 5.6: ビルド + デプロイ

```bash
cd D:\AI-Agent\ClaudianBridge
npm run build
```

期待結果: ビルド成功、`main.js` / `manifest.json` / `styles.css` が `C:\Users\superlambkin\OneDrive\Edge\Obsidian Vault\.obsidian\plugins\ClaudianBridge\` に配置

### Step 5.7: デプロイ確認

```bash
grep '"version"' "/c/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/ClaudianBridge/manifest.json"
```

期待結果: `"version": "0.56.0",`

### Step 5.8: 実機 UAT（手動・40 ケース）

1. Obsidian を再起動
2. 設定 → ClaudianBridge → 一般 → クイック返信ボタンの新 UI 確認
3. 4 format × 5 maxOptions × 2 showAll の組み合わせを手動で確認:
   - **format=arabic + maxOptions=1**: 方案 1 のみ数字表示
   - **format=arabic + maxOptions=5 + showAll=ON**: 方案 1〜5 数字表示
   - **format=circled + maxOptions=3**: 方案 1〜3 丸数字表示
   - **format=emoji + maxOptions=2**: 方案 1〜2 絵文字表示
   - **format=text + maxOptions=4**: 方案 1〜4 テキスト表示（方案1, 方案2, ...）
   - showAll=OFF で応答から方案 N を検出したとき、対応する番号のボタンが正しくフォーマット表示される
4. 既存挙動の回帰: maxOptions=5 / format=arabic 以外で操作しても F-021 テスト 16 ケース相当の挙動が変わらない

### Step 5.9: git commit + push

```bash
cd D:\AI-Agent\ClaudianBridge
git add CHANGELOG.md package.json Plugin/manifest.json src/manifest.json
git commit -m "release: v0.56.0 F-058 方案ボタン最大数・番号フォーマット切替

- CHANGELOG.md: v0.56.0 エントリ追加（Added/Changed/UI/Tests/Migration Notes）
- package.json: version 0.55.1 → 0.56.0
- Plugin/manifest.json: version 0.55.1 → 0.56.0
- src/manifest.json: version 0.55.1 → 0.56.0

実機 UAT 40 ケース全合格（4 format × 5 maxOptions × 2 showAll）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

### Step 5.10: release タグ作成 + push

```bash
cd D:\AI-Agent\ClaudianBridge
git tag -a v0.56.0 -m "Release v0.56.0 — F-058 方案ボタン最大数・番号フォーマット切替"
git push origin v0.56.0
```

期待結果: tag `v0.56.0` が origin に push され、GitHub Releases から main.js / manifest.json / styles.css がダウンロード可能になる

---

## 完了条件（Definition of Done）

- [ ] Task 1: settings.ts + settings.test.ts 変更・commit 完了・1429 PASS
- [ ] Task 2: i18n.ts 32 文字列追加・commit 完了
- [ ] Task 3: nav-buttons.ts + nav-buttons.test.ts 変更・commit 完了・1429 + 11 = 1440 PASS
- [ ] Task 4: SettingTabGeneral.ts + ClaudianBridgeSettingTab.test.ts 変更・commit 完了・1440 + 5 = 1445 PASS
- [ ] Task 5: CHANGELOG + version + build + deploy + UAT + commit + tag 完了
- [ ] 全テスト PASS（既存 + 新規 ~20 = ~1448 件）
- [ ] TypeScript 型チェック エラー 0
- [ ] `npm run check:changelog` PASS
- [ ] ビルド成功（main.js / manifest.json / styles.css 配置）
- [ ] 実機 UAT 40 ケース全合格
- [ ] git commit + push + tag v0.56.0 完了
- [ ] 学習記録 1 件追加（F-058 リリース）

---

## 関連資料

- 設計書: `docs/superpowers/specs/2026-09-19-quick-reply-max-options-format-design.md`（commit `afbc58` + `3fc85e9`）
- 関連 F 番号: F-021（方案ボタン常時表示・v0.24.0）
- 関連コミット: v0.55.1 (F-021 修正・`dc929df`)、v0.55.0 (F-057 Folder Bridge 削除・`d34d570`)
