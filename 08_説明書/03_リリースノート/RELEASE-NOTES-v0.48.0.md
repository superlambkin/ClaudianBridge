---
title: "RELEASE NOTES v0.48.0"
type: release-note
version: 1.0
created: 2026-09-14 08:00
modified: 2026-09-15
status: stable
tags:
  - claudianbridge
  - リリースノート
  - obsidian-plugin
  - zhipu
  - quota
  - poc-017
language: Japanese
---

# RELEASE NOTES v0.48.0（2026-09-14）

## 🎯 概要

Zhipu（智譜 GLM）残量取得プロバイダを **Python スクリプト spawn から純 TypeScript（`httpGet`）に置換** し、プラグイン全体の Python 依存を Office 変換（markitdown）のみに縮小。F-048。

## ♻️ 変更

| # | 内容 | 詳細 |
|:--:|------|------|
| 1 | **REST 直接呼び出しに置換** | `https://open.bigmodel.cn/api/monitor/usage/quota/limit` を生 Bearer キーで呼び出し（JWT/SDK 不要・実測済）。5h 窓（unit=3）/ 週間窓（unit=6）の 2 段選択 + フォールバック |
| 2 | **Python 依存の廃止** | `quota/python.ts`・`zhipuPythonPath` 設定（型/既定値/正規化/不変条件/i18n 3 ロケール/設定 UI ブロック）を削除。DeepSeek / Kimi / MiniMax と同一の `httpGet` 経路に統一 |
| 3 | **Vault 側クリーンアップ** | `_query_zhipu_quota.py` 削除 + zai-sdk アンインストール |

## 🗑️ 削除

- `src/features/quota/python.ts`（Python spawn ヘルパ）
- 設定キー `zhipuPythonPath`（後方互換: 旧 data.json に残存しても無視される）
- i18n キー（ja / zh / en の zhipuPythonPath 関連 3 ロケール）

## 🧪 品質

- テスト **1348 total（1347 passed / 1 skipped）**・typecheck 0・`check:changelog` PASS
- 実機 UAT: Zhipu 接続テスト OK（5h 34% / 残 1,307・週 73% / 残 2,689）

## 📚 関連

- CHANGELOG v0.48.0（📜 改定履歴タブ）
- [[F-number_master|F-番号マスター F048]]
- [[リリースノート|リリースノート.md]]

---

*📢 RELEASE NOTES v0.48.0 · POC_017 Claudian Bridge · MiuMiu 🐾*
