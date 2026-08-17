# 「_」プレフィックスフォルダ非表示 デザイン仕様書

> 📑 **仕様書 ID**: underscore-folder-hide
> 📅 **作成日**: 2026-08-17
> 🎯 **対象バージョン**: claudian-bridge v0.22.0
> 👤 **作成者**: MiuMiu（ブレインストーミング経由）

---

## 概要

Claudian Bridge の拡張子フィルタ（Whitelist）機能に、**フォルダ名の先頭が `_` のフォルダ**（例: `_テンプレート`, `_アーカイブ`）をファイルエクスプローラから非表示にする機能を追加する。

既存の「フォルダは常に表示」設定（`alwaysShowFolders`）よりも優先して、`_` プレフィックスフォルダは常に非表示にする。

---

## 動機 / 目的

- Obsidian のファイルエクスプローラに `_テンプレート` 等の内部用フォルダが表示されると視覚ノイズになる
- 内部用フォルダを隠すことで、実際に使うフォルダだけを一覧表示したい
- 拡張子フィルタ機能（Whitelist）の一部として一貫して管理する

---

## スコープ

### In-Scope
- `WhitelistSettings.hideUnderscoreFolders: boolean` 追加（既定 `true`）
- `buildWhitelistCss` に `_` フォルダ非表示 CSS セレクタ追加
- 設定画面（拡張子フィルタタブ）にトグル UI 追加
- i18n（ja/en/zh）ラベル追加
- 既存テスト更新 + 新規テスト追加

### Out-of-Scope（将来検討）
- `_` プレフィックス**ファイル**の非表示（対象はフォルダのみ）
- パターン指定（`_` 以外のプレフィックス）
- Whitelist とは独立したフォルダ非表示設定

---

## デザイン決定

### D1: 設定場所は Whitelist 内

**決定**: `WhitelistSettings.hideUnderscoreFolders` として Whitelist（拡張子フィルタ）設定内に追加
**理由**: ユーザー選択。フォルダ表示の一貫した設定として Whitelist タブが自然

### D2: 既定値は ON

**決定**: 既定 `true`。既存ユーザーは自動的に有効化
**理由**: ユーザー選択。内部用フォルダは通常隠したい

### D3: 「_」フォルダ非表示は「フォルダは常に表示」より優先

**決定**: `.nav-folder:has(...)` セレクタ（特異度 0,3,0）が `.nav-folder { display: flex !important }`（特異度 0,1,0）を上書き
**理由**: ユーザー選択。alwaysShowFolders が ON でも `_` フォルダは非表示

### D4: 対象はフォルダのみ

**決定**: `_` プレフィックスの**フォルダのみ**非表示。ファイル（例: `_note.md`）は対象外
**理由**: ユーザー選択。フォルダ指定に忠実

### D5: フィルタ OFF 時は無効

**決定**: `whitelist.enabled=false` のときは `_` フォルダ非表示も無効（CSS 注入されない）
**理由**: ユーザー選択。Whitelist 全体 OFF の一貫性を維持

### D6: トップレベル + サブフォルダ両方

**決定**: `[data-path^="_"]`（トップレベル `_` フォルダ）+ `[data-path*="/_"]`（サブフォルダの `_` フォルダ）の両方を対象
**理由**: 「フォルダ名の先頭が `_`」をフルパスで判定するため

### D7: extensions 空でも `_` フォルダ非表示は有効

**決定**: `extensions.length === 0 && !hideUnderscoreFolders` のときのみ `null` を返す
**理由**: 拡張子フィルタが空でも `_` フォルダ非表示だけ有効にできる

---

## アーキテクチャ

### データモデル

```typescript
export interface WhitelistSettings {
  enabled: boolean;
  extensions: string[];
  alwaysShowFolders: boolean;
  // === v0.22.0: _ プレフィックスフォルダ非表示 ===
  hideUnderscoreFolders: boolean;  // 既定 true
}

export const DEFAULT_WHITELIST_SETTINGS: WhitelistSettings = {
  enabled: true,
  extensions: ['md', 'canvas', 'pdf', 'png', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  alwaysShowFolders: true,
  hideUnderscoreFolders: true,  // ← 追加
};
```

### CSS 出力

`buildWhitelistCss(extensions, alwaysShowFolders, hideUnderscoreFolders)` の出力:

```css
/* ── Claudian Bridge Whitelist ── */
.nav-files-container .nav-file:not(:has(
  > .nav-file-title:is(
    [data-path$=".md" i],
    [data-path$=".canvas" i]
  )
)) {
  display: none !important;
}
/* folders always visible */
.nav-folder { display: flex !important; }
/* hide _-prefixed folders (v0.22.0) */
.nav-folder:has(> .nav-folder-title[data-path^="_"]),
.nav-folder:has(> .nav-folder-title[data-path*="/_"]) {
  display: none !important;
}
```

### 優先関係（CSS 特異度）

| セレクタ | 特異度 | 適用 |
|---------|--------|------|
| `.nav-folder` | 0,1,0 | alwaysShowFolders の display:flex |
| `.nav-folder:has(> .nav-folder-title[data-path^="_"])` | 0,3,0 | `_` フォルダ display:none |
| `.nav-folder:has(> .nav-folder-title[data-path*="/_"])` | 0,3,0 | サブ `_` フォルダ display:none |

→ `:has()` 側が特異度で勝ち、`_` フォルダ非表示が優先される。

---

## データフロー

```mermaid
graph TB
    subgraph 設定 [設定]
        A[SettingTabWhitelist トグル]
        B[normalizeWhitelistSettings]
    end
    A -->|save| B
    B -->|hideUnderscoreFolders| C[buildWhitelistCss]
    C -->|CSS| D[installWhitelistCss]
    D -->|style 要素| E[Obsidian DOM]
    E -->|.nav-folder:has(...) セレクタ| F[_ フォルダ非表示]
```

---

## API 契約

### `buildWhitelistCss` シグネチャ変更

```typescript
export function buildWhitelistCss(
  extensions: string[],
  alwaysShowFolders: boolean,
  hideUnderscoreFolders: boolean,  // 追加
): string | null
```

### `normalizeWhitelistSettings` 拡張

```typescript
hideUnderscoreFolders: r.hideUnderscoreFolders ?? DEFAULT_WHITELIST_SETTINGS.hideUnderscoreFolders,
```

### `validateClaudianBridgeSettings` 拡張

```typescript
if (typeof cfg.whitelist.hideUnderscoreFolders !== 'boolean') return 'whitelist.hideUnderscoreFolders は boolean である必要があります';
```

---

## 設定変更詳細

### `src/core/settings.ts`

1. `WhitelistSettings` interface に `hideUnderscoreFolders: boolean` 追加
2. `DEFAULT_WHITELIST_SETTINGS` に `hideUnderscoreFolders: true` 追加
3. `normalizeWhitelistSettings` にフォールバック追加
4. `validateClaudianBridgeSettings` に boolean チェック追加

### `src/core/i18n.ts`

| 言語 | `whitelistHideUnderscoreFolders` | `whitelistHideUnderscoreFoldersDesc` |
|------|--------------------------------|--------------------------------------|
| ja | `📁 _ で始まるフォルダを非表示` | `フォルダ名の先頭が _ のフォルダ（例: _テンプレート）をファイルエクスプローラから非表示にします` |
| en | `📁 Hide _-prefixed folders` | `Hide folders whose name starts with _ (e.g. _templates) from the file explorer` |
| zh | `📁 隐藏 _ 开头的文件夹` | `将名称以 _ 开头的文件夹（例如 _templates）从文件浏览器中隐藏` |

### `src/settings/SettingTabWhitelist.ts`

「フォルダは常に表示」トグルの直後に追加。

### `src/features/whitelist/css-builder.ts`

`hideUnderscoreFolders` パラメータ追加 + セレクタ生成:

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

### `src/main.ts`

`buildWhitelistCss` 呼び出し 2 箇所を更新:

```typescript
const css = buildWhitelistCss(w.extensions, w.alwaysShowFolders, w.hideUnderscoreFolders);
```

---

## マイグレーション

### 後方互換性

`hideUnderscoreFolders` フィールドが無い既存ユーザーの `data.json` は `normalizeWhitelistSettings` で `true` にフォールバック。破壊的変更なし。

### バージョン番号

| ファイル | 変更 |
|---------|------|
| `src/manifest.json` | `0.21.1` → `0.22.0` |
| `package.json` | `0.21.1` → `0.22.0` |
| `versions.json` | `"0.22.0": "1.7.2"` を追加 |

---

## テスト計画

### `tests/features/whitelist/css-builder.test.ts` に追加

| # | テストケース | 検証内容 |
|---|-------------|---------|
| 1 | `hideUnderscoreFolders=true` で `_` フォルダ非表示セレクタを含む | `[data-path^="_"]` と `[data-path*="/_"]` を含む |
| 2 | `hideUnderscoreFolders=true` でも alwaysShowFolders の flex ルール維持 | `.nav-folder { display: flex !important; }` を含む |
| 3 | `hideUnderscoreFolders=false` なら `_` フォルダセレクタを含まない | `[data-path^="_"]` と `[data-path*="/_"]` を含まない |
| 4 | extensions 空でも hideUnderscoreFolders=true なら CSS を返す | `null` でなく `_` セレクタを含む |

### `tests/core/settings.test.ts` に追加

| # | テストケース | 検証内容 |
|---|-------------|---------|
| 5 | `validateClaudianBridgeSettings`: hideUnderscoreFolders が boolean | `true` で null / 文字列でエラー |
| 6 | `normalizeWhitelistSettings`: デフォルト true | `normalizeWhitelistSettings({})` で `true` |
| 7 | `normalizeWhitelistSettings`: false 明示設定 | 保持される |

### 既存テストへの影響

`tests/features/whitelist/css-builder.test.ts` の既存 5 テストは 2 引数呼び出し → 3 引数に更新:

| 既存 | 変更後 | 期待 |
|------|--------|------|
| `buildWhitelistCss([], true)` | `buildWhitelistCss([], true, false)` | `toBeNull()`（D7: extensions 空 + _非表示 OFF → null） |
| `buildWhitelistCss(['md','pdf'], false)` | `buildWhitelistCss(['md','pdf'], false, false)` | 既存の期待を維持 |
| `buildWhitelistCss(['md'], true)` | `buildWhitelistCss(['md'], true, false)` | 既存の期待を維持 |
| `buildWhitelistCss(['md'], false)` | `buildWhitelistCss(['md'], false, false)` | 既存の期待を維持 |
| `buildWhitelistCss(['md'], false)` | `buildWhitelistCss(['md'], false, false)` | 既存の期待を維持 |

→ 既存 5 テストは `hideUnderscoreFolders=false` を明示して既存の動作を保持。新規 4 テストは `true` ケースを検証。

`tests/core/settings.test.ts` の Whitelist テストは DEFAULT 経由で自動対応。

---

## デプロイ

```bash
npm run build
# esbuild ビルド → obsidian-deploy.mjs 経由で .obsidian/plugins/claudian-bridge/ に配置
```

---

## リリースノート

`POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` に v0.22.0 エントリ追加:

```markdown
## v0.22.0 (2026-08-17)

### 新機能

- 📁 **「_」プレフィックスフォルダ非表示**: フォルダ名の先頭が `_` のフォルダ（例: `_テンプレート`）をファイルエクスプローラから非表示にします
- 設定画面「拡張子フィルタ」タブで ON/OFF 切替可能（既定 ON）
- 「フォルダは常に表示」より優先（`_` フォルダは常に非表示）

### 互換性

- 既存ユーザーの `data.json` への破壊的変更なし（`hideUnderscoreFolders` 未設定は自動的に `true`）
```

---

## 影響範囲

### 新規ファイル
- `docs/superpowers/specs/2026-08-17-underscore-folder-hide-design.md`（本仕様書）

### 変更ファイル
- `src/core/settings.ts`（WhitelistSettings 拡張）
- `src/core/i18n.ts`（3 言語 × 2 文字列）
- `src/features/whitelist/css-builder.ts`（3 引数化 + セレクタ）
- `src/settings/SettingTabWhitelist.ts`（トグル UI）
- `src/main.ts`（呼び出し 2 箇所）
- `src/manifest.json`（0.22.0）
- `package.json`（0.22.0）
- `versions.json`（0.22.0 追加）
- `tests/features/whitelist/css-builder.test.ts`（既存更新 + 新規 4 件）
- `tests/core/settings.test.ts`（新規 3 件）
- `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`（v0.22.0 エントリ）

### 非影響
- バックアップ機能、TTS、Chroma、Memory 機能には一切影響なし
- 既存 `data.json` 形式に破壊的変更なし

---

## オープンアイテム

なし（本仕様書で全要件確定）

---

*📚 v0.22.0 「_」プレフィックスフォルダ非表示デザイン仕様書 · MiuMiu 🐾 · 2026-08-17*