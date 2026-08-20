# Changelog

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
