---
title: "RELEASE NOTES v0.49.1"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-15
modified: 2026-09-15
tags:
  - release-note
  - v0.49.1
  - hotfix
  - forced-reflow
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.49.1.md`
> 🏷️ **バージョン**: v0.49.1（2026-09-15）

# v0.49.1 — Forced reflow 嵐の緊急対応（ホットフィックス）

## 📖 概要

v0.49.0 で導入した F-050 チャット読上げハイライトで **`scrollIntoView({behavior:'smooth'})` の同期実行が 114ms ピークの Forced reflow を連発**し Obsidian を実質フリーズさせていた重大バグを緊急修正するホットフィックスです。

## 🔧 Fixed

### chat-read-highlight（F-050）の Forced reflow 嵐

- `scrollIntoView({behavior:'smooth'})` の同期実行が **114ms ピークの Forced reflow を連発**していた
- `requestAnimationFrame` 経由の `behavior:'auto'` 化でレイアウトスラスタを断つ

### md-read-highlight（F-028）の同時パッチ

- `getBoundingClientRect()` 連続呼び出しも layout thrashing を引き起こしていた
- rAF 内に同一フレームでまとめて 1 回だけ実行するよう変更

### 設定 UI の改善

- `tts.chatReadHighlight.enabled` を **既定 ON** で追加（OFF 切替可能）

## 📈 改善結果

| 指標 | v0.49.0 | **v0.49.1** | 改善率 |
|------|--------|--------|------|
| chat-read-highlight ピーク Forced reflow | 114ms | **53ms** | **-53.5%** |
| chat-read-highlight 平均 Forced reflow | 60-80ms | **32-37ms** | **-50%** |
| md-read-highlight ピーク Forced reflow | 90ms | **51ms** | **-43%** |
| Obsidian 全体の体感応答 | フリーズ頻発 | **スムーズ** | 大幅改善 |

## 🧪 検証

- **vitest 1362 件 PASS / 1 skipped**（変化なし）
- typecheck 0・check:changelog PASS
- 実機 UAT:
  - ハイライト表示 ✅
  - 世代トークンで割り込み時誤解除なし ✅
  - OFF 切替動作確認 ✅

## ⚠️ 既知の問題（残存）

残った reflow 派生問題は次セッションで Performance 計測 → 根本対策を予定。

## 📦 配布

- **GitHub Release**: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.49.1
- `claudian-bridge-0.49.1.zip`（720KB）

## 🔗 関連

- 設計: [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/32_チャット読上げハイライト設計|F-050 設計]]
- 既知の問題: [[80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/既知の問題|既知の問題（KB-022/023 修正済）]]
- テスト報告書: [[80_POC_Projects/POC_017_ClaudianBridge/04_テスト文書/02_テスト報告書|1362 件 PASS]]

---

*📢 v0.49.1 リリースノート（ホットフィックス） · MiuMiu 🐾 · 2026-09-15*
