---
title: "VERSION ファイル生成仕様"
type: deployment-spec
project_id: POC_017_ClaudianBridge
status: stable
created: 2026-08-29
modified: 2026-08-29
tags:
  - デプロイ運用
  - VERSION
  - rag
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `80_POC_Projects/POC_017_ClaudianBridge/05_デプロイ運用/VERSION_specification.md`
> 📍 **ソース**: `D:\AI-Agent\ClaudianBridge\scripts\deploy.mjs`
> 🐕 **担当**: MiuMiu 🐾

---

# 📦 VERSION ファイル生成仕様

## 概要

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `.obsidian/plugins/ClaudianBridge/VERSION` |
| **値の例** | `1.3.8`（v0.27.1 時点） |
| **生成タイミング** | `npm run deploy`（=`scripts/deploy.mjs`）実行時 |
| **値の由来** | `D:\AI-Agent\ClaudianBridge\rag\VERSION` の内容 |
| **生成ロジック** | deploy.mjs の deploy ファイルリストに `"rag/VERSION"` が含まれており、ビルド成果物として Plugin フォルダにコピーされる |

## ソース

`D:\AI-Agent\ClaudianBridge\scripts\deploy.mjs`（line 38）:

```javascript
"rag/VERSION",
```

このリストは `extraResources` または同等のもので、Plugin フォルダにコピーされるファイル群を定義。

## 値の系列（rag バージョン）

`rag/VERSION` の値は **rag サブモジュールのバージョン番号系列**であり、Claudian Bridge Plugin の manifest.json の `version: "0.27.1"` とは**独立した系列**。

| 項目 | 系列 | 例 |
|------|------|-----|
| `manifest.json` の `version` | 0.X.Y 形式（semver 風） | `0.27.1` |
| `VERSION` ファイル | 1.X.Y 形式（rag 内部バージョン） | `1.3.8` |

## 検証方法

```bash
# Plugin フォルダの VERSION
cat 'C:\Users\superlambkin\OneDrive\Edge\Obsidian Vault\.obsidian\plugins\ClaudianBridge\VERSION'

# ソースの rag/VERSION
cat 'D:\AI-Agent\ClaudianBridge\rag\VERSION'
```

両者が一致することを確認。

## バージョン二重管理の問題

現状、Plugin のバージョンは **2 つの系列**で管理されている:

1. **manifest.json の version** (`0.27.1`): Plugin のリリースバージョン（npm/git tag で管理）
2. **VERSION ファイル** (`1.3.8`): rag サブモジュールのバージョン（rag/VERSION から自動コピー）

これは「同 Plugin のバージョンが 2 つ存在する」状態で、混乱の元。

### 改善案（将来タスク）

- **案 A**: VERSION ファイルを廃止し、manifest version に統一
- **案 B**: VERSION ファイルを manifest version と完全同期させる仕組みを追加（deploy.mjs で `fs.writeFileSync('VERSION', manifest.version)`）
- **案 C**: 現状維持（履歴的理由のため VERSION ファイルを継続）

## 変更履歴

| 日付 | 変更 | 担当 |
|------|------|------|
| 2026-08-29 | 初版作成（VERSION=1.3.8 / manifest version=0.27.1 時点） | MiuMiu 🐾 |

---

*📦 VERSION 生成仕様 v1.0.0 · Claudian Bridge · MiuMiu 🐾 · 2026-08-29*
