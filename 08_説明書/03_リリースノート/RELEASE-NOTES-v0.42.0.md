---
title: "RELEASE NOTES v0.42.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-13
modified: 2026-09-15
tags:
  - release-note
  - v0.42.0
  - ネットワークタブ
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.42.0.md`
> 🏷️ **バージョン**: v0.42.0（2026-09-13）

# v0.42.0 — ネットワークタブ UI 先行実装

## 📖 概要

v0.43.0 で追加される OpenVPN 接続機能（F-041）の **UI 先行実装**として、🌐 ネットワークタブを新設し、プロキシ設定を一般タブから移動しました。

## 🆕 Added

- 🌐 **ネットワークタブ**を新設（一般と挿入タブの間に配置）
- **プロキシ設定**を一般タブから移動（`general.proxy` → `network.proxy`）
- **i18n 20 キー追加**（ja / en / zh-CN）

## 🔄 Changed

- 一般タブからプロキシ設定を削除
- 旧キー `general.proxy` は normalize 時に `network.proxy` へ自動移送（後方互換維持）

## 🧪 検証

- 既存テストすべて引き続き GREEN
- vitest **1082 件 PASS**・typecheck 0・check:changelog PASS

## 📦 配布

- `claudian-bridge-0.42.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.42.0

---

*📢 v0.42.0 リリースノート · MiuMiu 🐾 · 2026-09-13*
