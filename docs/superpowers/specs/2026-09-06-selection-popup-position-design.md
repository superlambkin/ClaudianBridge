# 選択ポップアップ位置設定 設計書

> 📅 2026-09-06
> 🏷️ F-032: 選択ポップアップ位置（top-right / bottom）
> 🌿 対象ブランチ: `feature/f032-selection-popup-position`（実装時に作成）

---

## 1. 概要

MD テキスト選択時に表示される `Add to Claudian` / `Add to TTS` ポップアップの
**表示位置**を「右上」または「下」から選択できる設定を追加する。

### 背景

- 現状: `src/features/selection/popup.ts` の `positionPopup` は
  選択範囲の **下端** に常に表示する
- 課題: 選択テキストの直下だとページ下端で折り返したり、
  選択範囲が大きいと UI が押し下げられたりする
- 要望: 選択範囲の **右上** にポップアップを表示する（既定）
- 互換性: 既存ユーザーが「下」配置を好む場合に備え、設定で切替可能とする

### ゴール

| # | ゴール |
|---|--------|
| G1 | 新規設定 `selection.popupPosition: 'top-right' \| 'bottom'` を追加（既定 `top-right`） |
| G2 | `positionPopup` を両モードに対応させ、ビューポート端のクランプと反転ロジックを統一 |
| G3 | 設定 UI（SettingTabGeneral）にドロップダウンを追加 |
| G4 | 既存テストを保持しつつ、top-right ケースのテストを追加 |

---

## 2. アーキテクチャ

### 2.1 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/features/selection/popup.ts` | `positionPopup` に第3引数 `mode` を追加（`'top-right' \| 'bottom'`）、top-right 配置ロジック追加 |
| `src/core/settings.ts` | `SelectionSettings.popupPosition` 追加、`normalizeSettings` でマイグレーション |
| `src/settings/SettingTabSelection.ts` | 設定画面に「ポップアップ位置」ドロップダウン追加 |
| `src/core/i18n.ts` | i18n 文字列追加 |
| `tests/features/selection/popup.test.ts` | top-right ケース追加・既存テストの `mode='bottom'` 明示 |
| `tests/features/selection/watcher.test.ts` | 新既定値の検証 |

### 2.2 影響を受けないもの

- `buildPopup` (DOM 構造は据え置き)
- `core.ts` の `addTextToClaudian`
- `styles.css`（`position: fixed` のまま、top/left の値が変わるだけ）
- `package.json`, `manifest.json`（バージョン番号のみ更新）

---

## 3. データモデル

### 3.1 `SelectionSettings` 拡張

```typescript
// src/core/settings.ts
export type PopupPosition = 'top-right' | 'bottom';

export type SelectionSettings = {
  enabled: boolean;
  folderEnabled: boolean;
  delayMs: number;
  objectMenuEnabled: boolean;
  popupPosition: PopupPosition;  // ★ 新規
};
```

### 3.2 既定値

```typescript
const DEFAULT_SELECTION_SETTINGS: SelectionSettings = {
  enabled: true,
  folderEnabled: true,
  delayMs: 300,
  objectMenuEnabled: true,
  popupPosition: 'top-right',  // ★ 新規既定
};
```

### 3.3 マイグレーション

`normalizeSettings`（既存）に 1 行追加：

```typescript
popupPosition:
  r.selection?.popupPosition === 'bottom' ? 'bottom' : 'top-right',
```

`r.selection?.popupPosition` が `'bottom'` のときだけ `bottom` を採用し、
未設定・それ以外（後方互換も含む）は `'top-right'` を既定とする。

---

## 4. 配置ロジック

### 4.1 関数シグネチャ変更

```typescript
// src/features/selection/popup.ts
export type PopupPosition = 'top-right' | 'bottom';

export function positionPopup(
  popupEl: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
  mode: PopupPosition = 'top-right',
): void
```

### 4.2 計算式

| mode | 基準位置 | left | top |
|------|---------|------|-----|
| `'top-right'` | 選択の右上、外接 6px | `rect.right - w` | `rect.top - h - margin` |
| `'bottom'` | 選択の直下、外接 6px | `rect.left` | `rect.bottom + margin` |

### 4.3 ビューポート処理

両モード共通で `margin = 6` を保証。

**top-right モード**:

```typescript
let left = rect.right - w;
if (left + w + margin > vw) left = vw - w - margin;  // 右はみ出し → 左にクランプ
left = Math.max(margin, left);

let top = rect.top - h - margin;
if (top < margin) {
  // 上はみ出し → 選択範囲の下に反転
  top = rect.bottom + margin;
}
top = Math.max(margin, top);
```

**bottom モード**（現状維持）:

```typescript
let left = rect.left;
if (left + w + margin > vw) left = vw - w - margin;
left = Math.max(margin, left);

let top = rect.bottom + margin;
if (top + h + margin > vh) {
  // 下はみ出し → 選択範囲の上に反転
  top = rect.top - h - margin;
}
top = Math.max(margin, top);
```

### 4.4 呼び出し側

```typescript
// src/features/selection/watcher.ts（修正）
const cfg = store.load();
// ...
positionPopup(popupEl, rect, cfg.selection.popupPosition);
```

---

## 5. 設定 UI

### 5.1 SettingTabSelection.ts への追加

既存の selection.* 設定群の末尾に dropdown を追加：

```typescript
// src/settings/SettingTabSelection.ts 内の既存 selection.* セクション末尾に追加
new Setting(containerEl)
  .setName(s.selectionPopupPosition)
  .setDesc(s.selectionPopupPositionDesc)
  .addDropdown((dd) => {
    dd.addOption('top-right', s.selectionPopupPositionTopRight);
    dd.addOption('bottom', s.selectionPopupPositionBottom);
    dd.setValue(cfg.selection.popupPosition);
    dd.onChange(async (value) => {
      try {
        store.save({ ...cfg, selection: { ...cfg.selection, popupPosition: value as PopupPosition } });
        new Notice(s.noticeSaved);
      } catch (e) {
        new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        draw();
      }
    });
  });
```

### 5.2 i18n キー

| キー | 日本語 | English |
|------|--------|---------|
| `selectionPopupPosition` | 🌐 ポップアップ位置 | Selection popup position |
| `selectionPopupPositionDesc` | テキスト選択時のポップアップ表示位置 | Position of the popup on text selection |
| `selectionPopupPositionTopRight` | 右上 | Top right |
| `selectionPopupPositionBottom` | 下 | Bottom |

### 5.3 UI 判断の根拠

- **dropdown 形式**: 2 値のトグルより `top-right` ↔ `bottom` で文字列が切り替わるほうが直感的
- **desc**: 設定画面で「現在の挙動」と「選択肢の意味」を即理解できる

---

## 6. テスト計画

### 6.1 `popup.test.ts`

| ケース | 期待値 | 種別 |
|--------|--------|------|
| `top-right` 既定で `rect={100,200,300,220}` w=100,h=40 → `left=200, top=154` | ✓ | 新規 |
| `top-right` で `rect.top < h + margin` → 選択範囲下（`bottom + 6`）に反転 | ✓ | 新規 |
| `top-right` で右はみ出し → 既存と同じ左クランプ | ✓ | 新規 |
| `top-right` で `margin` 未満を防止 | ✓ | 新規 |
| `bottom` モード全ケース（引数明示） | 既存流用 | 引数追加のみ |

### 6.2 `watcher.test.ts`

| ケース | 期待値 | 種別 |
|--------|--------|------|
| `popupPosition` 既定が `'top-right'` になっていること | ✓ | 新規 |
| `cfg.selection.popupPosition === 'bottom'` で `top` が `bottom + 6` になること | ✓ | 既存拡張 |

---

## 7. エラーハンドリング

| ケース | 挙動 |
|--------|------|
| `popupPosition` が未知の値 | TypeScript で防止。ランタイムは `if (mode !== 'top-right')` で `bottom` 扱い |
| 選択範囲が画面外 | `Math.max(margin, ...)` クランプで画面端に張り付く |
| popup 要素が未アペンド | `offsetWidth/Height` が 0 になるが、`margin` クランプで画面端に張り付く |
| 設定マイグレーション失敗 | `r.selection?.popupPosition` が `undefined` なら `'top-right'` |

---

## 8. 影響範囲チェック

- ✅ `popup.ts` の `buildPopup` には変更なし（DOM 構造据え置き）
- ✅ `watcher.ts` の `setupSelectionWatcher` は `positionPopup` 呼び出し 1 行の引数追加のみ
- ✅ `core.ts` (`addTextToClaudian`) には変更なし
- ✅ CSS（`styles.css`）に変更なし（`position: fixed` のまま、top/left の値が変わるだけ）
- ⚠️ 既存ユーザーへの **可視挙動変更**: ポップアップ位置が「下」→「右上」に変わる（設定で `bottom` に戻せる）

---

## 9. リリース計画

### 9.1 バージョン

- **v0.36.0**（マイナー追加：新規設定・既定値追加のため）

### 9.2 ドキュメント更新

| ファイル | 更新内容 |
|---------|---------|
| `data.json` | マイナー番号上げ（0.35.x → 0.36.0） |
| `CHANGELOG.md` | v0.36.0 エントリ追加 |
| `08_説明書/03_リリースノート/リリースノート.md` | v1.X.0 リリース |
| `03_開発文書/05_進捗ボード.md` | F-032 追加・進捗更新 |
| `versions.json` | 0.36.0 追加 |
| `manifest.json` | version 0.36.0 |

### 9.3 ブランチ戦略

```
main
 └─ feature/f032-selection-popup-position  (新規)
     ├─ docs: 設計書・plan コミット
     ├─ feat(settings): popupPosition 追加
     ├─ feat(popup): top-right 配置ロジック
     ├─ feat(ui): SettingTabGeneral に dropdown 追加
     ├─ feat(i18n): 4 キー追加
     ├─ test(popup): top-right ケース追加
     └─ test(watcher): 既定値検証
```

---

## 10. 用語

| 用語 | 意味 |
|------|------|
| ポップアップ | テキスト選択時に表示される `Add to Claudian` / `Add to TTS` ボタン群（`.cb-popup`） |
| 外接 | ポップアップが選択テキストに重ならず、6px の余白を保って隣接する配置 |
| 反転 | ビューポート端でポップアップ位置を上下入れ替えること |
| クランプ | ビューポート端に押し戻すこと |
