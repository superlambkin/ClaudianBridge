# タスク完了報告の読上げ用スクリプト整形 設計書

> 📅 日付: 2026-08-30
> 🎯 対象: ClaudianBridge TTS 自動読上げ（full スコープ）
> 📌 状態: 設計承認済み（ユーザー承認 2026-08-30）

---

## 1. 背景と目的

タスク完了報告（✅ 完了 見出しを持つ回答）を TTS 自動読上げすると、見出し記号・テーブル内容・参照文献などがそのまま読まれ、聴いて理解しにくい。

本設計では、完了報告を次のような**敬体の読上げスクリプト**に変換する:

```text
タスク完了です。
📢 <報告ヘッダーの文章>
結論。 <結論サマリー>
次のアクション提案です。 <次のアクション提案サマリー>
```

## 2. 要件（ユーザー確認済み）

| # | 要件 | 確認方法 |
|:-:|------|:--------:|
| 1 | 適用範囲は**完了報告の自動読上げのみ**（通常回答は従来どおり全文読上げ） | 質問 1 |
| 2 | 読み上げ章は **📢 ヘッダー → 🎯 結論 → 🔜 次のアクション提案** の 3 要素。**🎁 成果物・検証結果・参照文献は読まない**（ユーザー修正 2026-08-30） | 質問 2 + レビュー修正 |
| 3 | 設定トグル（既定 ON）をテキスト読み上げタブに追加 | 質問 3 |

## 3. 方式

**DOM 構造ベースの収集（方式 A）** を採用。レンダリング後の DOM から既存の除外機構（thinking/table/code/tool）を流用して「見出し語＋直下サマリー段落」を収集する。

採用理由: 既存 `extract-report.ts` の hide/exclude 機構をそのまま再利用でき、動作が決定的で jsdom テストが容易。正規表現による markdown 後処理（方式 B）はレンダリング後 innerText の構造崩れで壊れやすく、LLM 整形（方式 C）は遅延・コスト・非決定性の問題があるため不採用。

## 4. コンポーネント設計

### 4.1 新規: `src/features/tts/report-script.ts`

```ts
export function isCompletionReport(source: Element): boolean;
export function buildReportScript(source: Element, excludeSel: string): string | null;
```

- `isCompletionReport`: 既存 `extract-report.ts` の完了見出し条件（「✅」で始まり「完了 / 修正 / 実装」を含む見出しが存在）と同一判定。
- `buildReportScript`: 次の順でスクリプトを組み立てる。

| 順 | 収集元 | 見出し語（読上げ） | 収集内容 |
|:-:|------|------|------|
| 1 | 📢 blockquote（`isSummaryMarker` と同じ条件） | なし（文章のまま） | blockquote の全文 |
| 2 | 見出し `🎯 結論` | `結論。` | 見出し直下の最初の非空段落 |
| 3 | 見出し `🔜 次のアクション提案` | `次のアクション提案です。` | 同上 |

- **段落の終端条件**: 見出しの `nextElementSibling` を辿り、見出し・table・blockquote・thinking・code・tool-call に到達したら停止。最初の非空テキストのみ採用（サマリーは 100 字以内運用のため 1 段落で十分）。
- **除外**: `excludeSel`（既存 `buildSpeechExclude` の結果）を `readVisibleTextExcluding` にそのまま渡す。
- 全要素が空の場合は `null` を返し、呼び出し側は従来の全文読上げへフォールバックする。

### 4.2 `extract-report.ts` の変更

`extractReportText` の full スコープ冒頭に分岐を追加:

```ts
if (scope === 'full') {
  if (opts?.reportScript && isCompletionReport(source)) {
    const script = buildReportScript(source, speechExclude);
    if (script) return script; // dedup マーク付与は従来パスと同様
  }
  // 従来の全文読上げへフォールバック
}
```

- `opts` に `reportScript?: boolean` を追加（既定 false・後方互換）。
- ヘッダー / 結論検索など既存スコープの動作は一切変更しない。

### 4.3 設定

| 項目 | 値 |
|------|------|
| 設定キー | `tts.autoReadReportScript: boolean` |
| 既定値 | `true` |
| normalize | `settings.ts` で `typeof === 'boolean'` ガード＋既定補填 |
| UI | テキスト読み上げタブにトグル追加（i18n 3 言語: ja / zh / en） |
| 呼び出し側 | 自動読上げ経路で `cfg.tts.autoReadReportScript` を `opts.reportScript` に渡す |

### 4.4 除外するもの（読み上げないもの）

- テーブル（成果物テーブル・次のアクション提案テーブル・参照文献）
- 🎁 成果物 章（サマリーも含め読まない）
- ✅ 検証結果 章（見出し自体も読まない）
- 📚 参照文献 章
- thinking / code / tool-call（既存除外）

## 5. エラー処理・フォールバック

| 状況 | 動作 |
|------|------|
| 完了見出しが無い | 従来の full 全文読上げ |
| サマリー段落が無い章 | その章を読み飛ばす（見出し語も読まない） |
| スクリプト全体が空 | 従来の full 全文読上げ |
| 設定 OFF | 従来の full 全文読上げ |

## 6. テスト計画

| # | テスト | ファイル |
|:-:|------|---------|
| 1 | 完了報告 DOM → 期待スクリプト（📢 + 結論 + 次のアクション提案 + 見出し語） | `tests/features/tts/report-script.test.ts`（新規） |
| 2 | 🎁 成果物・検証結果・参照文献・テーブルが含まれないこと | 同上 |
| 3 | サマリー欠落章の読み飛ばし | 同上 |
| 4 | 完了報告でない場合は null（フォールバック確認） | 同上 |
| 5 | `reportScript: true` + 完了報告 → スクリプト読上げ / false → 全文（既存 auto-read 統合テストに追従） | 既存 `auto-read.test.ts` / `integration.test.ts` |

## 7. スコープ外（YAGNI）

- 手動読上げ（Add to TTS）への適用
- 🎁 成果物・検証結果・参照文献の読み上げ
- LLM による文面整形
- 見出し語のカスタマイズ設定

---

*📋 設計書 v1.0.0 · ClaudianBridge POC_017 · MiuMiu 🐾 · 2026-08-30*
