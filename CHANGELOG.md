# Changelog

## [0.37.1] - 2026-09-05 — LLM 原稿です・ます調統一 + 並列生成（F-033 拡張・レビュー修正込み）

### Added

- LLM 原稿を全プロファイルで「です・ます調」に統一（プロンプト追記）
- LLM 並列生成数（1〜8・既定 2）を設定画面で変更可能（`tts.llmRewriteConcurrency`）
- 生成中断の堅牢化：llm-session（世代ガード）・file-open/mute での abort・新規 Add-to-TTS での中断
- 空/見出しのみセクションの除外・DR [BEEP] マーカー除去・boss 口頭キュー化・キャッシュ内容ハッシュ・フォールバック原文 anchor・terms-dict ヘッダ/空語釈/複合語修正

### テスト

- 1058 件 PASS / typecheck 0（llm-session・並列・設定 clamp・回帰 e2e 追加）


## [0.37.0] - 2026-09-05 — MD 読み上げ LLM 原稿書き換え（F-033）

### Added

- プロファイル非 original のとき、MD を Claude CLI（claude -p）で聞き手向け口頭原稿に書き換えてから読み上げ
- 見出し単位でセクション分割し、各セクションを LLM で書き換え（プロファイル別プロンプト）
- 書き換え中は Notice「原稿生成中 n/m…」を表示
- 結果は `llm-rewrite-cache.json`（100 件 LRU）にキャッシュ（`tts.llmRewriteCache` 既定 ON）
- ハイライトは書き換え時「見出し単位の粗ハイライト」へ切替
- LLM 失敗時は従来のトークン変換（F-032）へフォールバック

### テスト

- llm-rewrite 5 件 / llm-rewrite-cache 5 件 / 統合 e2e 2 件 / 設定キー 3 件追加。1044 件 PASS / typecheck 0


## [0.36.0] - 2026-09-05 — MD 読み上げ聴き手プロファイル（F-032）

### Added

- 聴き手プロファイル（7 種）: Add to TTS の読み上げ内容を聞く相手に合わせて変換。設定「テキスト読み上げ」タブにプルダウン追加（既定 original＝原文のまま）
  - workplace（職場・技術）: 略語を 1 文字ずつカタカナ読みに展開（API → エー ピー アイ）
  - customer（顧客・仕様説明）: コードブロック省略＋丁寧語化（だ → です）
  - family（家族・やさしい）: コード除外＋数字を漢数字＋用語の口語置換
  - classroom（教室・学生）: 用語辞書の語直後に「とは 〇〇」解説を付記
  - boss（上司・報告）: 🎯 結論 見出しに「結論：」マーカー＋数字漢数字
  - dr（DR・査読）: 誤字疑いキーワード（原文ママ/TBD/FIXME 等）に [BEEP] マーカー＋Web Audio 警告音（880Hz・80ms）・修正提案を TODO: プレフィックス化
- 用語辞書（tts.termsDict）: Vault 内 MD パスを指定し「用語 → やさしい表現」対照表（テーブル or - 用語 → 表現）を読み込み

### テスト

- profile 15 件 / terms-dict 3 件 / audio-beep 2 件 / 設定キー 4 件 / E2E 2 件追加。1032 件 PASS / typecheck 0


## [0.32.10] - 2026-09-04 — 自己更新機能（F-029）

### Added

- **自己更新機能**: 設定一般タブのバージョン行右に「更新を確認」ボタンを追加。GitHub Releases の最新版を semver 比較で検知し、バックアップ（`.backup/<UTC-ISO>/`）→ 3 ファイル DL → disable/enable 自動リロード
- `Plugin/` ディレクトリ新設（main.js / manifest.json / styles.css の Git tracked 配布源・`gh release create` で手動アップロード）
- `scripts/deploy.mjs` を Plugin/ からのコピー方式に改修（デプロイ SSOT 化）

### テスト

- self-update 単体 + 統合テスト 19 件追加（update-checker 9 / backup-manager 3 / update-downloader 2 / reloader 2 / flow 3）

### 既知の問題

- `tests/features/tts/core.test.ts` の plachta 伝播テスト 1 件が本機能以前から失敗（`ee25827` で混入・無関係）

## [0.32.9] - 2026-09-03 — TTS/ハイライト チャンク index 一致化 + 不一致 Notice

### Fixed

- **チャンク分割不一致（下線原因⑤）**: register chunks を `buildChunks`（行パッキング）から TTS 本体と同一の `filterSpeechText + chunkText` 分割に変更。500 字超の文書で index がズレて下線が停止する問題を解消
- anchor はチャンク先頭 24 正規化文字（誤マッチ耐性）
- **不一致時 Notice**: anchor 不一致・空コンテナ時に 1 セッション 1 回 Notice で原因カテゴリを通知（DevTools 不要）

### テスト

- E2E 追加: 登録 chunks = TTS 同一分割（長文 1087 字 → 3 チャンク一致）
- **945 件 PASS** / typecheck 0

## [0.32.8] - 2026-09-03 — setViewState 後の view 再生成対応（下線原因④）

- `leaf.setViewState()` 後は Obsidian が `leaf.view` を再生成するため、切替前の古い `containerEl` をポーリングしても render を検出できなかった → ポーリング毎に leaf/view/containerEl を再取得
- テスト: view 差し替えシミュレーション +1 / **944 件 PASS**

## [0.32.7] - 2026-09-03 — 読書モード切替を正式 API 化（下線原因③）

- `view.setState({state:'preview'})` は正式な状態キーと異なり実機で無視されていた（Live Preview 残留 → previewMode 空 → 下線なし）
- `leaf.setViewState({type:'markdown', state:{file, mode:'preview'}})`（正式 API）に置換
- 空コンテナ時の診断ログ追加 / **943 件 PASS**

## [0.32.6] - 2026-09-03 — 下線チェーン E2E テスト + 診断ログ

- E2E 統合テスト新設: addMdToTts → register → onChunkStart → mdReadState → setup subscriber → preview-renderer で「is-active 下線 span が正しい段落に生成・移動」を自動証明 + styles.css の amber 下線定義を検証
- 診断ログ `[cb-md-read-highlight] chunk N of M underline applied / NOT matched` 追加
- **943 件 PASS**

## [0.32.5] - 2026-09-03 — quota workspace.trigger this 束縛修正

- `emit()` が `workspace.trigger` を非バインド呼び出ししており、Obsidian 内部 `this._` 参照で `TypeError` が Console に出続ける問題を修正（メソッド呼び出し形式で this 束縛）
- this 束縛検証テスト +1 / **941 件 PASS**

## [0.32.4] - 2026-09-03 — 下線が出ない根本原因①②を修正

- **anchor 不一致（原因①）**: anchor は記号フィルタ後テキスト、Preview DOM は元テキスト → `indexOf` 恒久不一致 → **正規化マッチング**（`match.ts` 新設・空白/記号完全除去・複数ノード跨ぎ span 対応）
- **render 待ち不足（原因②）**: 固定 200ms → 最大 2.5 秒のコンテンツ出現ポーリング
- `match.test.ts` +7 件 / **941 件 PASS**

## [0.32.3] - 2026-09-03 — 読み上げ位置を下線表示に変更

- `.cb-md-read-chunk.is-active` を背景色 → **amber `#ffb300` 下線（3px・offset 5px）** に変更（is-paused は破線）
- F-028 安定部分（v0.33.10 = CM6 拡張無効化済み）を v0.32.2 ベースにマージ
- **933 件 PASS**

---

## [0.33.2] - 2026-09-02 — MD 読み上げハイライト DOM 配線バグ修正（F-028）

### Fixed

- **MD 読み上げ時のマーカー・オーバーレイが表示されない重大バグ修正**:
  v0.33.0/v0.33.1 で `mdReadState.setActiveIdx(idx)` が呼ばれても、Preview DOM に `<span>` を注入する配線と Floating Overlay を mount する配線が `setup.ts` に欠落していた。state 単体テストは通っていたが**統合層が未配線** だった。
  - `setupMdReadHighlight` の `mdReadState.subscribe` を拡張し、以下を配線：
    - `register(filePath, chunks)` → 該当 MD view の Preview に `mountOverlay`
    - `setActiveIdx(idx)` 変化 → `highlightChunkInPreview(view, chunk)` + overlay の `N/M` 進捗更新
    - `phase='completed'/'cleared'` → overlay unmount + state cleanup
    - ⏸/▶/⏭/🔇 ハンドラ実装（🔇は `stopAllPlayback`、⏭は `nextHeadingIndex` A 案）
- **SettingTab UI の version バンプ反映漏れ修正**:
  v0.33.1 でソースに追加した SettingTab UI（「MD 読み上げハイライト」セクション・色 hex 入力・CSS 変数バインド）が `manifest.json` / `package.json` の version 同期とれず未デプロイだった。v0.33.2 で `--cb-md-read-highlight` CSS 変数経由で色反映を有効化。

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **910 件 PASS**（v0.33.0 の 901 件 + 新規 9 件：setup.test.ts に DOM 配線テスト 2 件追加 + captureApp mock 拡張） |
| 影響範囲 | `src/features/tts/md-read-highlight/setup.ts`（主な修正）/ `tests/features/tts/md-read-highlight/setup.test.ts` |
| F-番号 | F-028（変更なし）|
| バージョン | `0.33.0/0.33.1` → `0.33.2` |

---

## [0.33.0] - 2026-09-02 — MD 読み上げ位置ハイライト（F-028）

### Added

- **MD 読み上げ位置ハイライト**: MD ファイル右クリック「Add to TTS」で本文を読み上げる際、**Obsidian Preview 表示中のチャンク位置に背景色ハイライト**を表示
- **フローティングオーバーレイ**: Preview 右上に再生コントロール（⏸ 一時停止 / ▶ 再開 / ⏭ 次の見出しスキップ / 🔇 ミュート / N-M 進捗）を表示
- **見出しスキップ**: ⏭ クリックで「最後の見出し境界」へジャンプ（A 案・テスト優先で確定）
- **設定スキーマ**: `tts.mdReadHighlight: { enabled: boolean, highlightColor: string }` を追加（既定 ON）

### Changed

- `speakChunks(chunks, speakFn, onCancel?, onChunkStart?)` に onChunkStart hook を追加（既存呼び出しは後方互換）
- `speakText(...).SpeakTextOpts.onChunkStart` と `addTextToTTS` の第 4 引数で連動（既存経路を壊さずチャンク単位コールバックを追加）
- `workspace.on('layout-change')` でレイアウト変化時（タブクローズ等）に state とハイライトをクリア（`file-close` は Obsidian 型定義に無いため代替）

### Fixed

- なし（purely additive）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **901 件 PASS**（v0.32.0 の 887 件 + 新規 14 件） |
| 影響範囲 | `src/features/tts/md-read-highlight/`（types / state / anchor / preview-renderer / floating-overlay / heading-skip / runtime / cleanup / setup / index）/ `src/features/tts/{chunking,speak,core,md-file-read}.ts` / `src/main.ts` / `styles.css` |
| F-番号 | **F-028**（F-027 の次）|
| 関連文書 | [[../../Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-02-md-read-position-highlight-design\|設計書]] / [[../../Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/2026-09-02-md-read-position-highlight-plan\|実装計画]] |

## [0.32.0] - 2026-09-02 — トークン速度表示の更新周期設定

### Added
- 設定 → ClaudianBridge → 一般タブに「更新周期」ドロップダウンを追加（0.1 / 0.25 / 0.5 / 1 / 2 秒から選択）
- 既定値は 250 ms（v0.31.0 の 500 ms から変更・既存設定は normalize で 250 に補完）

### Fixed
- 設定変更は即時反映（counter の破棄・再注入で intervalId が新周期で再生成）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **859 件 PASS**（v0.31.0 の 847 件 + 新規 12 件） |
| 影響範囲 | `src/features/token-rate/` / `src/core/settings.ts` / `src/core/i18n.ts` / `src/settings/SettingTabGeneral.ts` / `tests/features/token-rate/` |

## [0.31.0] - 2026-09-01 — トークン速度表示の表示項目選択 + 最大 tok/s 偽スパイク修正

### Added

- **トークン速度表示の表示項目選択**: 設定 → 一般タブに 4 トグル（首 / 現在 / 平均 / 最大）を追加
  - `general.tokenRateShowTtft` / `tokenRateShowCurrent` / `tokenRateShowAvg` / `tokenRateShowMax`（既定: 全 ON）
  - 親トグル（`general.tokenRateEnabled`）OFF で表示項目選択ごと無効化
  - counter は表示セグメントのみを描画し `data-visible` 属性に選択状態を反映、設定変更時は rescan で再注入

### Fixed

- **最大 tok/s の偽スパイク修正**:
  - DOM フォールバック（body 全文字数）を廃止し、アシスタント要素消失時はレート計算をスキップ
  - 縮小窓（文字数減少）と要素交代は baseline-only で処理し、縮小窓の直後の復帰窓も 1 窓隔離（quarantine）して再記録を防止
  - 要素消失時にアンカーを解除し、同一要素の再 attach 時も初回確立（baseline-only）扱いに変更
  - 再注入時の初回 tick を baseline-only にし、全文字数の一括計上スパイクを遮断

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **847 件 PASS**（v0.30.2 の 830 件 + 新規 17 件） |
| 影響範囲 | `src/features/token-rate/` / `src/core/settings.ts` / `src/core/i18n.ts` / `src/settings/SettingTabGeneral.ts` / `tests/features/token-rate/` |

## [0.30.2] - 2026-08-31 — 完了報告（次のアクション）の推奨検出強化（F023）

### Added

- **完了報告の 👑 推奨マーカー検出**: `extractRecommendedOption` が「👑N」形式（次のアクション提案表の推奨行）を認識
- **完了報告の選択肢数検出**: `extractMaxOptionCount` が「数字（1/2/3）」プロンプト + 「👑N」マーカーから選択肢数を抽出
  - 完了報告（テンプレート準拠）でクイック返信の番号ボタン ①-③ が表示され、👑 行がハイライトされる

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **830 件 PASS**（v0.30.1 の 825 件 + 新規 5 件） |
| 影響範囲 | `src/features/quick-reply/recommend-detector.ts` / `tests/features/quick-reply/recommend-detector.test.ts` |

## [0.30.1] - 2026-08-31 — トークン速度表示の実機調整（F027）

### Fixed

- **表示位置の修正**: 入力画面下部 → **YOLO トグルの左**（AddExternalContext の右）
  - コンテナセレクタを `.claudian-input-container`（実在確認）に修正
  - `.claudian-permission-toggle` の直前に挿入、右寄せ（`margin-left: auto`）
- **TTFT（首タイム）の実測化**: ユーザーメッセージ送信 → 最初のアシスタントトークンまでを計測（従来は要素出現起点で常に 0）
  - セレクタを `:last-of-type` → `querySelectorAll().at(-1)` に変更（兄弟依存の不安定さを解消）
- **自己フィードバック修正**: counter 自身の DOM 更新を MutationObserver が拾い `isStreaming` が常時 true になるバグを修正
- **CSS ロード修正**: `counter.css` が独立ファイルで未ロード → ルート `styles.css` に追記（スタイル未適用バグ解消）

### Changed

- **表示を 3 値 → 4 値に拡張**: `首 0.0s · 現在 X tok/s · 平均 X tok/s · 最大 X tok/s`
- **更新周期を 250ms → 500ms に変更**

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **825 件 PASS**（v0.30.0 の 822 件 + 新規 3 件） |
| 影響範囲 | `src/features/token-rate/` / `styles.css` / `tests/features/token-rate/` |

## [0.30.0] - 2026-08-30 — トークン速度（tok/s）表示 (F027)

### Added

- **トークン速度のライブ表示**: LLM 応答のトークン生成速度（tok/s）を Claudian 入力画面下部にライブ表示
  - `.claudian-input-container` 内のレスポンスエリア（`.claudian-messages`）直後に挿入
  - MutationObserver で応答 DOM のテキスト長を追跡、250ms ごとに `chars / 3 / 0.25s` で tok/s 算出
  - ストリーミング中は `12.3 tok/s ●` のライブ更新、終了後 3 秒でフェードアウト
  - 設定 `general.tokenRateEnabled`（既定 OFF）で明示オプトイン
  - トークン推定: 文字数 / 3（混合 CJK/English のヒューリスティック）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **822 件 PASS**（v0.29.1 の 812 件 + 新規 10 件） |
| 影響範囲 | `src/features/token-rate/`（新規 3 ファイル）/ `src/core/settings.ts` / `src/core/i18n.ts` / `src/settings/SettingTabGeneral.ts` / `src/main.ts` |

## [0.29.1] - 2026-08-30 — クイック返信ボタンを SVG アイコン化（NewTab と同スタイル）

### Changed

- **クイック返信ボタンを SVG アイコンに置換**: 絵文字 textContent（✅❌1️⃣〜5️⃣）を NewTab（`.clickable-icon`）と同型の SVG アイコンに変更
  - OK = Lucide `check` / NG = Lucide `x`（`obsidian.setIcon` API 使用）
  - 方案1〜5 = カスタム SVG（`<circle>` + `<text>` 数字バッジ）
- **スタイル調整**: ボタンサイズ 20x20、アイコン 12x12、灰色枠（`--background-modifier-border`）、透明背景、ホバーで `--background-modifier-hover`
- **間隔調整**: ボタン間ギャップ 2px → 1px、NewTab との間隔 6px（`margin-right`）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **812 件 PASS**（v0.29.0 の 811 件 + 新規 1 件「SVG 存在 + 直接テキストノード無し」）|
| 影響範囲 | `src/features/quick-reply/nav-buttons.ts`（SVG 生成）/ `src/styles.css`（`.cb-quickreply-btn` 全面書き換え）/ `tests/features/quick-reply/nav-buttons.test.ts`（13 件）|

## [0.29.0] - 2026-08-30 — クイック返信ボタンの配置を NewTab 左隣へ移動

### Changed

- **クイック返信ボタンの配置変更**: `.claudian-input-toolbar` の先頭全幅行から `.claudian-input-nav-actions` 内 **NewTab ボタンの左隣**へ完全移動（v0.23.0 以来の初期配置を撤廃）
  - NewTab / nav-actions 不在時は非注入（残量インジケータと同じ防御パターン）
  - 設定トグルなし（完全移行・破壊的変更だが機能損失なし）
  - `toolbar-buttons.ts` → `nav-buttons.ts` へリネーム + セレクタ変更

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **811 件 PASS**（v0.28.0 の 807 件 + 新規 4 件） |
| 影響範囲 | `src/features/quick-reply/nav-buttons.ts`（リネーム）/ `src/styles.css`（`.cb-quickreply-row` インライン化） / `src/main.ts`（import パス） |

## [0.28.0] - 2026-08-30 — 完了報告の読上げ用スクリプト整形（F026）

### Added

- **完了報告を読上げ用スクリプトに整形**: ✅ 完了報告の自動読上げ時に「タスク完了です。」→ 📢 ヘッダー → 「結論。」→「次のアクション提案です。」のサマリーのみを読み上げる（`tts.autoReadReportScript`・既定 ON）
  - 成果物・検証結果・参照文献・テーブル・思考・コード・ツール呼び出しは読み上げない
  - 完了報告でない通常回答・整形失敗時は従来どおりの全文読上げへフォールバック
  - 新規設定: テキスト読み上げタブ「完了報告を読み上げ用スクリプトに整形」（i18n 3 言語）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **807 件 PASS**（v0.27.3 の 790 件 + F026 実装分 17 件） |
| 影響範囲 | `src/features/tts/report-script.ts`（新規）/ `extractReportText` / 設定・i18n・自動読上げ配線 |

## [0.27.3] - 2026-08-30 — 言語 auto 判定の日本語誤判定修正 🇯🇵

### Fixed

- **かなを含む日本語の zh 誤判定修正** (`src/features/tts/lang.ts`)
  - 旧ロジックは「かな文字数 > 漢字文字数」を日本語条件にしていたため、漢字多めの通常の日本語文（例：「政府は経済対策として新たな予算案を承認した。」）が `zh`（中国語音声）に誤判定されていた
  - 中国語はひらがな/カタカナを使用しないため、**かなが 1 文字でも存在すれば `ja`** を最優先判定に変更（zh 誤判定ゼロの決定的シグナル）
  - かなゼロの漢字のみテキストは従来どおり `zh` / `en` 判定を維持（後方互換）

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **790 件 PASS**（v0.27.2 の 788 件 + 新規 2 件） |
| 新規テスト | かなを含む漢字多めの日本語は ja・カタカナのみでも ja |
| 影響範囲 | `pickWebSpeechLang` の判定条件のみ |

## [0.27.2] - 2026-08-30 — TTS チャンク分割時の言語切替不具合修正 🌐

### Fixed

- **チャンク分割時の言語統一**: 長文読上げ時にチャンクごとに言語 auto 判定を実行していたため、区切り方次第で英語のみ・漢字のみのチャンクが発生し、読上げ途中で音声（言語）が切り替わる不具合を修正
  - `addTextToTTS` で分割**前**の全文に対して 1 回だけ `pickLang` を実行し、全チャンクに同一の言語・音声を適用
  - `edgeCloudHttpSpeak` / `localEdgeTtsSpeak` / `webSpeechSpeak` に optional `lang` 引数を追加（未指定時は従来どおりチャンク単位の auto 判定・後方互換）
  - `lang.ts` に `TtsLang` 型をエクスポート

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **788 件 PASS**（v0.27.1 の 787 件 + 新規 1 件） |
| 新規テスト | `tests/features/tts/core-lang-consistency.test.ts`（全文 ja 判定の長文＋英語区間で全チャンクの音声が ja 統一されることを検証） |
| 影響範囲 | `src/features/tts/core.ts` / `edge-tts-local.ts` / `lang.ts`（既存 API は optional 引数追加のみで後方互換） |

## [0.27.1] - 2026-08-27 — Thought 読上げ除外の防御的強化 🛡️

### Fixed

- **Thought 除外セレクタの防御的拡張**: `THINKING_BLOCK_SELECTOR` を `.claudian-thinking-block` 単体から **複数クラスのOR** に拡張
  - 追加: `.claudian-thinking-content` / `.claudian-thinking-header` / `.claudian-thinking-label` / `.claudian-thinking`
  - realclaudian v2.2.4+ の DOM 構造（thinking 内容が `claudian-thinking-block` の子クラス `claudian-thinking-content` 等に置かれる）に対応
  - 既存ユーザー（`thinking: false` 既定・手動 OFF）への破壊的変更なし

### テスト

| 項目 | 値 |
|------|------|
| TypeScript テスト | **787 件 PASS**（v0.27.0 の 786 件 + 新規 1 件） |
| 新規テスト | `v0.27.1: thinking=false の除外セレクタは防御的に thinking-content/-header/-label/-thinking も含める` |
| 影響範囲 | `src/features/tts/extract-report.ts` の `THINKING_BLOCK_SELECTOR` 定数のみ |

## [0.27.0] - 2026-08-20 — TTS エンジン変更（ローカル EdgeTTS 同梱＋クラウドサーバ対応＋言語モード切替）

### Added

- **edge_tts 完全同梱**: `git subtree` で `py/edge_tts/` に edge-tts v7.2.8（**LGPLv3 + MIT mixed**・詳細は `THIRD_PARTY_NOTICES.md`）をバンドル。`pip install edge-tts` 不要
- **言語モード切替**: `Add to TTS` 系と `AI 自動読上げ` 系（自動読み上げ / AI 読上げボタン）で独立した `auto / ja / zh / en` を選択可能（`addToTtsLanguageMode` / `autoReadLanguageMode`）
- **クラウド EdgeTTS（HTTPS POST プロキシ）**: `edgeCloud = { serverUrl, authToken, timeout }` で任意の外部サーバを指定可能。旧 `claudettsHttpSpeak`（POC_015 依存）は完全削除
- **クロスプラットフォーム対応**: Ubuntu / Linux で `python3` 自動検出（`resolvePythonCmd`）+ `SIGTERM → SIGKILL` プロセス停止（`killProcessTree`）
- **UI 改善**: EdgeTTS モジュール場所に 📂 ボタン（OS のファイルマネージャで開く・electron `shell.openPath`）
- i18n ラベル 15 キー × 3 言語（ja / zh / en）

### Changed

- **デフォルトエンジン変更**: 新規ユーザー = `edge-local` ／ 既存ユーザー = `edge` → `edge-local` 自動マイグレーション
- 同梱に伴い edge_tts モジュールパス解決を src-layout（`py/edge_tts/src`）に更新

### ⚠️ 既知の制限

- `edge` → `edge-local` マイグレーションの**永続化（data.json 書き戻し）は未実装**。マイグレーションはロード時に正規化されるため動作上問題ないが、設定ファイル上の表記は更新されない（将来タスクで対応）
- Web Speech エンジン（`webspeech`）は言語モード固定に未対応（従来どおり自動判定のみ）

### 参照

- 設計書: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode.md`
- 実装計画: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/18_TTSエンジン変更実装計画.md`
- テスト件数: 778 → **782** (+4)

## [0.26.0] - 2026-08-18
### Added
- クイック返信ボタンの検出パターン拡張（`features/quick-reply/recommend-detector.ts`）
  - 「案」（方案なし）表記に対応（`案1` / `案1〜4` / `案N が推奨`）
  - 追加された推奨語彙:
    - ja: `最優先 N` / `第一選択 N` / `優先案 N` / `優先度 N`
    - zh: `首选 N` / `优选 N`
    - en: `best option N` / `prefer option N`
  - 逆順パターン: `案N が推奨` / `案N をおすすめ` も検出
- 方案数カウント (`extractMaxOptionCount`) も「方案|案」の OR で `案1〜4` をカバー
- テスト件数: 744 → 756 (+12)

## [0.19.0] - 2026-08-16
### Fixed
- タスク終了時自動読み上げが複数ターンタスクの**途中ターン（思考・ツール実行）で発火**し、思考ブロックを読んだり最終回答をスキップしたりする問題を修正
  - 最終回答ゲート `detectFinalAnswerState()` を導入: 最後の assistant メッセージが **非空の `.claudian-text-block` 終端**のときのみ読み上げ（途中ターンは即スキップ・dedup マークを付けない）
  - `full` スコープは `.claudian-text-block` のみを構造的に読み連結（思考・ツールを確実に除外）
  - `header` フォールバックは思考・ツールブロックを構造的に非表示（二重防護）

## [0.15.0] - 2026-08-15
### Added
- **コールアウト除外設定**（`tts.excludeCallouts`、既定 ON）: 読み上げから `> [!type]` 形式のコールアウトを除外
  - 設定画面（TTS タブ）で ON/OFF 切替可能
  - 自動読み上げ（full/header）・メッセージ読上げボタンの全経路に適用
- `buildSpeechExclude()` を追加し、除外セレクタを設定に応じて組み立て

## [0.14.4] - 2026-08-15
### Fixed
- 読み上げに**コードブロック**（言語ラベル `bash` 等・コード本文）が混入する問題を修正
  - `EXCLUDED_FROM_SPEECH` に `.claudian-code-wrapper` を追加（full / header / 読上げボタンの全経路で適用）

## [0.14.3] - 2026-08-15
### Changed
- ヘッダースコープの「結果全体まとめ」マーカーを **✅ も対象**に追加（従来は 📢 のみ）
  - ✅ で始まる blockquote も 📢 と同様にまとめとして読み上げ
  - 判定: `isSummaryMarker()`（📢 / ✅ で始まる）

## [0.14.2] - 2026-08-15
### Changed
- ヘッダースコープ: **一項目のみ**の応答（見出しが1つ・導入文なし）も読み上げ対象に追加
  - 例: `## ビルド・コミット状況` + 本文 → 見出しと本文を読む（**データ表 table は除外**）
- 読み上げ優先順: 📢 報告 → 導入文（最初の見出しまで）→ 一項目のみの節

## [0.14.1] - 2026-08-15
### Changed
- ヘッダースコープの読み上げ対象を見直し（結果全体まとめのみ）:
  - 📢 blockquote → その報告を読む（従来通り）
  - 📢 が無い場合は **最初の見出し（h1-h6）までの導入文**を「まとめ」として読む
  - 📢 も見出しも無い場合は読まない（レンダリング中のプレースホルダ誤読を防止）
- Thinking ブロック・詳細・次のアクションはヘッダーでは読まない（全文のみ）

## [0.14.0] - 2026-08-15
### Added
- メッセージ読上げボタン: ClaudianChat 結果欄の各テキストブロックの**コピーボタン左隣**に読上げボタンを追加
  - クリックで該当ブロックの可視テキストを `addTextToTTS` 経由で読み上げ（speech_filter・ミュート連動は既存踏襲）
  - 範囲はコピーボタンと同じ（当該テキストブロック）

## [0.13.1] - 2026-08-15
### Fixed
- `full` 読み上げ時に realclaudian の**思考ブロック（`Thought for Xs` / `.claudian-thinking-block`）を発話から除外**
  - `extractReportText()` に除外対象サブツリーを非表示/除去してテキストを組み立てる `readVisibleTextExcluding()` を追加
  - 思考ラベル「Thought for 1s」や思考本文を読み上げないように（実ブラウザ = innerText + display:none / jsdom = clone 除去）

## [0.13.0] - 2026-08-15
### Added
- 自動読み上げの全応答対応: `autoRead.scope=full` で **📢 有無に関わらず**最後の応答を全文読み上げ
  - `extractReportText()` を scope=full 時は 📢 非依存に変更
  - ミュートボタン（点滅・停止）が全読み上げを反映
### Removed
- Claude Code CLI Stop hook 由来の読み上げを廃止（`~/.claude/settings.json` の `hooks.Stop` を無効化）
  - 読み上げ経路を Claudian Bridge プラグインに一元化し、二重読み上げ・ミュート非連動を解消

## [0.12.6] - 2026-08-15
### Fixed
- 読み上げ中にミュートボタンで音声が停止しない問題をさらに強化
  - クリック時に**常に停止を試行**（再生検知の成否に関わらず `stopAllPlayback()` を実行）
  - edge 子プロセス PID を直接追跡し、レジストリ追跡が外れても `taskkill /T` で確実に停止
### Changed
- 再生検知・ステータス表示の診断ログ（`cb-tts`）を追加（デバッグ用）

## [0.12.5] - 2026-08-15
### Changed
- ツールバーボタンの横幅をアイコンサイズに最適化（`min-width: 5em` → `2em` + 小さな padding）

## [0.12.4] - 2026-08-15
### Changed
- ツールバーボタンを**アイコンのみ表示**に変更（🔊/⏹/🔇/📖/📄）し、サイズを最小化
  - 「ミュート」「全文」等の文字ラベルは tooltip（ホバー表示）に移動

## [0.12.3] - 2026-08-15
### Fixed
- 読み上げ中にミュートボタンが点滅しない問題（edge エンジンで音声再生が別プロセス実行のため再生レジストリが「再生中」を検知できなかった）
  - claude-tts スキルの `CrossPlatformPlayer` を音声終了まで待機する `subprocess.run` に変更
- 読み上げ中にミュートボタンで音声が停止しない問題
  - edge 停止ハンドラをプロセスツリーごと kill（`taskkill /T`）に変更し、PowerShell プレイヤーも停止
### Changed
- ツールバーボタンのラベルを最小化: ミュートボタンは全状態で「ミュート」（🔊/⏹/🔇）、サイズ削減

## [0.12.2] - 2026-08-15
### Added
- 読み上げ文最適化（speech_filter）を全読み上げ経路に適用: emoji / 顔文字 / ASCII 表情 / emoji 短コード を除去して読み上げ品質を改善
  - チャット自動読み上げ・手動「Add to TTS」は `tts.cli.speech_filter` を参照
  - CLI stop_hook（claude-tts スキル）にも POC_015 由来の speech_filter 実装を復元
### Fixed
- speech_filter 設定が定義・UI 表示・CLI 同期されているだけで、実際の読み上げに適用されていなかった問題
- claude-tts スキルの extractor に speech_filter が移行時に欠落していた問題を復元

## [0.12.1] - 2026-08-15
### Fixed
- タスク終了時自動読み上げ: 📢 報告の無い通常応答でも「⚠️ 📢 検出不可」通知が毎回表示される問題（通知を削除し静かにスキップ）
- 複数タブ表示時に `.claudian-messages` の取得が最初のタブに固定され、ストリーミング完了タブの 📢 報告を抽出できない問題（アクティブタブ優先に修正）
- stream-end 直後の markdown レンダリング未完了時に備えた抽出リトライ（400ms × 最大5回）を導入
### Changed
- auto-read 診断ログを `console.debug` に格下げ（成功時 🔊 通知は維持）

## [0.12.0] - 2026-08-15
### Added
- ClaudianChat 入力ツールバーにミュートボタン（3状態: 🔊 / 🔊点滅=再生中・クリックで停止 / 🔇）を追加
- `playback-registry` を新設し edge(child.kill) / webspeech(synth.cancel) / plachta(audio.pause) に再生停止ハンドルを統合
- ツールバー「📖 全文読み上げ」ボタンと「タスク終了時自動読み上げ範囲」を統一同期（`autoRead.scope` ⟺ `cli.full_text`）
- ボタン表示をアイコン＋テキスト化（ja/en/zh i18n）し、再生中は点滅アニメーション
### Changed
- `toolbar-fulltext-button.ts` を `toolbar-buttons.ts` に統合（旧モジュール削除）
- 状態同期を旧 3 秒ポーリングから `store.onSave` + `onPlaybackChange` のイベント駆動に変更
- v0.11.1 の `cli.full_text=true` データを `autoRead.scope=full` に引き継ぐ整合化（旧設定尊重）
### Fixed
- edge エンジンで意図的停止後に error イベントが到達するとエラー Notice を表示する問題

## [0.10.0] - 2026-08-14
### Added
- ClaudeTTS（voice-config.json）設定融合: Claudian Bridge を SSOT として CLI 設定と双方向同期
- エンジン別チャンキング: Plachta（900字）/ WebSpeech（200字）で長文を自動分割
### Fixed
- WebSpeech API が onend を待たず 100ms で成功判定していた問題
