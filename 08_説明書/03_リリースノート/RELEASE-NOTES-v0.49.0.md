---
title: "RELEASE NOTES v0.49.0"
type: release-note
template_id: poc/v3.1.0/08-RELEASE-NOTES
template_version: 3.5.0
version: 1.0
status: published
created: 2026-09-14
modified: 2026-09-15
tags:
  - release-note
  - v0.49.0
  - chat-read-highlight
  - md-view-button
language: Japanese
applied_rules_version: 2.15.0
---

> 📂 **パス**: `08_説明書/03_リリースノート/RELEASE-NOTES-v0.49.0.md`
> 🏷️ **バージョン**: v0.49.0（2026-09-14）

# v0.49.0 — チャット読上げハイライト（F-050）+ MD 画面 Add to TTS ボタン（F-051）

## 📖 概要

Claudian 画面の **自動読み上げ体験**を劇的に向上させる 2 機能を同時リリース。

## 🆕 Added

### 💬 F-050: チャット読上げハイライト

Claudian 画面の最終回答自動読み上げ中、**最後のアシスタントメッセージ** にハイライト + スクロール追随する機能です。

| 項目 | 内容 |
|------|------|
| 設定キー | `tts.chatReadHighlight.enabled`（**既定 ON**） |
| ハイライト色 | `tts.mdReadHighlight.highlightColor` を流用（amber 系） |
| CSS クラス | `.claudian-message-assistant.cb-chat-read-active` |
| 世代トークン | `latestToken` で旧 speak の finally が新ハイライトを誤解除しない |
| 発火経路 | 自動読み上げのみ（**手動 🔊 ボタンは対象外**） |

### 📄 F-051: MD 画面ビューヘッダ右上に Add to TTS ボタン

MD ファイル Preview モードのビューヘッダ右上に 🔊 アイコンを追加。**右クリックメニューを開く手間を省く** ショートカットです。

| 項目 | 内容 |
|------|------|
| API | `MarkdownView.addAction('volume-2', ...)` |
| 位置 | ✏️（編集/読切切替）と ⋮（メニュー）の**左側** |
| クリック動作 | 右クリックメニューと同一経路 `addMdToTts(...)` を呼ぶ |
| 重複防止 | `layout-change` で `[data-cb-add-tts]` マーカー付き冪等追加 |

## 🧪 検証

- vitest **1348 total**（1347 passed / 1 skipped）
- 実機 UAT:
  - ハイライト表示 ✅
  - MD 画面ボタン表示 ✅
  - ハイライト OFF 切替 ✅

## ⚠️ ホットフィックス予告

実機 UAT で **Forced reflow 嵐**（ピーク 114ms）が判明。**v0.49.1 で `scrollIntoView` を `requestAnimationFrame` 経由の `behavior:'auto'` 化する緊急対応を予定**。

## 📦 配布

- `claudian-bridge-0.49.0.zip`
- GitHub Release: https://github.com/superlambkin/ClaudianBridge/releases/tag/v0.49.0

---

*📢 v0.49.0 リリースノート · MiuMiu 🐾 · 2026-09-14*
