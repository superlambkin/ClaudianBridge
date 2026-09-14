# MD 読み上げ再生制御強化 設計仕様書

> 📂 パス：docs/superpowers/specs/2026-09-04-md-read-playback-design.md
> 📍 源码：D:\AI-Agent\ClaudianBridge\src\features\tts\
> 🏷️ バージョン：v1.0（2026-09-04 設計・承認待ち）

---

## 1. 背景・目的

MD 読み上げ（Add to TTS）の操作ボックス（overlay）の ⏸（再生・停止）と ⏭（早送り）は
音声本体を制御しておらず実質無反応（state 更新のみ）。またチャンク分割は文字数のみで
文の途中・見出し途中で切れる。Edge 経路はチャンク間に合成待ちギャップがある。

本設計で次を実現する：

| # | 項目 |
|:-:|------|
| A | ⏸/⏭ ボタンの実働化（音声本体の一時停止・スキップ） |
| B | チャンク分割の自然化（見出し・文末優先） |
| C | Edge 経路の先行音声変換（チャンク間ギャップ解消） |
| D | ハイライト色のプルダウン選択 |
| E | 自動スクロール位置の設定化（既定 画面上から 40%） |

## 2. 要件（決定済み）

| # | 要件 | 決定 |
|:-:|------|------|
| R1 | スコープ | 統合設計（A〜E を 1 設計書に） |
| R2 | ⏭ 早送り | 次チャンクへスキップ（現音声中断 → 次チャンク再生・ハイライト追従） |
| R3 | チャンク区切り | 見出し（#〜）で必ず新チャンク → 文末（`。` `！` `？` 改行）優先で上限内パック → 上限超過は途中分割。上限は現状維持（140/500 字） |
| R4 | 色選択 UI | プルダウン（プリセット 8 色）＋自由入力欄の併存 |
| R5 | 先行変換の対象 | Edge 経路のみ新設（Plachta は既存パイプライン・WebSpeech は対象外） |
| R6 | スクロール位置 | 設定 `mdReadHighlight.scrollPositionPct`（0〜100・既定 40）・スライダー UI・範囲外は 40 フォールバック |

## 3. アーキテクチャ

```mermaid
graph TB
    subgraph 再生制御基盤
        PC["PlaybackController（新設）<br/>一時停止/再開/スキップ要求"]
        AU["playObjectUrl 拡張<br/>pause/resume ハンドル登録"]
        SC["speakChunks 拡張<br/>チャンク間で PC を確認"]
    end
    OV["overlay ボタン<br/>⏸ ⏭ 🔇"] --> PC
    PC --> AU
    subgraph Edge 先行変換
        PF["prefetch: 再生中に<br/>次チャンクの音声を事前取得"]
    end
    SC --> PF
    CK["chunkTextNatural（新設）<br/>見出し・文末区切り"] --> SC
```

## 4. コンポーネント

| コンポーネント | 責務 |
|------|------|
| `src/features/tts/playback-controller.ts`（新設） | 現在再生中 Audio のハンドル管理。`togglePause()` / `skipNext()` / `stop()`。`playObjectUrl` 登録時に pause/resume ハンドルも受け取る |
| `chunking.ts` 拡張 | `chunkTextNatural(text, limit)` 新設。見出し行で強制分割 → 文末（`。` `！` `？` 改行）優先で上限内パック → 上限超過は従来どおり途中分割。`core.ts` と `md-file-read-flow.ts` の**両方**で使用しチャンク完全一致を維持 |
| `core.ts` Edge 経路 | plachta パイプラインと同型の先行取得： チャンク i 再生中にチャンク i+1 を fetch し Blob URL 化して即再生 |
| `plachta-tts.ts` | `playObjectUrl` を拡張し pause/resume ハンドルを playback レジストリへ登録 |
| `md-read-highlight/setup.ts` | overlay ハンドラを `mdReadState` 直接更新から `PlaybackController` 経由へ変更 |
| `preview-renderer.ts` | ハイライト後スクロールを `scrollIntoView` から「viewport 上から `scrollPositionPct%`」の `scrollTo` 自前計算へ変更 |
| `SettingTabTts.ts` | ハイライト色プルダウン（プリセット 8 色）＋スライダー（scrollPositionPct）追加 |

## 5. 動作仕様

### 5.1 ボタン

| ボタン | 動作 |
|------|------|
| ⏸/▶ | 現チャンクを `audio.pause()` / `audio.play()`。アイコン ⏸⇔▶ 切替。state.phase は paused/playing |
| ⏭ | 現チャンク中断（`finish(false)` 相当）→ 次チャンクから再生。ハイライト即追従。最終チャンクでは終了処理 |
| 🔇 | 変更なし（全停止＋state クリア） |

### 5.2 チャンク分割（chunkTextNatural）

1. 見出し行（`^\s{0,3}#{1,6}\s`）で強制新チャンク
2. テキストを文末（`。` `！` `？` `？`改行）で文に切り、上限内で順にパック
3. 1 文が上限超過の場合は従来 `chunkText` の途中分割にフォールバック
4. `core.ts`（TTS 本体）と `md-file-read-flow.ts`（ハイライト登録）で同一関数を使用し index 完全一致を保証

### 5.3 先行変換（Edge）

- チャンク i の再生開始時にチャンク i+1 の fetch を開始（Blob URL 保持）
- チャンク i+1 再生時は保持 URL から即再生（fetch 待ちゼロ）
- fetch 失敗時は当該チャンク再生時に通常 fetch にフォールバック

### 5.4 スクロール位置

- `mdReadHighlight.scrollPositionPct`（number・既定 40・0〜100 外は 40 フォールバック）
- チャンク先頭要素の絶対 Y − スクロールコンテナ高さ × pct/100 を scrollTo（smooth）

### 5.5 色プルダウン

- プリセット: 黄 `#ffd54f` / 緑 `#a5d6a7` / 水 `#81d4fa` / 桃 `#f48fb1` / 橙 `#ffab91` / 紫 `#ce93d8` / グレー `#cfd8dc` / 既定 `#ffb300`
- 選択で `mdReadHighlight.highlightColor` へ反映。自由入力欄は残存（カスタム色用）
- i18n ja/zh/en 追加

## 6. テスト（TDD）

1. PlaybackController: 一時停止/再開/スキップ/最終チャンク終了（モック Audio）
2. chunkTextNatural: 見出し分割・文末パック・上限超過フォールバック・core と flow の同一結果
3. Edge prefetch: 先行取得の呼び出し順（モック fetch）
4. 色プルダウン: 選択 → 設定反映
5. スクロール: pct 計算・clamp フォールバック
