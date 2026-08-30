---
title: "画面_XX_画面名"
type: ui-design
template_id: poc/v3.1.0/09-画面-テンプレート
template_version: 3.5.0
version: 3.5.0
status: draft
created: 2026-06-21
modified: 2026-07-26 08:52
tags: 
  - 画面設計
  - UI
  - Screen
aliases: 
  - Screen_XX
language: Japanese
applied_rules_version: 2.9.2
---

> 📂 **パス**: `02_設計文書/09_画面設計/画面_XX_画面名.md`
> 📍 **ソース**: `対応ソースパス`
> 🎯 **目的**: 単一画面の詳細設計テンプレート

---

## 📐 概要

| 属性 | 値 |
|------|-----|
| **画面 ID** | Screen_XX |
| **画面名称** | [画面日本語名] |
| **ルーティング** | `/xxx` |
| **ViewModel** | `XxxViewModel` |
| **遷移先画面** | Screen_XX → [遷移先] |
| **遷移元画面** | [遷移元画面] → Screen_XX |

---

## 📊 画面フローチャート

```mermaid
graph TB
    Start([画面表示]) --> Header[TopAppBar]
    Header --> Body[メインコンテンツ]
    Body --> FAB[ FAB ボタン]
    FAB --> Action1[操作 1]
    FAB --> Action2[操作 2]
    Action1 --> End([戻る/遷移])
```

---

## 🎨 フィールド定義

| フィールド名 | タイプ | 説明 | 必須 |
|--------|------|------|:----:|
| [field_name] | String | [説明] | ✅ |
| [field_name] | Int | [説明] | ❌ |

---

## 🔄 状態定義

```mermaid
stateDiagram-v2
    [*] --> Loading: 画面表示
    Loading --> Content: データ読み込み完了
    Loading --> Error: 読み込み失敗
    Error --> Loading: 再試行
    Content --> Loading: 更新
    Content --> [*]: 戻る
```

---

## 📱 UI コンポーネント

### TopAppBar

| 属性 | 値 |
|------|-----|
| **タイトル** | [画面タイトル] |
| **左側アイコン** | [戻る/メニュー] |
| **右側アイコン** | [その他の操作] |

### Body

| コンポーネント | 用途 |
|------|------|
| [コンポーネント1] | [説明] |
| [コンポーネント2] | [説明] |

### FAB

| アイコン | 操作 | 権限 |
|------|------|------|
| [アイコン] | [操作名] | [権限] |

---

## 🔗 関連リンク

- [[README]] — 画面設計インデックス
- [[../03_状態マシン]] — 関連状態マシン

---

## 📝 更新履歴

| バージョン | 日付 | 修正内容 | 修正者 |
|------|------|---------|--------|
| v1.0.0 | YYYY-MM-DD | 初版:画面設計 | MiuMiu 🐾 |

---

*📱 画面_XX_画面名 v1.0.0 · MiuMiu 🐾*
