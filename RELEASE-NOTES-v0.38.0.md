# v0.38.0 — 選択ポップアップ位置設定 (F-032)

## ✨ Highlights

- `Add to Claudian` / `Add to TTS` ポップアップの**表示位置**を「右上」/「下」から選択可能に
- 既定は**右上**配置（既存ユーザーは「下」からの挙動変更・設定で戻せる）
- ビューポート端のクランプ/反転ロジックは両モード共通
- i18n: ja / en / zh フル対応

## 📦 v0.38.0（2026-09-07）— 選択ポップアップ位置設定（F-032）

### Added

- `selection.popupPosition: 'top-right' | 'bottom'` を新設（**既定 `'top-right'`**）
- 設定タブ「選択」→「🌐 ポップアップ位置」dropdown で切替可能
- `positionPopup` に第 3 引数 `mode` を追加（ビューポート端のクランプ / 反転ロジックは両モード共通）
- マイグレーション: 未設定・不正値は `'top-right'` を既定、`'bottom'` 明示のみ保持
- i18n 対応（ja / en / zh）

### Changed

- **既存ユーザーの可視挙動変更**: ポップアップ位置が「下」→「右上」に変わる（設定で `'bottom'` に戻せる）

## 🧪 テスト

- 追加 13 ケース（settings 5 / i18n 1 / popup 5 / watcher 2）
- **1082 PASS / 1 skipped / typecheck 0**
- コミット数: 6

## 📚 関連ドキュメント

- 設計書: `D:/AI-Agent/ClaudianBridge/docs/superpowers/specs/2026-09-06-selection-popup-position-design.md`
- Vault 設計書: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/17_選択ポップアップ位置設定設計|17_選択ポップアップ位置設定設計]]
- CHANGELOG: `CHANGELOG.md`
- 進捗ボード: [[80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/05_進捗ボード|05_進捗ボード]]（F-032 完了エントリ追加済）
- F-番号マスター: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/F-number_master|F-番号マスター]]（F-032 行追加済）