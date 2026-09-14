---
title: "RELEASE NOTES v0.43.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-13
modified: 2026-09-15
tags:
  - release-note
  - v0.43.0
  - OpenVPN
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.43.0.md`
> 🏷️ **バージョン**: v0.43.0（2026-09-13）

# v0.43.0 — OpenVPN 接続機能（F-041）+ 🌐 ネットワークタブ（F-042）

## 📖 概要

`.ovpn` ファイル + auth-user-pass での **VPN トンネル確立**機能を追加。LAN 内の LLM/Chroma サーバへ安全にアクセスできます。LLM 呼び出し時の自動接続にも対応。

## 🆕 Added

### 🔐 OpenVPN 接続機能（F-041）

- **手動接続/切断**ボタン + LLM 呼び出し時の自動接続（`network.openvpn.autoConnectOnLlm` 既定 ON）
- **auth-user-pass** 対応（ユーザー名・パスワードを別途指定・一時ファイルは chmod 600）
- **状態管理 4 値**（disconnected / connecting / connected / error）+ stderr 監視 + リアルタイムログ表示
- `ensureVpnConnected()` による **LLM dispatch 前の自動接続フック**（TTS の AI 読み上げ経路も対応）
- プラグイン無効化時に **VPN も自動切断**（ゾンビプロセス防止）
- デスクトップ環境のみ（Win/Mac/Linux）

### 🌐 ネットワークタブ新設（F-042）

- 一般タブとテキスト挿入タブの間に「🌐 ネットワーク」タブを新設
- プロキシ設定（v0.38.0）を一般タブから移動
- OpenVPN 接続セクションを新設

## 🔄 Changed

- i18n 20 キー追加（ja / en / zh-CN）

## ⚠️ 制限事項

- OpenVPN はデスクトップ環境でのみ動作（モバイルでは不可・UI に注記表示）

## 🧪 検証

- 既存テストすべて GREEN
- vitest **1267 件 PASS / 1 skipped**・typecheck 0・check:changelog PASS

## 📦 配布

- `claudian-bridge-0.43.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.43.0

---

*📢 v0.43.0 リリースノート · MiuMiu 🐾 · 2026-09-13*
