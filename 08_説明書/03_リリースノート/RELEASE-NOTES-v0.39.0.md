---
tags:
  - manual
  - poc
  - poc-017
---
# v0.39.0 — Think モード選択機能 (F-039)

## ✨ Highlights

- Claude / DeepSeek / Zhipu / MiniMax / Kimi ごとに Think モード（ON/OFF + エフォート low/medium/high）を設定タブで個別選択可能
- `LlmClient` インターフェース抽象化により将来の chat 系 API 呼び出しも同インターフェースで実装可能
- quota ステータスバーに 🧠 ON/OFF バッジを追加

## 📦 v0.39.0（2026-09-08）— Think モード選択機能（F-039）

### Added

- **Think モード設定 UI**: 設定 → ClaudianBridge → 一般 → Think モード で 5 プロバイダ（Claude / DeepSeek / Zhipu / MiniMax / Kimi）ごとに Think モード（ON/OFF + エフォート low/medium/high）を個別選択可能
- **`LlmClient` インターフェース抽象化**: 将来の chat 系 API 呼び出しも同インターフェースで実装可能（`createClaudeClient(thinking)` factory 経由）
- **`ThinkingConfig` 型**: `{ enabled: boolean, effort: 'low' | 'medium' | 'high' }` で構造化された設定
- **`settings.thinking` フィールド**: 設定画面に永続化、`normalizeClaudianBridgeSettings` が default 補完
- **quota ステータスバー 🧠 バッジ**: Think モードの ON/OFF を視覚的に表示
- **i18n 対応**: ja / en / zh の 3 言語フル対応

### Changed

- **`claude-cli.ts` に `createClaudeClient(thinking)` factory を追加**: 既存 `disableThinking` は deprecated（次メジャーで削除予定）
- **`polishInstruction` 呼び出しを `resolveLlmClient` 経由に変更**: Think モード設定が整形経路に確実に反映
- **`thinking.effort` runtime 値検証を追加**: 不正値は default（medium）にフォールバック

## 🧪 テスト

- `normalizeThinkingField` の typecheck エラー修正 + ThinkingEffort import + 型注釈
- LlmClient インターフェース・ThinkingConfig 型・createClaudeClient factory の各テスト
- `resolveLlmClient` 経由の `polishInstruction` テスト
- 一般タブ Think モードセクション UI テスト
- i18n ロケール文字列テスト
- quota ステータスバー 🧠 バッジテスト
- **vitest PASS / typecheck 0**
- コミット数: 10（cb3b42b, 9124af3, b496fb8, adf390e, 3ce24c7, d5cb086, 8ed78ec, e0d55ce, 266065a, 508e810）

## ⚠️ 既知の制限

- 初回リリース（v0.39.0）は Claude のみ動作。他プロバイダ（DeepSeek / Zhipu / MiniMax / Kimi）は v0.40.0 で実装予定
- MiniMax / Zhipu / Kimi の `reasoning_effort` パラメータサポートは v0.40.0 実装時に検証
- 既存 `disableThinking` オプションは deprecated（次メジャーで削除予定）

## 🔄 互換性

- 既存ユーザーの設定はそのまま動作（`normalizeClaudianBridgeSettings` が default 補完）
- Claude は Think ON、他プロバイダは OFF が default

## 📚 関連ドキュメント

- 設計書: `D:/AI-Agent/ClaudianBridge/.superpowers/sdd/2026-09-08-think-mode-selection/think-mode-selection-design.md`
- Vault 設計書: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-08-think-mode-selection-design|Think モード選択機能設計]]
- CHANGELOG: `CHANGELOG.md`
- F-番号マスター: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/F-number_master|F-番号マスター]]（F-039 行追加済）
- 実装計画: `D:/AI-Agent/ClaudianBridge/.superpowers/sdd/2026-09-08-think-mode-selection/think-mode-selection-plan.md`
