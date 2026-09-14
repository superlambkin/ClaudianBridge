---
title: "RELEASE NOTES v0.47.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-14
modified: 2026-09-15
tags:
  - release-note
  - v0.47.0
  - OpenVPN
  - 自動削除
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.47.0.md`
> 🏷️ **バージョン**: v0.47.0（2026-09-14）

# v0.47.0 — 切断時の残骸経路自動削除（F-047）

## 📖 概要

v0.46.0 の手動 🧹 ボタンに加えて、OpenVPN 切断後に **3 秒待機 → バックグラウンド stale 検出 → 管理者起動時のみ自動削除**する UX を追加。VPN 使用時のユーザー操作を最小化。

## 🆕 Added

### 🧹 切断時の残骸経路自動削除（F-047）

- `stop()` が `setTimeout(3000)` で `cleanupAfterDisconnect()` をスケジュール
- バックグラウンドで stale 経路を検出（管理者起動時のみ自動削除）
- 手動 🧹 ボタン（v0.46.0）は継続有効

### 🔄 Changed

- i18n 1 キー追加（`networkOpenVpnAutoCleaned`）

## 🧪 検証

- 既存テストすべて GREEN
- vitest **1354 件 PASS**・typecheck 0・check:changelog PASS

## 📦 配布

- `claudian-bridge-0.47.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.47.0

---

*📢 v0.47.0 リリースノート · MiuMiu 🐾 · 2026-09-14*
