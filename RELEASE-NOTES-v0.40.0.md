# v0.40.0 — Think モード選択機能 Phase 2 (F-040)

## ✨ Highlights

- **Think モードを 5 プロバイダ全てで利用可能に**: Phase 1 (v0.39.0) では Claude のみだったが、Phase 2 で DeepSeek / Zhipu / MiniMax / Kimi の 4 プロバイダが追加され、各プロバイダの API 直接呼び出しクライアントを実装
- **DeepSeek / Zhipu**: `thinking.type=enabled|disabled` を body に送信
- **MiniMax**: `thinking.type=enabled|adaptive|disabled` を body に送信（medium エフォートは adaptive にマッピング）
- **Kimi (Moonshot)**: body の `thinking` フィールドは未サポートのため、**モデル切替方式**を採用（`moonshot-v1-128k` ↔ `kimi-thinking-preview`）
- `resolveApiKey` 関数で 4 プロバイダの API キーを統一解決、`resolveLlmClient` の dispatch を 5 プロバイダ対応に拡張

## 📦 v0.40.0（2026-09-10）— Think モード選択機能 Phase 2（F-040）

### Added

- **`createDeepSeekClient(apiKey, thinking)`**: DeepSeek API（`https://api.deepseek.com/v1/chat/completions`）への直接呼び出し。thinking ON で `thinking.type=enabled` + `reasoning_effort=low|high|max`、OFF で `disabled`。medium エフォートは `high` にフォールバック（DeepSeek API 仕様）
- **`createZhipuClient(apiKey, thinking)`**: Zhipu GLM-4.5（`https://api.z.ai/api/paas/v4/chat/completions`）への直接呼び出し。thinking ON/OFF を `thinking.type=enabled|disabled` で送信（`reasoning_effort` は Zhipu が未サポートのため送信しない）
- **`createMiniMaxClient(apiKey, thinking)`**: MiniMax（`https://api.minimaxi.com/v1/chat/completions`）への直接呼び出し。現行モデル **`MiniMax-M3`** を使用。thinking ON で `enabled`、OFF で `disabled`、`effort=medium` は `adaptive` にマッピング（MiniMax API 仕様）
- **`createKimiClient(apiKey, thinking)`**: Kimi/Moonshot（`https://api.moonshot.cn/v1/chat/completions`）への直接呼び出し。thinking ON で `kimi-thinking-preview` モデル、OFF で `moonshot-v1-128k` モデルを使用（**モデル切替方式**）
- **`resolveApiKey(provider, quotaSettings)`**: 4 プロバイダ（DeepSeek / Zhipu / MiniMax / Kimi）の API キーを `quotaSettings` から解決。空文字・未設定は `undefined` 返却。Claude / unknown は `undefined`（ANTHROPIC_* 環境変数を直接参照するため）
- **`resolveLlmClient` dispatch を 5 プロバイダ対応に拡張**: `switch` 文で 5 プロバイダを独立 case に分離、`unknown` は warn ログ + Claude フォールバック
- **abort 統合**: 4 つの非 Claude クライアント全てが `AbortController` + 外部 `opts.signal` チェーン + timeout クリーンアップを実装

### Changed

- **`dispatch.ts` の v0.39.0 スタブ削除**: Phase 1 で残っていた `deepseek`/`kimi`/`minimax`/`zhipu`/`unknown` → Claude フォールバックを撤廃し、4 プロバイダを独立 case に分離
- **`polishInstruction` 呼び出しに `apiKey` 引数を追加**（Task 13）: `input-ai-read-button.ts` / `md-file-read-flow.ts` から `resolveApiKey(llmInfo.provider, cfg.quota ?? {})` を経由して API キーを渡すよう変更
- **Kimi の thinking 実装方式**: 当初は `thinking.type=enabled|disabled` を body に送信していたが、**Moonshot は body の `thinking` フィールドを no-op として無視する**ため、モデル切替方式（`moonshot-v1-128k` ↔ `kimi-thinking-preview`）に変更（Task 11 H-2 レビュー指摘対応）
- **MiniMax モデル名更新**: 旧 `minimax-text-01` → 現行 `MiniMax-M3`（Task 11 H-1 レビュー指摘対応）

### ⚠️ 既知の制限

- **Kimi の `kimi-thinking-preview` は preview ティア**: レート制限が厳しい可能性あり。GA 昇格時にモデル名・テスト更新を推奨
- **Moonshot の `reasoning_effort` サポートは未確認**: 公式ドキュメントで明示されていないため送信しない（将来サポート確認時に `mapEffort` ヘルパー追加で対応）
- **非 Claude プロバイダの `apiKey` 実配線回帰テストは未実装**: dispatch.test.ts で 5 プロバイダの引数伝播は網羅済みだが、実 API キーでの E2E スモークテストは不在（実機 UAT で確認推奨）
- **abort テストは一部未充足**: 4 つの非 Claude クライアントで abort 経路のテストカバレッジが不足（次リリースで補強）

## 🧪 テスト

| 項目 | 件数 |
|------|----:|
| `createDeepSeekClient` テスト | +6 件 |
| `createZhipuClient` テスト | +5 件 |
| `createMiniMaxClient` テスト（adaptive マッピング含む） | +5 件 |
| `createKimiClient` テスト（モデル切替検証） | +4 件 |
| `resolveLlmClient` dispatch テスト | +6 件 |
| `resolveApiKey` テスト | +8 件（既存 16 件 + 新規 2 件） |
| **Phase 2 追加合計** | **+34 件** |
| **全体テスト** | **1250 PASS / 1 SKIP**（typecheck 0） |

### コミット一覧（Phase 2, F-040）

| コミット | 内容 |
|----------|------|
| `e14841b` | feat(quota): resolveApiKey 関数を追加 |
| `e8c96e8` | fix(quota): resolveApiKey を Partial<Pick<>> に変更 + テスト追加 |
| `bb99a40` | feat(llm): DeepSeek API 直接呼び出しクライアントを追加 |
| `45eeebe` | feat(llm): Zhipu / MiniMax / Kimi の API 直接呼び出しクライアントを追加 |
| `04df269` | fix(llm): MiniMax モデル名を MiniMax-M3 に更新 + Kimi を thinking モデル切替方式に変更 |
| `d41132a` | feat(llm): dispatch.ts に 4 プロバイダを追加 |
| `54533d2` | refactor(tts): polishInstruction 呼び出しに apiKey を追加 |

## 🔄 互換性

- **既存ユーザー**: v0.39.0 からの設定はそのまま動作（`normalizeClaudianBridgeSettings` が default 補完）
- **Phase 1 (v0.39.0) で実装された UI・ステータスバー 🧠 バッジは継続**: Phase 2 で追加された 4 プロバイダも同じ UI で個別 ON/OFF + エフォート選択可能
- **既存 `disableThinking` オプションは deprecated**（次メジャーで削除予定）

## 📚 関連ドキュメント

- 設計書: `D:/AI-Agent/ClaudianBridge/.superpowers/sdd/2026-09-08-think-mode-selection/think-mode-selection-design.md`
- 実装計画: `D:/AI-Agent/ClaudianBridge/.superpowers/sdd/2026-09-08-think-mode-selection/think-mode-selection-plan.md`
- Phase 1 (v0.39.0) リリースノート: `RELEASE-NOTES-v0.39.0.md`
- Vault 設計書: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-08-think-mode-selection-design|Think モード選択機能設計]]
- CHANGELOG: `CHANGELOG.md`
- F-番号マスター: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/F-number_master|F-番号マスター]]（F-040 行追加済）
