---
title: "RELEASE NOTES v0.41.0"
type: release-note
version: 1.0
created: 2026-09-13 10:50
modified: 2026-09-13 10:50
status: stable
tags:
  - claudianbridge
  - リリースノート
  - obsidian-plugin
  - フォルダミラリング
  - poc-017
language: Japanese
---

# RELEASE NOTES v0.41.0（2026-09-13）

## 🎯 概要

Outputs フォルダミラリング（容量削減）・Vault表示タブ化・改定履歴ページの 3 機能追加。

## ✨ 新機能

| # | 機能 | 設定 | 既定値 |
|:--:|------|------|--------|
| 1 | **Outputs フォルダミラリング** — ドキュメント/ObsidainOutputs を Vault/Outputs として NTFS ジャンクションで表示。Vault 内 Outputs 実フォルダ既存時は有効化不可（実フォルダ優先） | `general.outputsMirrorEnabled` / `general.outputsMirrorPath` | OFF / Documents/ObsidainOutputs |
| 2 | **「📂 開く」ボタン** — ミラー元フォルダを Explorer で開く（不在時は自動作成） | 設定欄に付随 | — |
| 3 | **「`.` で始まるフォルダを非表示」** — ファイル一覧から .obsidian 等を除外 | `general.hideDotFolders` | ON |
| 4 | **「📜 改定履歴」設定タブ** — CHANGELOG.md を SSOT として全バージョン表示（アコーディオン） | — | — |
| 5 | **CHANGELOG リリースゲート** — `npm run check:changelog` で CHANGELOG 未更新のリリースを失敗させる | — | — |

## 🔧 変更

- 設定タブ「🗂️ 拡張子フィルタ」を「🗂️ **Vault表示**」に改名

## 🧪 品質

- テスト +17 ケース（outputs-mirror 10 / changelog-parser 7）→ **1267 PASS / 1 skipped / typecheck 0**
- 設計書: [[../../OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/20_Outputsフォルダミラリング設計|20_Outputsフォルダミラリング設計 v1.9]]
