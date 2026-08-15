# Changelog

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
