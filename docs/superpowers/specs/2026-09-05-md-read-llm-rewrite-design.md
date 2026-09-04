# MD 読み上げ LLM 原稿書き換え（F-033）

> 📂 パス：docs/superpowers/specs/2026-09-05-md-read-llm-rewrite-design.md
> 📍 源码：D:\AI-Agent\ClaudianBridge\src\features\tts\
> 🏷️ バージョン：v1.0（2026-09-05 設計・承認済み）

---

## 1. 目的

v0.36.0 の聴き手プロファイル（F-032）はトークン置換のみで「口調・原稿の書き換え」にならず、
パス・ID を破壊する問題があった。本機能では **Claude CLI（claude -p）で各セクションを
聞き手向け口頭原稿に書き換えてから読み上げる**ことで、本当の意味で相手に合わせた読み上げを実現する。

## 2. 決定事項

| # | 項目 | 決定 |
|:-:|------|------|
| R1 | 実行元 | Claude CLI（`claude -p`・既存 `runClaudePrompt` 再利用・追加キー不要） |
| R2 | 発動 | プロファイル非 original なら常時（トークン変換に代わる） |
| R3 | ハイライト | 見出し単位の粗ハイライト（書き換え原稿は原文 DOM と不一致のため） |
| R4 | 失敗時 | LLM 失敗/タイムアウト/空応答 → 従来トークン変換へフォールバック |
| R5 | キャッシュ | `{filePath}|{mtime}|{profile}` で書き換え結果をキャッシュ（既定 ON） |
| R6 | 進行表示 | 生成中 Notice「原稿生成中 n/m…」。🔇で中断可能 |

## 3. アーキテクチャ

```
MD content
  → parseSections() 見出しで Section[] 分割（frontmatter/コード除去）
  → rewriteSections(): 各 Section を runClaudePrompt で書き換え（プロファイル別プロンプト）
  → 原稿セクション連結 → chunkTextNatural → speakText
  → section idx → 元 DOM の見出し領域へ粗ハイライト（mdReadState.setActiveIdx）
```

| コンポーネント | 責務 |
|------|------|
| `llm-rewrite.ts`（新規） | `parseSections(content)` / `rewriteSections(sections, profile, runFn)` / プロファイル別プロンプト組立 |
| `claude-cli.ts`（既存） | `runClaudePrompt(prompt)` を再利用 |
| `md-file-read-flow.ts`（変更） | 非 original 時 LLM 書き換え経路へ切替・キャッシュ確認/保存・失敗フォールバック |
| `profile.ts`（変更） | トークン変換はフォールバック用に維持 |
| `md-read-highlight`（変更） | セクション開始時、対応する元見出しへ粗ハイライト |

## 4. プロンプト

```
あなたは技術文書を「{profile}」向けの読み上げ原稿に書き換えるアシスタントです。
- 口頭で自然に読める形にする（記号・コード・表は言葉で説明 or 省略）
- {profile固有指示}
- 出力は元の言語で。見出し・装飾・前置きは不要。余計な説明はしない。
--- 本文 ---
{sectionBody}
```

プロファイル固有指示の例：
- workplace: 専門用語・略語はそのまま残し簡潔に
- customer: 技術詳細を一般語で説明・実装詳細は省く
- family: やさしく短い文で、専門用語は言い換える
- classroom: 専門用語の直後に一言解説を足す
- boss: 結論 → 理由の順で簡潔に
- dr: 文書内容をそのまま正確に読み上げ（書き換えは最小）

## 5. セクション分割・長さ対策

- `parseSections`: 見出し行（`#`〜）を境界に `content` を分割。各 Section は {index, heading, bodyText}
- bodyText が 4000 字超の Section は、空行/段落で再分割し複数回呼び出し→連結（同一 Section 扱いで粗ハイライト維持）
- 空セクション・本文なしはスキップ

## 6. 粗ハイライト

- 書き換え時に `mdReadState.register` は Section ごとに chunk を登録：
  anchor = 元見出しテキストの正規化先頭 24 文字 / text = 元 Section 領域（DOM 照合用）
- `onChunkStart` は平坦チャンク idx を Section idx に写像し、Section 先頭のみ `setActiveIdx(sectionIdx)`
- 以後その Section 内のチャンクでは再通知しない（v0.35.2 の lastHighlightIdx 抑制を利用）

## 7. キャッシュ

- キー: `${filePath}|${content.length}|${profile}`（mtime の代わりに長さで簡易化 or mtime 使用）
- 保存先: プラグイン data ディレクトリ `llm-rewrite-cache.json`（上限 100 件・LRU）
- `tts.llmRewriteCache`（既定 ON）で無効化可能

## 8. テスト（TDD）

1. parseSections: 見出し分割・frontmatter 除外・空セクション除外
2. rewriteSections: runFn モックでプロンプト組立・返答連結・長文再分割
3. 統合: 非 original で addMdToTts が書き換え経路・original は従来
4. フォールバック: runFn=null でトークン変換に落ちる
5. キャッシュ: 同一キーで再生成しない・上限超過で LRU 削除
6. 粗ハイライト: セクション先頭で対応見出しへ setActiveIdx

## 9. バージョン

- v0.37.0（CHANGELOG・F-033 追記）
