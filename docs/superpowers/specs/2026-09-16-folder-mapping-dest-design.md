# フォルダマッピング先の設定可能化（F-050）設計仕様書

> 📂 パス：docs/superpowers/specs/2026-09-16-folder-mapping-dest-design.md
> 📍 源码：D:\AI-Agent\ClaudianBridge\src\features\folder-mapping\、src\settings\FolderMappingModal.ts、src\settings\SettingTabWhitelist.ts、src\core\settings.ts、src\core\i18n.ts
> 🏷️ バージョン：v1.0（2026-09-16 設計・承認待ち）
> 🔗 機能番号：F-050（F-049 フォルダマッピングの拡張）

---

## 1. 背景・目的

F-049（v0.50.0）のフォルダマッピングは Vault 内リンク先が `@10_Input` 固定だった。
実機 UAT の結果、以下が判明した：

| # | 事実 |
|:-:|------|
| A | Obsidian は **ネットワークドライブ（NAS）をターゲットにした junction の中身をインデックスしない**（ローカル C: は表示される。実験で確認：local-link ✅ / nas-ocr-link ❌） |
| B | ユーザーはリンク先を `@10_Input` ではなく既存の `10_Input` 等の**任意の Vault 内フォルダ**に指定したい |
| C | `@` 付きフォルダ名は特殊な見た目で、既存の `10_Input` 構造と重複している |

本設計で次を実現する：

| # | 項目 |
|:-:|------|
| A | 設定モーダルに「マッピング先（Vault 内パス）」欄を追加。例: `C:/OCR` → Vault 内 `10_Input/OCR` として表示 |
| B | 既存レコード（vaultSubpath 欄なし）は `10_Input` へ自動移行（`@10_Input` 廃止方向） |
| C | 旧 `@10_Input` に残った junction は起動時に新パスへ自動貼り直し |

---

## 2. 要件（決定済み・ユーザー承認済み）

| # | 要件 | 決定 |
|:-:|------|------|
| R1 | 指定方法 | モーダルに「Vault 内パス」欄を追加（Vault 相対パス入力）。存在しなければ junction 作成時に自動作成 |
| R2 | デフォルト値 | `10_Input` |
| R3 | 既存移行 | 既存レコード（vaultSubpath 無し / 空）は normalize で `10_Input` を注入 |
| R4 | 旧 junction | `@10_Input/{linkName}` に残った junction は `applyAll` 冒頭で削除 → 新パスへ貼り直し |
| R5 | バリデーション | `..` / 絶対パス / dot フォルダ / `@` 先頭を拒否 |
| R6 | アプローチ | 案 A：`vaultSubpath` フィールド新設（linkName のフルパス化はしない） |
| R7 | リリース | **v0.51.0 / F-050** |
| R8 | F-049 既存機能 | 状態マシン・Notice・§7.3 ロールバック等は無変更（resolveLinkPath と移行のみ変更） |

---

## 3. 型・バリデーション・Manager 変更

### 3.1 型追加

```typescript
// src/features/folder-mapping/types.ts
export interface FolderMapping {
  id: string;
  linkName: string;
  /** Vault 内マッピング先（Vault 相対パス・例: "10_Input"）。
   *  旧レコードは normalize で '10_Input' が注入される */
  vaultSubpath: string;
  externalPath: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 3.2 `validateVaultSubpath`（validation.ts に追加）

```typescript
export function validateVaultSubpath(
  subpath: string,
): { ok: true; normalized: string } | { ok: false; reason: 'empty' | 'not_relative' | 'dot_folder' | 'forbidden_prefix' | 'invalid_segment' };
```

| ルール | reason |
|--------|--------|
| 空 or 区切り文字のみ | `empty` |
| `..` を含む / 絶対パス（`C:\` `/` `\` で開始） | `not_relative` |
| `.` で始まる階層（`.obsidian` 等） | `dot_folder` |
| `@` で始まる階層 | `forbidden_prefix` |
| 階層名が linkName と同一の文字種制限（1〜64 文字・`/\` 以外の禁則文字）に違反 | `invalid_segment` |

- パス区切りは `/` `\` 両方受付 → `nodePath.normalize` で正規化し、戻り値 `normalized` に含める
- 親フォルダは既存の `mkdirSync(recursive)` で自動作成

### 3.3 Manager 変更

```typescript
// resolveLinkPath のみ変更
resolveLinkPath(mapping: FolderMapping): string {
  return nodePath.join(this.deps.vaultBasePath, mapping.vaultSubpath, mapping.linkName);
}
```

**旧 junction 自動貼り直し**（`applyAll` 冒頭）：

```typescript
const LEGACY_SUBPATH = '@10_Input';

// applyAll 冒頭で各 mapping に対して:
// 旧パス junction が存在し、かつ vaultSubpath !== LEGACY_SUBPATH なら rmdir（junction のみ・安全）
// → 以降の通常 apply() が新パス（{vaultSubpath}/{linkName}）に作り直す
```

- 旧パスが実フォルダ（junction でない）場合は触らない（`vault_exists` と同じ安全策）
- Notice: 「旧 `@10_Input/{linkName}` のリンクを `{vaultSubpath}/{linkName}` へ移行しました」

---

## 4. マイグレーション・UI

### 4.1 normalize での移行（settings.ts）

```typescript
// 既存レコードに vaultSubpath が無い / 空文字 → '10_Input' を注入
folderMappings: (r.general?.folderMappings ?? []).map((m) => ({
  ...m,
  vaultSubpath: (m as { vaultSubpath?: string }).vaultSubpath?.trim() || '10_Input',
})),
```

### 4.2 Modal 変更

- 入力欄を追加：**「マッピング先（Vault 内パス）」**・デフォルト `10_Input`
- リアルタイムバリデーション（`validateVaultSubpath`）
- 編集モード時：`vaultSubpath` 変更も junction 削除→再作成（既存仕様 §7.3 と同じ扱い）
- 説明文：例「`10_Input` + リンク名 `OCR` → `10_Input/OCR` に表示されます」

### 4.3 i18n（2 keys × 3 locales）

| キー | ja |
|------|-----|
| `folderMappingVaultSubpath` | `マッピング先（Vault 内パス）` |
| `folderMappingVaultSubpathDesc` | `例: 10_Input を指定するとリンク名と合わせて 10_Input/OCR に表示されます` |

### 4.4 一覧 UI（SettingTabWhitelist）

行表示を `🔗 {linkName}` → `🔗 {vaultSubpath}/{linkName}` に変更（実効パスが分かる形）

---

## 5. テスト戦略

| 対象 | ケース数 | 主な内容 |
|------|:---:|---------|
| `validateVaultSubpath` | 7 | 空 / `..` / 絶対パス / dot フォルダ / `@` 先頭 / 正常（`10_Input`, `a/b/c`） |
| `resolveLinkPath` | 1 | `10_Input/OCR` 生成 |
| normalize 移行 | 2 | 旧レコードへ `10_Input` 注入・既存 `vaultSubpath` 維持 |
| 旧 junction 貼り直し | 2 | `@10_Input/OCR` 削除 → `10_Input/OCR` 作成 / 旧パス無しは何もしない |
| **合計** | **+12** | 既存 1399+1 → ~1411+1 |

### UAT（受け入れ基準）

- [ ] モーダルに「マッピング先（Vault 内パス）」欄があり、デフォルト `10_Input`
- [ ] `C:\OCR` → `10_Input/OCR` として Vault 内に表示され、双方向で読み書きできる
- [ ] 既存 `@10_Input/OCR` junction が起動後に `10_Input/OCR` へ自動移動する
- [ ] 旧レコード（vaultSubpath 無し）が normalize 後に `10_Input` を持つ
- [ ] `..` / `C:\` / `.obsidian` / `@xxx` を入力するとエラー表示になる
- [ ] F-049 の既存テスト（1399 件）が全て通る

---

## 6. リリース計画

| 項目 | 内容 |
|------|------|
| バージョン / F 番号 | **v0.51.0 / F-050** |
| 影響ファイル | types.ts / validation.ts / manager.ts / settings.ts / FolderMappingModal.ts / SettingTabWhitelist.ts / i18n.ts / 各テスト / CHANGELOG / package.json / manifest ×2 |
| 後方互換 | 既存 data.json は normalize で自動移行・旧 junction は起動時に自動貼り直し・ユーザー操作不要 |
| ロールバック | v0.50.x へ戻せば旧挙動（@10_Input 固定）に戻る。`10_Input/{name}` の junction は実フォルダでないため手動削除のみで無害 |

### 制限事項（F-049 UAT で判明・設計書に追記）

- **Obsidian はネットワークドライブ（NAS）をターゲットにした junction の中身をインデックスしない**。ローカルドライブのフォルダのみ Obsidian 表示が有効。NAS のフォルダは Claudian / Claude Code 経由の読み書きは可能だが、Vault エクスプローラには表示されない
- NAS mount 対応は Folder Bridge 系アプローチで別途検討（本リリースでは対応しない）

---

## 7. 将来展望（参考・本リリースでは対応しない）

- **NAS mount 対応**：Folder Bridge 系（Obsidian_FolderBridge 等）の調査・対応検討（ユーザー承認済みの次ステップ）
- **Vault 内パスのフォルダサジェスト UI**：テキスト入力 → 既存フォルダ選択 UI への置換
- **`getVaultBasePath` 重複整理**・**Modal ボタンラベル i18n 化**（F-049 follow-up）

---

*📚 設計書 v1.0 · ClaudianBridge F-050 · 2026-09-16 設計・承認待ち*
