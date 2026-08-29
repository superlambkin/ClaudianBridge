---
title: "Claudian Bridge 要件総覧"
type: requirements-overview
version: 2.1.0
status: ✅ 已批准
created: 2026-08-10
modified: 2026-08-29
project_id: POC_017_ClaudianBridge
phase: 1
tags:
  - 要件総覧
  - 要件定義
  - Claudian Bridge
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 路径：`80_POC_Projects/POC_017_ClaudianBridge/01_要件定義/00_要件総覧.md`
> 📍 源码：`D:\AI-Agent\ClaudianBridge\src\`（manifest v0.27.1）

# 📋 Claudian Bridge 要件総覧（As-Built v0.27.1）

> ⚠️ **v2.1.0 改版说明**：v0.27.1 までの実装を反映した As-Built 要件として全面書き換え（2026-08-29）。F013〜F025 を新規追加。

## 🎯 プロジェクト目標

5 つの旧プラグイン（Claudian Selection Bridge / 拡張子WhiteList / Vault Office Bridge / Chroma Inspector / claude-tts-settings）を **Claudian Bridge** に統合する POC。v0.27.1 までに 25 機能が実装済み（達成）。

## 📏 プロジェクト範囲（As-Built v0.27.1）

### ✅ In Scope（実装済み機能）

| F# | 機能 | 導入 Ver |
|------|------|:--------:|
| F001 | テキスト選択 → 遅延ポップアップ → Claudian 入力に挿入（Add to Claudian） | v0.1.0 |
| F002 | テキスト選択 → 音声読み上げ（Add to TTS、edge / webspeech / plachta の 3 エンジン） | v0.1.0 / v0.8.0 改訂 |
| F003 | ファイルエクスプローラ右クリック → フォルダを Claudian 参照追加（`@path` 挿入） | v0.1.0 |
| F004 | Office/PDF/HTML/CSV → Markdown 変換（markitdown、単体/分割/複数選択の 3 メニュー） | v0.2.0 |
| F005 | ファイル一覧の拡張子フィルタリング（CSS 注入、プリセット含む） | v0.3.0 |
| F006 | 8 タブ構成の設定画面（一般 / テキスト挿入 / 読み上げ / ファイル変換 / 拡張子フィルタ / 残量検知 / Chroma / Memory） | v0.1.0 〜 v0.27.1 |
| F007 | 旧 5 プラグインからの設定データ自動移行 | v0.1.0 〜 |
| F008 | 旧プラグインの一括無効化（1 度だけ・フラグファイル管理） | v0.1.0 〜 |
| F009 | オブジェクトコンテキストメニュー（UI 要素右クリック → Add to Claudian、型/コンテキスト別 ON/OFF） | v0.2.0 / v0.5.0 |
| F010 | Chroma DB ブラウザ（サイドバービュー、コレクション一覧・検索・フィルタ・Raw SQL） | v0.3.0 〜 |
| F011 | LLM 残量検知（Claude / DeepSeek / Kimi / MiniMax のマルチプロバイダ、信号色インジケータ） | v0.3.0 〜 v0.5.0 |
| F012 | 診断ログ・グローバルエラーハンドラ（ロード失敗の原因特定用） | v0.3.0 〜 |
| F013 | AI 読み上げボタン（✨、`claude -p` で入力整形） | v0.16.0 |
| F014 | MD 保存ボタン（回答ブロック → Markdown 保存、Memory タブ） | v0.17.0 |
| F015 | TTS 読み上げ仕様統一（統合 `speakText` + タイプ別フィルタ + MD 右クリック Add to TTS） | v0.17.0 |
| F016 | EdgeTTS エンジン別チャンク上限（edge 500 / webspeech・plachta 140） | v0.18.0 |
| F017 | 自動読み上げ「最終回答のみ」ゲート（途中ターン発火防止・思考/ツール除外） | v0.19.0 |
| F018 | Chroma-fs 仮想フォルダ + RAG 検索（chroma_db 内部非表示 + 右クリック RAG） | v0.20.0 |
| F019 | 右クリックバックアップ（ファイルツリー右クリック → タイムスタンプ付きコピー） | v0.21.0 |
| F020 | アンダースコアフォルダ非表示（`_` プレフィックスフォルダをエクスプローラから非表示） | v0.22.0 |
| F021 | クイック返信方案ボタン常時表示（`quickReplyShowAllOptions`） | v0.24.0 |
| F022 | クイック返信ボタン全体の ON/OFF（`quickReplyEnabled` マスタートグル） | v0.25.0 |
| F023 | 方案検出パターン拡張（案N / 第一選択 / best option 等） | v0.26.0 |
| F024 | TTS エンジン変更（edge_tts 同梱 + cloud proxy + 言語モード + Linux 対応） | v0.27.0 |
| F025 | Thought 読上げ除外の防御的強化（複数クラス OR） | v0.27.1 |

### ❌ Out of Scope

- markitdown 以外の変換エンジン
- モバイル対応（`isDesktopOnly: true` を維持）
- 旧プラグインフォルダの物理削除（無効化＝リネームまで。削除はユーザー手動）
- Web Speech エンジンの言語モード固定（auto 判定のみ）

### 🗑️ 廃止済み（計画時には存在したが実装で消えたもの）

| 項目 | 経緯 |
|------|------|
| TTS 5 エンジン構想（claudetts / auto / minimax） | v0.6.0 で minimax 削除・2 択化 → v0.8.0 で plachta 追加の 3 択に確定 → v0.27.0 で edge_tts 同梱・edge-local / edge-cloud / webspeech / plachta の 4 択に拡張 |
| ローカル VITS（spawn ベース / anime-tts） | v0.7.0 で追加されたが v0.8.0 で完全削除、Plachta Cloud（HF Space）に置換 |
| `claudettsHttpSpeak`（POC_015 依存） | v0.27.0 で完全削除、`edgeCloud` HTTPS POST プロキシに置換 |

## 🏗️ アーキテクチャ概要

- **Core 層**（`src/core/`）: 設定スキーマ / ConfigStore / マイグレータ / i18n / 診断
- **Selection**（`src/features/selection/`）: テキスト・フォルダ挿入 + 遅延ポップアップ
- **TTS**（`src/features/tts/`）: 4 エンジン再生 / 自動読み上げ / ツールバー・読上げボタン / chunking / 言語モード
- **LLM**（`src/features/llm/`）: Claude Code CLI（`claude -p`）による入力整形
- **Office**（`src/features/office/`）: markitdown ベースの Markdown 変換
- **Whitelist**（`src/features/whitelist/`）: 拡張子フィルタ（プリセット 5 種 + タグ + `_` フォルダ非表示）
- **Memory**（`src/features/memory/`）: MD 保存ボタン（Memory タブ）
- **Chroma**（`src/features/chroma/`）: Chroma DB ブラウザ
- **Chroma-fs**（`src/features/chroma-fs/`）: 仮想フォルダ非表示 + RAG 検索
- **Quick-reply**（`src/features/quick-reply/`）: 方案ボタン検出 + 注入
- **Quota**（`src/features/quota/`）: LLM 残量検知
- **Backup**（`src/features/backup/`）: 右クリックバックアップ
- **Object context menu**（`src/features/object/`）: オブジェクトコンテキストメニュー

## 📊 テスト実績

- TypeScript テスト: **787 件 PASS**（v0.27.1 時点）
- フロントマター `applied_rules_version: 2.15.0`

## 🔗 関連リンク

- [[../README|POC_017 README]]
- [[01_機能要件|機能要件（As-Built v0.27.1）]]
- [[../02_設計文書/2026-08-29-poc017-doc-integration-v0271-design|設計書 v0.27.1 統合更新]]
- [[../03_開発文書/19_POC017文書v0.27.1統合更新実装計画|実装計画]]

---

## 📝 更新履歴

| バージョン | 日付 | 修正内容 | 修正人 |
|------|------|---------|--------|
| v1.0.0 | 2026-08-10 | 初版（計画時要件） | MiuMiu 🐾 |
| v2.0.0 | 2026-08-13 | As-Built 全面改訂：F009-F012 追加、4 プラグイン統合反映 | MiuMiu 🐾 |
| v2.1.0 | 2026-08-29 | As-Built v0.27.1 全面改訂：F013〜F025 を追加（AI 読み上げ / MD 保存 / TTS 仕様統一 / EdgeTTS チャンク上限 / 最終回答ゲート / Chroma-fs / バックアップ / `_` フォルダ非表示 / 方案ボタン / ボタン全体 ON・OFF / 案検出拡張 / TTS エンジン変更 / Thought 除外強化） | MiuMiu 🐾 |

---

*📋 Claudian Bridge 要件総覧 v2.1.0 · MiuMiu 🐾 · 2026-08-29*
