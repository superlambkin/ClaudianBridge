# 「_」プレフィックスフォルダ非表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian Bridge v0.22.0 で、フォルダ名の先頭が `_` のフォルダ（例: `_テンプレート`）をファイルエクスプローラから非表示にする設定を Whitelist 機能に追加する。

**Architecture:** 既存の `buildWhitelistCss(extensions, alwaysShowFolders)` を 3 引数 `buildWhitelistCss(extensions, alwaysShowFolders, hideUnderscoreFolders)` に拡張し、`.nav-folder:has(> .nav-folder-title[data-path^="_"])` と `[data-path*="/_"]` の CSS セレクタで `_` プレフィックスフォルダを非表示にする。設定は `WhitelistSettings.hideUnderscoreFolders`（既定 `true`）として Whitelist タブにトグルを追加する。

**Tech Stack:** TypeScript (ES2022), Obsidian Plugin API, Vitest, esbuild

## Global Constraints

- TypeScript strict mode（既存プロジェクト設定 `tsconfig.json` 準拠）
- 既存パターン遵守: `buildWhitelistCss` の CSS 生成方式（`:has()` セレクタ）を踏襲
- i18n: ja/zh/en 3 言語すべてに追加必須（欠落禁止）
- 後方互換性: 既存ユーザーの `data.json` を破壊しない（`hideUnderscoreFolders` 未設定時は `true` フォールバック）
- バージョン: `src/manifest.json` を `0.21.1` → `0.22.0` に更新
- コミット粒度: タスクごとに 1 コミット
- 既存テスト: 692 件（691 passed + 1 skipped）すべてパス状態を維持

---

## File Structure

### 変更ファイル

| ファイル | 責務 |
|---------|------|
| `src/core/settings.ts` | `WhitelistSettings.hideUnderscoreFolders` 追加（型 / default / normalize / validate） |
| `src/core/i18n.ts` | 2 フィールド × 3 言語追加（ja/en/zh） |
| `src/features/whitelist/css-builder.ts` | 3 引数化 + `_` フォルダ非表示 CSS セレクタ追加 |
| `src/settings/SettingTabWhitelist.ts` | トグル UI 追加（alwaysShowFolders の直後） |
| `src/main.ts` | `buildWhitelistCss` 呼び出し 2 箇所を 3 引数に更新 |
| `tests/features/whitelist/css-builder.test.ts` | 既存 5 テストを 3 引数化 + 新規 4 テスト追加 |
| `tests/core/settings.test.ts` | `hideUnderscoreFolders` テスト 3 件追加 |
| `src/manifest.json` | version `0.22.0` |
| `package.json` | version `0.22.0` |
| `versions.json` | `"0.22.0": "1.7.2"` 追加 |
| `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` | v0.22.0 エントリ追加 |

---

## Task 1: 設定モデル追加（`WhitelistSettings.hideUnderscoreFolders`）

**Files:**
- Modify: `src/core/settings.ts` (interface, default, normalize, validate)
- Modify: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `WhitelistSettings.hideUnderscoreFolders: boolean`（既定 `true`）

- [ ] **Step 1: テストを書く** — `tests/core/settings.test.ts` に以下を追加:

`validateClaudianBridgeSettings` の describe ブロック内（`whitelist.alwaysShowFolders` チェックの近く）:

```typescript
it('validateClaudianBridgeSettings: whitelist.hideUnderscoreFolders が boolean であること', () => {
  const valid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, whitelist: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist, hideUnderscoreFolders: true } };
  expect(validateClaudianBridgeSettings(valid)).toBeNull();

  const invalid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, whitelist: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.whitelist, hideUnderscoreFolders: 'yes' as unknown as boolean } };
  expect(validateClaudianBridgeSettings(invalid)).toMatch(/whitelist\.hideUnderscoreFolders/);
});
```

`normalizeWhitelistSettings` の describe ブロック内:

```typescript
it('normalizeWhitelistSettings: hideUnderscoreFolders デフォルト true', () => {
  const result = normalizeWhitelistSettings({});
  expect(result.hideUnderscoreFolders).toBe(true);
});

it('normalizeWhitelistSettings: hideUnderscoreFolders=false 明示設定', () => {
  const result = normalizeWhitelistSettings({ hideUnderscoreFolders: false });
  expect(result.hideUnderscoreFolders).toBe(false);
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts 2>&1 | tail -30
```

期待: `whitelist.hideUnderscoreFolders` 関連で 3 件 FAIL

- [ ] **Step 3: `WhitelistSettings` interface を更新** — `src/core/settings.ts:257-261`:

```typescript
export interface WhitelistSettings {
  enabled: boolean;
  extensions: string[];
  alwaysShowFolders: boolean;
  // === v0.22.0: _ プレフィックスフォルダ非表示 ===
  hideUnderscoreFolders: boolean;
}
```

- [ ] **Step 4: `DEFAULT_WHITELIST_SETTINGS` を更新** — `src/core/settings.ts:263-267`:

```typescript
export const DEFAULT_WHITELIST_SETTINGS: WhitelistSettings = {
  enabled: true,
  extensions: ['md', 'canvas', 'pdf', 'png', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  alwaysShowFolders: true,
  hideUnderscoreFolders: true,  // v0.22.0: _ フォルダ非表示（既定 ON）
};
```

- [ ] **Step 5: `normalizeWhitelistSettings` を更新** — `src/core/settings.ts:269-281`:

```typescript
export function normalizeWhitelistSettings(raw: unknown): WhitelistSettings {
  const r = (raw ?? {}) as Partial<WhitelistSettings>;
  return {
    enabled: r.enabled ?? DEFAULT_WHITELIST_SETTINGS.enabled,
    extensions: Array.isArray(r.extensions)
      ? r.extensions
          .filter((e): e is string => typeof e === 'string')
          .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
          .filter((e) => e.length > 0)
      : [...DEFAULT_WHITELIST_SETTINGS.extensions],
    alwaysShowFolders: r.alwaysShowFolders ?? DEFAULT_WHITELIST_SETTINGS.alwaysShowFolders,
    // v0.22.0: _ フォルダ非表示（既定 ON）
    hideUnderscoreFolders: r.hideUnderscoreFolders ?? DEFAULT_WHITELIST_SETTINGS.hideUnderscoreFolders,
  };
}
```

- [ ] **Step 6: `validateClaudianBridgeSettings` を更新** — `src/core/settings.ts:817` の `whitelist.alwaysShowFolders` チェック直後に追加:

```typescript
if (typeof cfg.whitelist.hideUnderscoreFolders !== 'boolean') return 'whitelist.hideUnderscoreFolders は boolean である必要があります';
```

- [ ] **Step 7: テスト合格確認**

```bash
cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts 2>&1 | tail -20
```

期待: 既存 + 新規 3 件すべて PASS

- [ ] **Step 8: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/core/settings.ts tests/core/settings.test.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(settings): add whitelist.hideUnderscoreFolders (v0.22.0)

WhitelistSettings に hideUnderscoreFolders: boolean を追加。
既定 true、後方互換性あり（未設定ユーザーは自動的に ON）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: i18n 文字列追加

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `LocaleStrings.whitelistHideUnderscoreFolders: string`
  - `LocaleStrings.whitelistHideUnderscoreFoldersDesc: string`

- [ ] **Step 1: `LocaleStrings` interface を更新** — `src/core/i18n.ts` の `whitelistAlwaysShowFoldersDesc` 直後に追加:

```typescript
whitelistAlwaysShowFolders: string;
whitelistAlwaysShowFoldersDesc: string;
// === v0.22.0: _ プレフィックスフォルダ非表示 ===
whitelistHideUnderscoreFolders: string;
whitelistHideUnderscoreFoldersDesc: string;
```

- [ ] **Step 2: ja の値を追加** — `STRINGS.ja` の `whitelistAlwaysShowFoldersDesc` 直後に:

```typescript
whitelistAlwaysShowFolders: '📁 フォルダは常に表示',
whitelistAlwaysShowFoldersDesc: 'フォルダをフィルター対象外とする',
// v0.22.0
whitelistHideUnderscoreFolders: '📁 _ で始まるフォルダを非表示',
whitelistHideUnderscoreFoldersDesc: 'フォルダ名の先頭が _ のフォルダ（例: _テンプレート）をファイルエクスプローラから非表示にします',
```

- [ ] **Step 3: en の値を追加** — `STRINGS.en` の `whitelistAlwaysShowFoldersDesc` 直後に:

```typescript
whitelistAlwaysShowFolders: '📁 Always show folders',
whitelistAlwaysShowFoldersDesc: 'Folders are not affected by the filter',
// v0.22.0
whitelistHideUnderscoreFolders: '📁 Hide _-prefixed folders',
whitelistHideUnderscoreFoldersDesc: 'Hide folders whose name starts with _ (e.g. _templates) from the file explorer',
```

- [ ] **Step 4: zh の値を追加** — `STRINGS.zh` の `whitelistAlwaysShowFoldersDesc` 直後に:

```typescript
whitelistAlwaysShowFolders: '📁 始终显示文件夹',
whitelistAlwaysShowFoldersDesc: '文件夹不受过滤影响',
// v0.22.0
whitelistHideUnderscoreFolders: '📁 隐藏 _ 开头的文件夹',
whitelistHideUnderscoreFoldersDesc: '将名称以 _ 开头的文件夹（例如 _templates）从文件浏览器中隐藏',
```

- [ ] **Step 5: TypeScript 型チェック**

```bash
cd D:/AI-Agent/ClaudianBridge && npx tsc --noEmit 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/core/i18n.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(i18n): add whitelistHideUnderscoreFolders strings (ja/en/zh, v0.22.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: css-builder 3 引数化 + `_` フォルダ非表示（TDD）

**Files:**
- Modify: `src/features/whitelist/css-builder.ts`
- Modify: `tests/features/whitelist/css-builder.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `buildWhitelistCss(extensions: string[], alwaysShowFolders: boolean, hideUnderscoreFolders: boolean): string | null`
  - 3 引数化。`extensions.length === 0 && !hideUnderscoreFolders` のときのみ `null`

- [ ] **Step 1: 既存テストを 3 引数に更新** — `tests/features/whitelist/css-builder.test.ts` の全 `buildWhitelistCss` 呼び出しを更新:

```typescript
// 変更前 → 変更後
buildWhitelistCss([], true)        → buildWhitelistCss([], true, false)      // 期待: null のまま
buildWhitelistCss(['md', 'pdf'], false) → buildWhitelistCss(['md', 'pdf'], false, false)
buildWhitelistCss(['md'], true)    → buildWhitelistCss(['md'], true, false)
buildWhitelistCss(['md'], false)   → buildWhitelistCss(['md'], false, false)
buildWhitelistCss(['md'], false)   → buildWhitelistCss(['md'], false, false)
```

- [ ] **Step 2: 新規テストを追加** — 既存テストの後に追加:

```typescript
describe('buildWhitelistCss - hideUnderscoreFolders (v0.22.0)', () => {
  it('hideUnderscoreFolders=true で _ フォルダ非表示セレクタを含む', () => {
    const css = buildWhitelistCss(['md'], true, true);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path^="_"]');
    expect(css).toContain('[data-path*="/_"]');
    expect(css).toContain('display: none !important');
  });

  it('hideUnderscoreFolders=true でも alwaysShowFolders の flex ルールは維持', () => {
    const css = buildWhitelistCss(['md'], true, true);
    expect(css).toContain('.nav-folder { display: flex !important; }');
    expect(css).toContain('[data-path^="_"]');
  });

  it('hideUnderscoreFolders=false なら _ フォルダセレクタを含まない', () => {
    const css = buildWhitelistCss(['md'], true, false);
    expect(css).not.toBeNull();
    expect(css).not.toContain('[data-path^="_"]');
    expect(css).not.toContain('[data-path*="/_"]');
  });

  it('extensions 空でも hideUnderscoreFolders=true なら CSS を返す', () => {
    const css = buildWhitelistCss([], true, true);
    expect(css).not.toBeNull();
    expect(css).toContain('[data-path^="_"]');
    expect(css).not.toContain('.nav-file:not');
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```bash
cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/whitelist/css-builder.test.ts 2>&1 | tail -30
```

期待: 新規 4 件が FAIL（3 引数が受け付けられない / セレクタ未実装）

- [ ] **Step 4: css-builder を実装** — `src/features/whitelist/css-builder.ts` を置換:

```typescript
export function buildWhitelistCss(
  extensions: string[],
  alwaysShowFolders: boolean,
  hideUnderscoreFolders: boolean,
): string | null {
  // 拡張子フィルタと _ フォルダ非表示の両方が無効なら null
  if (extensions.length === 0 && !hideUnderscoreFolders) return null;

  const extSelectors = extensions
    .map((ext) => `      [data-path$=".${ext}" i]`)
    .join(',\n');

  const folderRule = alwaysShowFolders
    ? '\n/* folders always visible */\n.nav-folder { display: flex !important; }'
    : '';

  const underscoreRule = hideUnderscoreFolders
    ? '\n/* hide _-prefixed folders (v0.22.0) */\n' +
      '.nav-folder:has(> .nav-folder-title[data-path^="_"]),\n' +
      '.nav-folder:has(> .nav-folder-title[data-path*="/_"]) {\n' +
      '  display: none !important;\n' +
      '}'
    : '';

  const fileRule = extensions.length > 0
    ? `.nav-files-container .nav-file:not(:has(\n  > .nav-file-title:is(\n${extSelectors}\n  )\n)) {\n  display: none !important;\n}`
    : '';

  return `/* ── Claudian Bridge Whitelist ── */\n${fileRule}${folderRule}${underscoreRule}`;
}
```

- [ ] **Step 5: テスト合格確認**

```bash
cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/whitelist/css-builder.test.ts 2>&1 | tail -20
```

期待: 既存 5 + 新規 4 = 9 件すべて PASS

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/whitelist/css-builder.ts tests/features/whitelist/css-builder.test.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(whitelist): add hideUnderscoreFolders CSS support (v0.22.0)

buildWhitelistCss を 3 引数化（extensions, alwaysShowFolders, hideUnderscoreFolders）。
.nav-folder:has(> .nav-folder-title[data-path^=\"_\"]) と [data-path*=\"/_\"] で
_ プレフィックスフォルダ（トップ + サブ）を非表示。
extensions 空でも hideUnderscoreFolders=true なら CSS を返す。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 設定画面 UI 追加

**Files:**
- Modify: `src/settings/SettingTabWhitelist.ts`

**Interfaces:**
- Consumes: `s.whitelistHideUnderscoreFolders`, `s.whitelistHideUnderscoreFoldersDesc`（Task 2）
- Produces: SettingTabWhitelist の UI にトグル追加

- [ ] **Step 1: トグル UI を追加** — `src/settings/SettingTabWhitelist.ts` の `alwaysShowFolders` トグル設定（line 120-132）の直後に追加:

```typescript
// v0.22.0: _ で始まるフォルダを非表示（既定 ON）
new Setting(containerEl)
  .setName(s.whitelistHideUnderscoreFolders)
  .setDesc(s.whitelistHideUnderscoreFoldersDesc)
  .addToggle((t) => t.setValue(cfg.whitelist.hideUnderscoreFolders).onChange((v) => {
    try {
      const latest = store.load();
      store.save({ ...latest, whitelist: { ...latest.whitelist, hideUnderscoreFolders: v } });
    } catch (e) {
      new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
      draw();
    }
  }));
```

- [ ] **Step 2: TypeScript 型チェック**

```bash
cd D:/AI-Agent/ClaudianBridge && npx tsc --noEmit 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 3: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/settings/SettingTabWhitelist.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(settings): add hideUnderscoreFolders toggle UI (v0.22.0)

拡張子フィルタタブに「_ で始まるフォルダを非表示」トグルを追加。
既定 ON。alwaysShowFolders トグルの直後に配置。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: main.ts 統合

**Files:**
- Modify: `src/main.ts`（buildWhitelistCss 呼び出し 2 箇所）

**Interfaces:**
- Consumes: `buildWhitelistCss(extensions, alwaysShowFolders, hideUnderscoreFolders)`（Task 3）
- Produces: プラグイン実行時に 3 引数で CSS が生成される

- [ ] **Step 1: 1 箇所目の呼び出しを更新** — `src/main.ts:104`:

```typescript
// 変更前
const css = buildWhitelistCss(w.extensions, w.alwaysShowFolders);
// 変更後
const css = buildWhitelistCss(w.extensions, w.alwaysShowFolders, w.hideUnderscoreFolders);
```

- [ ] **Step 2: 2 箇所目の呼び出しを更新** — `src/main.ts:260`:

```typescript
// 変更前
const css = w.enabled ? buildWhitelistCss(w.extensions, w.alwaysShowFolders) : null;
// 変更後
const css = w.enabled ? buildWhitelistCss(w.extensions, w.alwaysShowFolders, w.hideUnderscoreFolders) : null;
```

- [ ] **Step 3: TypeScript 型チェック + 全テスト**

```bash
cd D:/AI-Agent/ClaudianBridge && npx tsc --noEmit 2>&1 | tail -10
cd D:/AI-Agent/ClaudianBridge && npx vitest run 2>&1 | tail -5
```

期待: エラーなし + 全テストパス

- [ ] **Step 4: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/main.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(main): pass hideUnderscoreFolders to buildWhitelistCss (v0.22.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: バージョン・リリースノート更新

**Files:**
- Modify: `src/manifest.json`（0.21.1 → 0.22.0）
- Modify: `package.json`（0.21.1 → 0.22.0）
- Modify: `versions.json`（0.22.0 追加）
- Modify: `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`（v0.22.0 エントリ）

**Interfaces:**
- Consumes: なし
- Produces: マニフェスト・npm・互換性マップ・リリースノート更新

- [ ] **Step 1: manifest.json バージョン更新**

`src/manifest.json:4`:
```json
"version": "0.21.1",
```
を
```json
"version": "0.22.0",
```
に変更。

- [ ] **Step 2: package.json バージョン更新**

`package.json:3`:
```json
"version": "0.21.1",
```
を
```json
"version": "0.22.0",
```
に変更。

- [ ] **Step 3: versions.json に 0.22.0 を追加**

`versions.json` の先頭に追加:
```json
{
  "0.22.0": "1.7.2",
  "0.21.1": "1.7.2",
  ...
}
```

- [ ] **Step 4: リリースノート更新** — vault 側のリリースノートの最新版セクション（v0.21.1）の直前に追加:

```markdown
## v0.22.0 (2026-08-17)

### 新機能

- 📁 **「_」プレフィックスフォルダ非表示**: フォルダ名の先頭が `_` のフォルダ（例: `_テンプレート`）をファイルエクスプローラから非表示にします
- 設定画面「拡張子フィルタ」タブで ON/OFF 切替可能（既定 ON）
- 「フォルダは常に表示」より優先（`_` フォルダは常に非表示）

### 互換性

- 既存ユーザーの `data.json` への破壊的変更なし（`hideUnderscoreFolders` 未設定は自動的に `true`）
```

- [ ] **Step 5: コミット**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/manifest.json package.json versions.json && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "chore: bump version to 0.22.0 + release notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: ビルド検証 + デプロイ

**Files:**
- Modify: なし（検証のみ）

**Interfaces:**
- Consumes: 全 Task の成果物
- Produces: ビルド成功 + Obsidian Vault への配置

- [ ] **Step 1: 全テスト実行**

```bash
cd D:/AI-Agent/ClaudianBridge && npx vitest run 2>&1 | tail -6
```

期待: 全件 PASS（既存 691 + 新規 7 = 698 + 1 skipped）

- [ ] **Step 2: TypeScript 型チェック**

```bash
cd D:/AI-Agent/ClaudianBridge && npx tsc --noEmit 2>&1 | tail -5
```

期待: エラーなし

- [ ] **Step 3: ビルド + デプロイ**

```bash
cd D:/AI-Agent/ClaudianBridge && npm run build 2>&1 | tail -10
```

期待: esbuild ビルド成功 + `obsidian-deploy.mjs` で配置完了

- [ ] **Step 4: デプロイ成果物確認**

```bash
grep '"version"' "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/ClaudianBridge/manifest.json"
grep -c "data-path\\^=\\|hideUnderscoreFolders" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/ClaudianBridge/main.js"
```

期待: `"version": "0.22.0"` + セレクタが含まれる

- [ ] **Step 5: Obsidian で動作確認** （手動）

1. Obsidian を再起動
2. 設定 → Claudian Bridge → 拡張子フィルタタブ → 「📁 _ で始まるフォルダを非表示」トグルが見える
3. ファイルエクスプローラで `_` で始まるフォルダが非表示になる（例: `_テンプレート`）
4. トグルを OFF → `_` フォルダが再表示される

---

## Self-Review

**Spec coverage:**
| Spec Section | Task |
|--------------|------|
| D1 (`WhitelistSettings.hideUnderscoreFolders`) | Task 1, 4, 5 |
| D2 (default true) | Task 1 (normalize fallback) |
| D3 (`_` 非表示 > alwaysShowFolders) | Task 3 (CSS 特異度) |
| D4 (フォルダのみ) | Task 3 (セレクタ) |
| D5 (フィルタ OFF 時は無効) | Task 5 (main.ts の enabled チェック) |
| D6 (トップ + サブ) | Task 3 (`[data-path^="_"]` + `[data-path*="/_"]`) |
| D7 (extensions 空でも有効) | Task 3 (`extensions.length === 0 && !hideUnderscoreFolders`) |
| i18n | Task 2 |
| 設定 UI | Task 4 |
| main.ts 統合 | Task 5 |
| テスト計画 | Task 1, 3 |
| バージョン・リリースノート | Task 6 |
| デプロイ | Task 7 |

✅ 全カバー

**Placeholder scan:** grep で確認（実施済み、TBD/TODO なし）

**Type consistency:**
- `buildWhitelistCss(extensions, alwaysShowFolders, hideUnderscoreFolders)` → Task 3 で定義、Task 5 で呼び出し（一致）
- `WhitelistSettings.hideUnderscoreFolders` → Task 1 で導入、Task 4/5 で使用（一致）
- `s.whitelistHideUnderscoreFolders` / `Desc` → Task 2 で導入、Task 4 で使用（一致）
- 既存 5 テストの 3 引数化 → Task 3 Step 1（正確に列挙）

✅ 整合性 OK