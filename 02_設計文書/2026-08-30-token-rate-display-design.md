# トークン速度（tok/s）表示 設計書

> 📅 日付: 2026-08-30
> 🎯 対象: ClaudianBridge 入力画面（realclaudian ホスト）
> 📌 状態: 設計承認済み（ユーザー承認 2026-08-30）

---

## 1. 背景と目的

Claudian チャット利用時、LLM の応答生成速度は体感品質に直結する重要な指標である。現在 ClaudianBridge には **応答速度を可視化する仕組みが無く**、ユーザーは速度低下を体感でしか把握できない。

本設計では、realclaudian のレスポンス DOM を MutationObserver で監視し、**入力画面下部に tok/s をライブ表示**する機能を追加する。

## 2. 要件（ユーザー確認済み）

| # | 要件 | 確認方法 |
|:-:|------|:--------:|
| 1 | **ストリーミング中** はライブ更新（リアルタイム tok/s） | 質問 1（ライブ更新）|
| 2 | **DOM テキスト長を MutationObserver で追跡**（fetch フック / 内部 API は使わない） | 質問 2（A: DOM 追跡）|
| 3 | 表示位置は **入力画面全体の下（レスポンス下・入力欄の前）** | 質問 3（C: レスポンス下）|
| 4 | 設定は **表示 ON/OFF トグルのみ**（既定 OFF） | 質問 4（A: トグル 1 つ）|

## 3. 方式

**DOM MutationObserver + 250ms インターバル計算（方式 A）** を採用。

採用理由:
- realclaudian の内部 API（トークンイベント等）は外部公開されておらず、安定的にフックできない
- fetch / EventSource のインターセプトは脆く、realclaudian のバージョンアップで壊れやすい
- DOM ベースの観測は**依存最小・テスト容易**で、精度も「表示目的には十分」
- 250ms スロットルで再計算負荷を抑制し、CPU 負荷も問題なし

## 4. コンポーネント設計

### 4.1 新規: `src/features/token-rate/counter.ts`

```ts
export interface TokenRateState {
  startTime: number | null;
  startChars: number;
  currentChars: number;
  lastUpdateTime: number;
  lastTokens: number;
  rate: number;          // tok/s
  isStreaming: boolean;
}

export interface CounterOptions {
  charPerToken?: number;       // 既定 3（CJK + English の混合ヒューリスティック）
  intervalMs?: number;         // 既定 250
  fadeOutMs?: number;          // 既定 3000（ストリーミング終了から消えるまで）
}

export function createTokenRateCounter(
  containerEl: HTMLElement,    // 注入先（レスポンスエリア直後）
  options?: CounterOptions,
): {
  start(): void;
  stop(): void;
  destroy(): void;
  getState(): TokenRateState;
};
```

**計測ロジック**:

| ステップ | 内容 |
|----------|------|
| 1 | MutationObserver で `.claudian-message[data-role="assistant"]:last-of-type` の DOM 変更を監視 |
| 2 | 250ms ごとに `currentChars = textContent.length` を取得 |
| 3 | `tokens = currentChars / charPerToken` |
| 4 | `rate = (currentTokens - lastTokens) / 0.25`（tok/s）|
| 5 | DOM 更新: `<div class="cb-token-rate">12.3 tok/s ●</div>` の textContent |
| 6 | 2.5 秒間テキスト変化なし → `isStreaming = false`、fadeOutMs 後に opacity 0 |

**DOM セレクタ**:
- 注入位置: `.claudian-input-container` 内の `.claudian-messages` 直後（`.claudian-input-section` の前）
- 監視対象: `.claudian-message[data-role="assistant"]:last-of-type`
- ⚠️ realclaudian の DOM 構造は推定。実装時に実機検証してフォールバック処理を追加する。

### 4.2 新規: `src/features/token-rate/counter.css`

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

### 4.3 新規: `src/features/token-rate/index.ts`

```ts
export function setupTokenRate(
  app: App,
  store: ConfigStore,
): () => void;
```

- 設定 OFF: 何もしない（no-op）
- 設定 ON: `.claudian-input-container` が見つかり次第 counter を注入
- MutationObserver で `body.childList` 監視し、新規 Claudian インスタンスに対応
- クリーンアップ: 全 counter を destroy + Observer disconnect

### 4.4 設定

**`src/core/settings.ts`**:

```typescript
// DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general
tokenRateEnabled: false,

// type
tokenRateEnabled: boolean;

// マイグレーション（既存ユーザの config に対する default 適用）
typeof r.general?.tokenRateEnabled === 'boolean'
  ? r.general.tokenRateEnabled
  : false,

// バリデーション
if (typeof cfg.general.tokenRateEnabled !== 'boolean')
  return 'general.tokenRateEnabled は boolean である必要があります';
```

**`src/settings/SettingTabGeneral.ts`** に toggle 追加:
```
☑ トークン速度を表示（tok/s）
   レスポンス生成速度を入力画面の下にライブ表示します
```

### 4.5 i18n

**`src/core/i18n.ts`** に追加:

| key | ja | en |
|-----|----|----|
| `tokenRateLabel` | トークン速度を表示 | Show token rate |
| `tokenRateDesc` | レスポンス生成速度を入力画面の下にライブ表示します | Display live token generation rate below input |
| `tokenRateSuffix` | tok/s | tok/s |

### 4.6 配線

**`src/main.ts`** に追加:

```typescript
import { setupTokenRate } from './features/token-rate';

// onload 内で
const offTokenRate = setupTokenRate(this.app, this.store);
// onunload で
offTokenRate?.();
```

## 5. テスト（vitest）

### 5.1 `tests/features/token-rate/counter.test.ts`（新規）

| # | テスト | 検証内容 |
|:-:|--------|---------|
| 1 | 初期化 | `createTokenRateCounter()` で state が `{ startTime: null, rate: 0, ... }` |
| 2 | 開始 | `start()` 後 state.startTime がセットされる |
| 3 | DOM 変更でトークン増加 | MutationObserver 発火 → `currentChars` 更新 |
| 4 | 速度計算 | 250ms で 60 chars 追加 → rate ≈ 80 tok/s（60/3/0.25）|
| 5 | ゼロ除算防止 | 経過時間 0 で rate が NaN にならない |
| 6 | フェードアウト | stop 3 秒後に `.is-fading` クラス付与 |
| 7 | destroy | `destroy()` で Observer disconnect + DOM 要素削除 |

### 5.2 `tests/features/token-rate/index.test.ts`（新規）

| # | テスト | 検証内容 |
|:-:|--------|---------|
| 1 | 設定 OFF で非注入 | mock store が `tokenRateEnabled: false` → DOM に注入されない |
| 2 | 設定 ON で注入 | `true` → `.cb-token-rate` が `.claudian-messages` の直後に存在 |
| 3 | クリーンアップ | 戻り値関数で全 counter destroy |

## 6. 影響範囲

| ファイル | 変更種別 |
|----------|---------|
| `src/features/token-rate/counter.ts` | 新規 |
| `src/features/token-rate/counter.css` | 新規 |
| `src/features/token-rate/index.ts` | 新規 |
| `tests/features/token-rate/counter.test.ts` | 新規 |
| `tests/features/token-rate/index.test.ts` | 新規 |
| `src/core/settings.ts` | `general.tokenRateEnabled` 追加 |
| `src/core/i18n.ts` | `tokenRate*` キー追加 |
| `src/settings/SettingTabGeneral.ts` | toggle 項目追加 |
| `src/main.ts` | `setupTokenRate(app, store)` 呼び出し追加 |

## 7. 制約・リスク

| リスク | 対応 |
|--------|------|
| realclaudian DOM 構造の変動 | セレクタは最小（クラス名のみ）。実装時に実機検証して構造判明後に調整 |
| トークン推定の精度 | 文字数 / 3 のヒューリスティック（表示目的のため高精度不要）|
| 高頻度の DOM 変更 | 250ms スロットルで再計算負荷を抑制 |
| 複数 Claudian インスタンス | 各インスタンスごとに counter を生成・破棄 |
| 既存 config への後方互換 | マイグレーションで `false` デフォルト適用 |

## 8. バージョン

| 項目 | 値 |
|------|-----|
| 対象バージョン | v0.30.0（Minor）|
| 機能 ID | F024 |
| 影響テスト | 既存 812 件 + 新規 10 件 → 822 件目標 |

---

*📅 2026-08-30 · MiuMiu 🐾 · ユーザー承認済み*