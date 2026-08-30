# Claudian Bridge クォータ表示窓選択トグル 設計書

> 📂 パス：80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/_superpowers原本/2026-08-16-quota-window-toggle-design.md
> 📍 ソース：D:/AI-Agent/ClaudianBridge（v0.15.0 + 智谱プロバイダ追加後）
> 📍 関連：[[2026-08-15-zhipu-quota-provider-design]]（智谱プロバイダ）

---

## 一、目的

智谱プロバイダの表示を「週間（45%）」に切り替えたい、という要望から、**全プロバイダのクォータ表示窓（5時間 / 週間）を設定画面から選択可能**にする。

### 1.1 実 API 調査結果（2026-08-16 実機確認）

| プロバイダ | 5時間データ | 週間データ | 週間化 |
|------------|:-----------:|:-----------:|:------:|
| Zhipu | ✅ `unit: 3` | ✅ `unit: 6` | ✅ 可能 |
| Claude | ✅ `fiveHour` | ✅ `sevenDay`（取得済み） | ✅ 可能 |
| MiniMax | ✅ `current_interval_remaining_percent` | ✅ `current_weekly_remaining_percent` | ✅ 可能 |
| Kimi | ✅ `window.duration=300` | ❌ **API が返さない**（実機確認） | ❌ 不可 |
| DeepSeek | —（残金表示） | — | ❌ 対象外 |

> 調査時点で Kimi の応答は 5 時間窓のみ（`duration: 300`）。週間トグルは表示しない。

### 1.2 非目標

- ❌ Kimi の週間表示（API がデータを返さないため）
- ❌ DeepSeek の窓切替（残金表示のため）
- ❌ 窓の自動判定（ユーザー選択のみ）

---

## 二、データモデル

```typescript
// core/settings.ts
export type QuotaWindow = '5h' | 'week';

export interface QuotaWindowSettings {
  zhipu: QuotaWindow;    // 既定 '5h'
  claude: QuotaWindow;   // 既定 '5h'（week = sevenDay 窓）
  minimax: QuotaWindow;  // 既定 '5h'
}
```

- `QuotaSettings` に `windows: QuotaWindowSettings` を追加
- 既定値は全て `'5h'`（現行動作と同じ → 後方互換）
- `normalizeClaudianBridgeSettings` / `validateClaudianBridgeSettings` に対応を追加

---

## 三、各プロバイダの変更

### 3.1 Zhipu（スクリプト + プロバイダ）

- Python スクリプト `_query_zhipu_quota.py`：環境変数 `ZHIPU_WINDOW`（既定 `5h`）を読み、`week` なら `unit: 6` を優先（フォールバック `unit: 3`）、`5h` なら `unit: 3` を優先（フォールバック `unit: 6`）
- `createZhipuProvider` に `getWindow: () => QuotaWindow` を追加し、`env: { ZHIPU_API_KEY, ZHIPU_WINDOW }` でスクリプトへ渡す

### 3.2 Claude

- `claudeSnapshotToProviderQuota(snap, window)` に窓パラメータを追加
- `window === 'week'` → `snap.windows.sevenDay` を使用（データは取得済み）

### 3.3 MiniMax

- `createMiniMaxProvider(getKey, opts?: { getWindow?: () => QuotaWindow })`
- `week` 時は `current_weekly_remaining_percent` を使用率に変換（使用率 = 100 − 残量%）
- レスポンス型に `current_weekly_*` フィールドを追加

### 3.4 Kimi / DeepSeek

- 変更なし（Kimi は 5h 固定、DeepSeek は残金）

---

## 四、UI（設定タブ）

- 表示モデル ON/OFF の下に「🪟 表示窓」セクションを追加
- Zhipu / Claude / MiniMax の 3 つのドロップダウン（`5時間` / `週間`）
- 説明文に「Kimi は 5 時間固定・DeepSeek は残金表示」と注記
- 変更は `store.save` で `quota.windows.<provider>` に永続化

### 4.1 i18n 追加文字列（ja / en / zh）

| キー | ja |
|------|------|
| `quotaWindowsHeading` | 🪟 表示窓 |
| `quotaWindowsDesc` | 使用率を表示する期間。Kimi は 5時間固定、DeepSeek は残金表示です |
| `quotaWindow5h` | 5時間 |
| `quotaWindowWeek` | 週間 |
| `quotaWindowClaude` | Claude の表示窓 |
| `quotaWindowZhipu` | Zhipu の表示窓 |
| `quotaWindowMinimax` | MiniMax の表示窓 |

---

## 五、テスト計画

| 対象 | 内容 |
|------|------|
| settings.test.ts | `windows` の既定値・正規化・バリデーション |
| zhipu.test.ts | `getWindow: 'week'` → `runPython` が `env.ZHIPU_WINDOW='week'` で呼ばれる |
| minimax.test.ts | 週間レスポンス → `current_weekly_remaining_percent` から使用率算出 |
| service.test.ts | `claudeSnapshotToProviderQuota(snap, 'week')` → sevenDay 使用 |
| 全体 | `npm test` / `npm run typecheck` / `npm run build` |
