---
title: "F-番号マスター（Claudian Bridge）"
type: feature-master
project_id: POC_017_ClaudianBridge
status: stable
created: 2026-08-29
modified: 2026-09-07
tags:
  - F-番号
  - マスター
  - SSOT
aliases:
  - F-番号 SSOT
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/F-number_master.md`
> 🎯 **用途**: Claudian Bridge の全機能に付与された F-番号の Single Source of Truth（SSOT）

---

# 📚 F-番号マスター

## F-番号一覧（F001 〜 F032）

| F-番号 | 機能名 | 導入 ver | 概要 | 関連 commit / 設計書 |
|:------:|--------|:--------:|------|---------------------|
| F001 | テキスト挿入 | v0.1.0 | 選択テキスト → Claudian 入力欄 | `[[01_機能要件#F001]]` |
| F002 | 音声読み上げ（TTS） | v0.1.0 | edge / WebSpeech / Plachta の 3 エンジン | `[[2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode]]` |
| F003 | フォルダ参照追加 | v0.1.0 | フォルダ右クリック → `@path` 挿入 | |
| F004 | Office 変換 | v0.2.0 | markitdown ベース | |
| F005 | 拡張子フィルタ | v0.3.0 | CSS 注入で拡張子絞り込み | |
| F006 | 設定画面 | v0.1.0〜 | 8 タブ構成 | |
| F007 | 設定自動移行 | v0.1.0 | 旧 5 プラグインの data.json | |
| F008 | 旧プラグイン無効化 | v0.1.0 | 1 度だけ無効化 | |
| F009 | オブジェクトコンテキストメニュー | v0.2.0 | `@object[type]` 挿入 | `[[10_オブジェクトコンテキストメニュー設計]]` |
| F010 | Chroma DB ブラウザ | v0.3.0 | サイドバービュー | `[[2026-08-15-zhipu-quota-provider-design]]` |
| F011 | LLM 残量検知 | v0.5.0 | 5 プロバイダの残量 | `[[11_LLM残量検知設計]]` |
| F012 | 診断ログ | v0.3.0 | グローバルエラーハンドラ | |
| F013 | AI 読み上げボタン（✨） | v0.16.0 | `claude -p` で整形 | `[[2026-08-16-input-ai-read-button-design]]` |
| F014 | MD 保存ボタン | v0.17.0 | 回答ブロック → Markdown 保存 | `[[2026-08-16-md-save-button-design]]` |
| F015 | TTS 読み上げ仕様統一 | v0.17.0 | `speakText` 統合 | `[[2026-08-16-tts-read-spec-enhancement-design]]` |
| F016 | EdgeTTS チャンク上限 | v0.18.0 | エンジン別上限 | `[[2026-08-16-edge-chunkmax-settings-design]]` |
| F017 | 自動読み上げ最終回答のみ | v0.19.0 | `detectFinalAnswerState()` ゲート | `[[2026-08-16-tts-auto-read-final-answer-design]]` |
| F018 | Chroma-fs + RAG | v0.20.0 | 仮想フォルダ + RAG 検索 | `[[2026-08-16-chroma-fs-virtual-folder-design]]` |
| F019 | 右クリックバックアップ | v0.21.0 | `BackupMenuRegistrar` | `[[2026-08-17-backup-feature-design]]` |
| F020 | アンダースコアフォルダ非表示 | v0.22.0 | `_` プレフィックス | `[[2026-08-17-underscore-folder-hide-design]]` |
| F021 | 方案ボタン常時表示 | v0.24.0 | `quickReplyShowAllOptions` | `[[2026-08-18-claudian-chat-quick-reply-buttons-design]]` |
| F022 | クイック返信ボタン全体 ON/OFF | v0.25.0 | `quickReplyEnabled` | 同上 |
| F023 | 方案検出パターン拡張 | v0.26.0 | 「案N」「第一選択」等 | 同上 |
| F024 | TTS エンジン変更 | v0.27.0 | edge_tts 同梱 + cloud + 言語モード + Linux | `[[2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode]]` |
| F025 | Thought 読上げ除外強化 | v0.27.1 | 複数クラス OR | |
| F026 | 完了報告読上げスクリプト整形 | v0.28.0 | ✅ 完了報告を ヘッダー/結論/次のアクション提案 のサマリーのみ読み上げ（成果物・検証結果・参照文献・表は除外） | `[[2026-08-30-report-speech-script-design]]` |
| F027 | トークン速度（tok/s）表示 | v0.30.0〜v0.32.0 | `general.tokenRateEnabled`。4 値（首/現在/平均/最大）表示・項目選択（v0.31.0）・更新周期プリセット既定 250ms（v0.32.0） | `[[2026-08-30-token-rate-display-design]]` |
| F028 | MD 読み上げ位置ハイライト | v0.33.0 | MD「Add to TTS」本文を Preview 上でチャンク単位ハイライト + フローティングオーバーレイ | `[[2026-09-02-md-read-position-highlight-design]]` |
| F030 | チャット内 Mermaid 自動描画 | v0.34.0 | チャットの mermaid フェンスを MarkdownRenderer で自動図化 + `</>` 切替 | `[[13_Mermaidチャット内自動描画設計]]` |
| F031 | MD 読み上げ再生制御強化 | v0.35.0〜v0.35.1 | PlaybackController（⏸/⏭ 実働）・自然分割・Edge 先行変換・色パレット・自動スクロール | `[[14_MD読み上げ再生制御強化設計]]` |
| F032 | 選択ポップアップ位置設定 | v0.38.0 | `selection.popupPosition: 'top-right' \| 'bottom'` 新設（既定 `top-right`）・`positionPopup` に第3引数 `mode`・ビューポート端のクランプ/反転両モード共通・既存ユーザー可視挙動変更（下 → 右上、設定で `bottom` に戻せる）・i18n ja/en/zh | `[[17_選択ポップアップ位置設定設計]]` |
| F038 | 文生図機能（Text-to-Image） | v0.38.0 | MiniMax image-01 / Zhipu GLM-Image の 2 プロバイダ対応・モーダル UI・`output/Assets/` 固定保存・アクティブノートへ `![[]]` 挿入・i18n ja/en/zh・既存 quota の API キーを流用 | `[[18_文生図機能設計]]` |

> 💡 **F029 は未使用（欠番）**。CHANGELOG・リリースノートに割当が存在しないため、欠番のまま管理する。

## 付与規約

- feat コミット message に F-番号を含める: `feat(F024): TTS エンジン変更 ...`
- 新規機能は**必ず**本マスターに追記してから commit
- 関連設計書・要件・リリースノートの F-番号は本マスターを参照

## SSOT 関係図

```mermaid
graph LR
    FMaster[F-番号マスター<br/>02_設計文書/F-number_master.md]
    FMaster -->|参照| README[README 機能表]
    FMaster -->|参照| Req[機能要件]
    FMaster -->|参照| RN[リリースノート]
    FMaster -->|参照| CH[CHANGELOG]
    FMaster -->|参照| Plans[設計書群]
```

---

*📚 F-番号マスター v1.2.0 · Claudian Bridge · MiuMiu 🐾 · 2026-09-07 As-Built v0.38.0 対応（F-032 retroactive）*
