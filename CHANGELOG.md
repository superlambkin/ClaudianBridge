# Changelog

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
