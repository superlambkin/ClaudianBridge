# トークン速度表示 項目選択機能 + 最大 tok/s 不具合修正 設計書

> 📂 パス：80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-01-token-rate-display-select-design.md
> 📍 源碼：`D:\AI-Agent\ClaudianBridge\src\features\token-rate\counter.ts` / `src\settings\SettingTabGeneral.ts` / `src\core\settings.ts` / `src\core\i18n.ts`
> 🏷️ バージョン：v1.0（設計 2026-09-01）
> 🔗 関連：[[80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート|リリースノート]]（F027 トークン速度表示）

---

## 1. 背景・目的

### 1.1 機能改良

F027（v0.30.0〜）で追加したトークン速度表示は「首 / 現在 / 平均 / 最大」の 4 項目が常に表示される。**項目ごとに ☑ で表示 ON/OFF を選択できるようにする**。

### 1.2 不具合

表示中の「現在」のピークより「最大 tok/s」が **高すぎる** 値になることがある。DOM 構造の変化（要素の一時消失・再構成・交代）時に偽のレートスパイクが `maxRate` に記録されるため。

---

## 2. 要件（ユーザー確定事項）

| # | 項目 | 決定内容 |
|:-:|------|------|
| 1 | ☑ UI の場所 | **設定画面**（設定 → ClaudianBridge → 一般タブ） |
| 2 | 選択対象 | **4 項目それぞれ**（首 / 現在 / 平均 / 最大） |
| 3 | 最大値のリセット | **セッション中維持**（現状踏襲・偽スパイク除去のみ実施） |

---

## 3. 実装方式

採用: **方式 A（項目ごとの boolean 設定 4 つ）**。既存の settings/i18n/validation パターンに完全準拠する。却下した方式 B（配列設定 1 つ）は検証・i18n・テスト量が増えるため不採用。

---

## 4. 設定（src/core/settings.ts）

```ts
// GeneralSettings に追加（既定は全 ON）
tokenRateShowTtft: boolean;    // 首（TTFT）
tokenRateShowCurrent: boolean; // 現在
tokenRateShowAvg: boolean;     // 平均
tokenRateShowMax: boolean;     // 最大
```

| # | 対応箇所 | 内容 |
|:-:|------|------|
| 1 | DEFAULTS | 4 キーを `true` で追加 |
| 2 | normalize | `typeof === 'boolean' ? value : true` で補完（既存 JSON との後方互換・マイグレーション不要） |
| 3 | validate | 4 キーの boolean チェック追加 |

---

## 5. i18n（src/core/i18n.ts）

ja / en / zh の 3 言語に 4 項目のラベルを追加:

| キー | ja | en | zh |
|------|------|------|------|
| `tokenRateShowTtft` | 首（TTFT）を表示 | Show TTFT | 显示首字延迟 |
| `tokenRateShowCurrent` | 現在速度を表示 | Show current rate | 显示当前速率 |
| `tokenRateShowAvg` | 平均速度を表示 | Show average rate | 显示平均速率 |
| `tokenRateShowMax` | 最大速度を表示 | Show max rate | 显示最大速率 |

---

## 6. 設定 UI（src/settings/SettingTabGeneral.ts）

| # | 項目 | 内容 |
|:-:|------|------|
| 1 | 配置 | 既存 `tokenRateEnabled` トグルの直下に 4 つの `new Setting().addToggle()` |
| 2 | 保存 | 既存パターン踏襲: `store.load()` → merge → `store.save()` → Notice |
| 3 | 親トグル連動 | `tokenRateEnabled` が OFF のときは 4 項目を `setDisabled` で視覚的無効化 |

---

## 7. 表示ロジック（src/features/token-rate/counter.ts）

### 7.1 セグメント化

```ts
interface SegmentSpec {
  key: 'ttft' | 'current' | 'avg' | 'max';
  visible: boolean;
  render: (s: TokenRateState) => string;
}
```

- `CounterOptions` に `visible?: { ttft, current, avg, max }`（既定全 true）を追加
- `el.innerHTML` を visible セグメントから動的生成。区切り `·` は**表示セグメント間のみ**挿入
- 全 OFF の場合はテキスト要素なし（ドットのみ）で要素は存続
- `tick()` 内の textContent 更新は `el.querySelector('.cb-token-rate-<key>')` が存在する場合のみ実行

### 7.2 不具合修正（最大 tok/s が高すぎる）

| # | 原因（想定） | 対策 |
|:-:|------|------|
| 1 | アシスタント要素が一瞬消えたとき `document.body 全文字数` をフォールバック使用 → 偽スパイク | フォールバック時は前回値を維持しレート計算をスキップ |
| 2 | ストリーミング中の DOM 再構成で文字数が一時減少 → 回復分が次の 500ms 窓に一括計上 | `dTokens < 0` のときベースラインのみ更新し、`rate` は前回値維持・`maxRate` を更新しない |
| 3 | アシスタント要素の交代（新メッセージ開始）で前メッセージ末尾と新メッセージ先頭を跨いで差分計算 | 要素が変わったら `lastTokens` ベースラインをリセットし、その窓の差分計算をしない |

> 🔧 実装時に superpowers:systematic-debugging で再現 → 根因特定 → 上記対策の妥当性検証を行う。

---

## 8. 設定反映のデータフロー

```mermaid
flowchart LR
    A["設定タブ ☑"] --> B["store.save"]
    B --> C["Notice 表示"]
    C --> D["body へ DOM 追加"]
    D --> E["既存 MutationObserver"]
    E --> F["rescan 再構築"]
    F --> G["visible 反映の counter 再注入"]
```

- 既存 `rescan()` は「`.cb-token-rate` が消えていたら再注入」のため、visible 変更では同じ場所に要素が残ってしまう
- → `rescan()` のチェックに **`data-visible` 属性の一致** を追加し、設定変更を検知したら破棄・再注入

---

## 9. エラーハンドリング

| # | ケース | 挙動 |
|:-:|------|------|
| 1 | 設定 JSON 壊れ / キー欠落 | normalize が既定 `true` を補完（既存パターン準拠） |
| 2 | visible が不正 | counter は落ちず、全セグメント非表示として動作 |

---

## 10. テスト（TDD / vitest）

| # | テスト | 検証内容 |
|:-:|------|------|
| 1 | visible 指定で対応 span が生成されない | DOM 構造 |
| 2 | 区切り `·` が表示セグメント間のみ | DOM 構造 |
| 3 | 全 OFF で要素は存続・ドットのみ | DOM 構造 |
| 4 | 設定変更 → rescan で再注入 | データフロー |
| 5 | フォールバック時にレート計算スキップ | 不具合修正① |
| 6 | 負の差分で maxRate 更新なし | 不具合修正② |
| 7 | 要素交代時に偽スパイクなし | 不具合修正③ |
| 8 | settings normalize / validation 4 キー | 設定層 |

---

## 11. スコープ外（明示）

- 「最大」のレスポンスごとのリセット（ユーザー判断: セッション中維持）
- 表示クリックによるポップアップ UI（却下案）
- intervalMs / charPerToken 等の表示オプション化

---

*📚 設計書 v1.0 · POC_017 ClaudianBridge · 2026-09-01*
