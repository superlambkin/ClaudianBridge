# Changelog

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
