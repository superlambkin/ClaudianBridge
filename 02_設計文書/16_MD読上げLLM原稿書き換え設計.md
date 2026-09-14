---
tags:
  - design
  - poc
  - poc-017
status: 🟢 安定
version: 1.0.0
created: 2026-09-12 09:06
modified: 2026-09-12 09:06
---
# MD 読み上げ LLM 原稿書き換え 設計仕様書（承認済み）

> 📂 パス：80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/16_MD読上げLLM原稿書き換え設計.md
> 📍 原本：`D:\AI-Agent\ClaudianBridge\docs\superpowers\specs\2026-09-05-md-read-llm-rewrite-design.md`
> 🏷️ バージョン：v1.0（2026-09-05 設計・承認済み）

---

## 1. 目的

v0.36.0 の聴き手プロファイル（F-032）はトークン置換のみで「口調・原稿の書き換え」にならず、パス・ID を破壊する問題があった。本機能では **Claude CLI（claude -p）で各セクションを聞き手向け口頭原稿に書き換えてから読み上げる**。

## 2. 決定事項

| # | 項目 | 決定 |
|:-:|------|------|
| R1 | 実行元 | Claude CLI（`claude -p`・既存 `runClaudePrompt` 再利用） |
| R2 | 発動 | プロファイル非 original なら常時 |
| R3 | ハイライト | 見出し単位の粗ハイライト |
| R4 | 失敗時 | 従来トークン変換へフォールバック |
| R5 | キャッシュ | `{filePath}|{mtime}|{profile}` キャッシュ（既定 ON） |
| R6 | 進行表示 | 生成中 Notice（n/m）・🔇 中断可 |

## 3. アーキテクチャ

```
MD content → parseSections() → Section[]
  → rewriteSections(): runClaudePrompt で各 Section を書き換え（プロファイル別プロンプト）
  → 原稿連結 → chunkTextNatural → speakText
  → section idx → 元 DOM 見出し領域へ粗ハイライト
```

- `llm-rewrite.ts`（新規）: parseSections / rewriteSections / プロンプト組立
- `claude-cli.ts`（既存）: runClaudePrompt 再利用
- `md-file-read-flow.ts`（変更）: 非 original 時 LLM 経路・キャッシュ・フォールバック
- `md-read-highlight`（変更）: セクション先頭で対応見出しへ粗ハイライト

## 4. プロンプト

あなたは技術文書を「{profile}」向けの読み上げ原稿に書き換える。口頭で自然に・{profile固有指示}・元の言語・見出し装飾前置き不要。→ {sectionBody}

## 5. セクション分割

見出し行で分割。bodyText 4000 字超は段落で再分割→複数回呼び出し連結。空はスキップ。

## 6. 粗ハイライト

Section 単位で mdReadState 登録（anchor=元見出し・text=元 Section 領域）。平坦チャンク idx → Section idx 写像。Section 先頭のみ setActiveIdx。

## 7. キャッシュ

`{filePath}|{mtime}|{profile}`。プラグイン data 下 `llm-rewrite-cache.json`（100 件 LRU）。`tts.llmRewriteCache` 既定 ON。

## 8. テスト

parseSections / rewriteSections / 統合（非 original 経路・original 従来）/ フォールバック / キャッシュ / 粗ハイライト

## 9. バージョン

v0.37.0（CHANGELOG・F-033 追記）

## 📝 更新記録

| バージョン | 日付 | 変更内容 | 変更者 |
|-----------|:----:|---------|:------:|
| v1.0.0 | 2026-09-12 | 初版作成 | MiuMiu 🐾 |
