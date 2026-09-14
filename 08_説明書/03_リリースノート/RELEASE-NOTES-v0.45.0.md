---
title: "RELEASE NOTES v0.45.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-13
modified: 2026-09-15
tags:
  - release-note
  - v0.45.0
  - OpenVPN
  - 残骸経路検知
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.45.0.md`
> 🏷️ **バージョン**: v0.45.0（2026-09-13）

# v0.45.0 — 残骸経路（死んだセッション）の検知（F-045）

## 📖 概要

過去セッションの openvpn が残した経路（ゲートウェイが既に存在しない）が混在していると、**通信がブラックホール化**するのに v0.44.1 までは「経路が 1 本でもある = 正常」と誤判定していた問題を修正。

## 🆕 Added

### 🔍 残骸経路の検知（F-045）

- openvpn ログの `[DHCP-serv: x.x.x.x]` から **そのセッションの正しいゲートウェイ** を記録
- 経路のゲートウェイと照合して 3 パターンに分岐：

| ケース | 判定 | 警告 |
|:------:|------|------|
| ① 正しいゲートウェイの経路が無い | 経路未確立 + 残骸 | ⚠️ 「経路未確立（管理者権限不足）＋残骸経路あり」 |
| ② 正しい経路はあるが残骸が混在 | 残骸経路残存 | ⚠️ 「残骸経路が残っている（削除するか再起動を）」 |
| ③ 正しい経路のみ | 正常 | 警告なし |

- `On-link` 行はゲートウェイとして扱わない（従来の誤判定要因）

## 🧪 検証

- 既存テストすべて GREEN
- vitest **1350 件 PASS**・typecheck 0・check:changelog PASS

## 📦 配布

- `claudian-bridge-0.45.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.45.0

---

*📢 v0.45.0 リリースノート · MiuMiu 🐾 · 2026-09-13*
