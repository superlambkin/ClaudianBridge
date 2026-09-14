---
title: "RELEASE NOTES v0.46.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-14
modified: 2026-09-15
tags:
  - release-note
  - v0.46.0
  - OpenVPN
  - 残骸経路削除
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.46.0.md`
> 🏷️ **バージョン**: v0.46.0（2026-09-14）

# v0.46.0 — 残骸経路の 1 クリック削除（F-046）

## 📖 概要

v0.45.0 の検知ロジックを基盤に、stale 経路を **1 クリックで削除する UX** を追加。VPN 使用時は Obsidian を管理者起動する運用を前提に、ボタン押下時に管理者判定 → stale 抽出 → route delete → 結果通知のフローを提供。

## 🆕 Added

### 🧹 Remove stale routes ボタン（F-046）

- **設定 → 🌐 ネットワーク → 🧹 Remove stale routes ボタン**
- ボタン押下時の動作:
  1. `isRunningAsAdmin()` で管理者判定
  2. `getVpnRoutes()` で VPN 関連ルートの抽出（dest/mask を含む）
  3. `findStaleRoutes()` で期待ゲートウェイと一致しない経路をフィルタ
  4. `removeStaleRoutes()` で admin + delete + re-verify のオーケストレーション

### 🛡️ 安全性

- VPN 関連ルートのみを **ホワイトリスト化**して削除
- **ローカル LAN の経路は絶対に触らない**
- 管理者権限がない場合はエラーメッセージで通知

## 🧪 検証

- 既存テストすべて GREEN
- vitest **1354 件 PASS**・typecheck 0・check:changelog PASS
- i18n 5 キー × 3 ロケール追加

## 📦 配布

- `claudian-bridge-0.46.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.46.0

---

*📢 v0.46.0 リリースノート · MiuMiu 🐾 · 2026-09-14*
