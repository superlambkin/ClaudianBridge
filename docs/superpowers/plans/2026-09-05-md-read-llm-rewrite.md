# MD 読み上げ LLM 原稿書き換え（F-033）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** プロファイル非 original のとき、MD を Claude CLI で聞き手向け口頭原稿に書き換えてから読み上げる（失敗時はトークン変換へフォールバック、見出し単位の粗ハイライト付き）。

**Architecture:** 見出しでセクション分割 → 各 Section を `runClaudePrompt`（claude-cli.ts 既存）で書き換え → 連結後 `chunkTextNatural`+`speakText`。mdReadState は Section 単位で登録し、平坦チャンク idx→Section idx 写像で粗ハイライト。結果は `{filePath}|{mtime}|{profile}` でキャッシュ。

**Tech Stack:** TypeScript, Obsidian, `claude -p`（子プロセス spawn）, vitest+jsdom

## Global Constraints

- LLM 実行元は既存 `runClaudePrompt(prompt): Promise<string|null>`（`src/features/tts/claude-cli.ts`）のみ使用
- プロファイル非 original（workplace/customer/family/classroom/boss/dr）で発動。original は従来経路
- LLM 失敗/タイムアウト/空応答 → `applyProfileTransform`（既存トークン変換）へフォールバック
- キャッシュキー `${filePath}|${content.length}|${profile}`・保存先 `llm-rewrite-cache.json`（上限 100・LRU）
- 4000 字超 Section は段落再分割して複数回呼び出し・連結（同一 Section 扱い）
- 生成中は `new Notice('原稿生成中 n/m…')`。既存テスト全件 PASS 維持・TDD

---

### Task 1: `llm-rewrite.ts`（セクション分割・プロンプト組立・書き換え）

**Files:**
- Create: `src/features/tts/llm-rewrite.ts`
- Create: `tests/features/tts/llm-rewrite.test.ts`

**Interfaces:**
- Consumes: `runClaudePrompt`（import・テストではモック）
- Produces:
  - `interface MdSection { index: number; heading: string; bodyText: string }`
  - `parseSections(rawContent: string): MdSection[]`（frontmatter 除去・見出し行で分割・コードブロック除去）
  - `buildRewritePrompt(section: MdSection, profile: ProfileId): string`
  - `rewriteSections(sections: MdSection[], profile: ProfileId, runFn?: (p: string) => Promise<string|null>, onProgress?: (done: number, total: number) => void): Promise<{ ok: boolean; rewritten: MdSection[]; failed: boolean }>`
    - runFn 既定 `runClaudePrompt`。各 Section を呼び出し、null が 1 つでもあれば `failed=true`・当該 Section は bodyText をそのまま保持
    - 4000 字超 bodyText は `splitLongBody(bodyText)` で段落分割し複数回呼び出し→ `\n` 連結

- [ ] **Step 1: 失敗テスト**

```typescript
// tests/features/tts/llm-rewrite.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseSections, buildRewritePrompt, rewriteSections, splitLongBody } from '../../../src/features/tts/llm-rewrite';

const MD = [
  '---', 'title: t', '---',
  '# 見出し1', '段落1。', '', '段落1b。',
  '## 見出し2', '段落2。',
  '', '```js', 'code', '```', '段落3。',
].join('\n');

describe('parseSections', () => {
  it('frontmatter を除き見出し境界で分割、コードを本文から除去', () => {
    const s = parseSections(MD);
    expect(s.length).toBe(2);
    expect(s[0].heading).toBe('見出し1');
    expect(s[0].bodyText).toContain('段落1');
    expect(s[1].heading).toBe('見出し2');
    expect(s[1].bodyText).not.toContain('code');
    expect(s[1].bodyText).toContain('段落3');
  });
});

describe('splitLongBody', () => {
  it('4096 字超を段落単位で複数に分割', () => {
    const body = Array.from({ length: 20 }, () => 'あ'.repeat(300)).join('\n'); // 6000+
    const parts = splitLongBody(body, 4000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
  });
});

describe('buildRewritePrompt', () => {
  it('profile 名を含む', () => {
    const p = buildRewritePrompt({ index: 0, heading: 'H', bodyText: 'B' }, 'boss');
    expect(p).toContain('boss');
    expect(p).toContain('B');
  });
});

describe('rewriteSections', () => {
  it('全 Section を runFn で書き換えて連結', async () => {
    const runFn = vi.fn().mockResolvedValue('rewritten');
    const sections = [{ index: 0, heading: 'H1', bodyText: 'a' }, { index: 1, heading: 'H2', bodyText: 'b' }];
    const r = await rewriteSections(sections, 'boss', runFn);
    expect(r.failed).toBe(false);
    expect(r.rewritten.map((s) => s.bodyText)).toEqual(['rewritten', 'rewritten']);
    expect(runFn).toHaveBeenCalledTimes(2);
  });

  it('runFn が null を返すと failed=true・原文を保持', async () => {
    const runFn = vi.fn().mockResolvedValue(null);
    const r = await rewriteSections([{ index: 0, heading: 'H', bodyText: 'a' }], 'boss', runFn);
    expect(r.failed).toBe(true);
    expect(r.rewritten[0].bodyText).toBe('a');
  });
});
```

- [ ] **Step 2: 失敗確認**
Run: `npx vitest run tests/features/tts/llm-rewrite.test.ts` → FAIL（モジュール無し）

- [ ] **Step 3: 実装（src/features/tts/llm-rewrite.ts）**

```typescript
import type { ProfileId } from './profile';
import { runClaudePrompt } from './claude-cli';

export interface MdSection { index: number; heading: string; bodyText: string }

const FRONTMATTER_RE = /^---[\s\S]*?---\r?\n?/;
const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const HEADING_LINE_RE = /^(#{1,6})\s+([^\n]+)/gm;

export function splitLongBody(bodyText: string, max = 4000): string[] {
  if (bodyText.length <= max) return [bodyText];
  const paras = bodyText.split(/\n\s*\n/);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n' + p).length > max && cur) { out.push(cur); cur = p; }
    else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseSections(rawContent: string): MdSection[] {
  const text = rawContent.replace(FRONTMATTER_RE, '').replace(CODE_FENCE_RE, ' ');
  const lines = text.split('\n');
  const sections: MdSection[] = [];
  let cur: MdSection | null = null;
  for (const line of lines) {
    const m = HEADING_LINE_RE.exec(line);
    HEADING_LINE_RE.lastIndex = 0;
    if (m) {
      if (cur) sections.push(cur);
      cur = { index: sections.length, heading: m[2].trim(), bodyText: '' };
      continue;
    }
    if (cur) cur.bodyText += (cur.bodyText ? '\n' : '') + line;
  }
  if (cur) sections.push(cur);
  // 先頭見出し無しテキスト（prelude）は heading='' の Section として追加
  return sections;
}

export function buildRewritePrompt(section: MdSection, profile: ProfileId): string {
  return [
    `あなたは技術文書を「${profile}」向けの読み上げ原稿に書き換えるアシスタントです。`,
    '- 口頭で自然に読める形にする（記号・コード・表は言葉で説明 or 省略）',
    profileInstruction(profile),
    '- 出力は元の言語で。見出し・装飾・前置きは不要。',
    '--- 本文 ---',
    section.bodyText,
  ].join('\n');
}

function profileInstruction(profile: ProfileId): string {
  switch (profile) {
    case 'workplace': return '- 専門用語・略語はそのまま残し簡潔に';
    case 'customer': return '- 技術詳細は一般語で説明し、実装詳細は省く';
    case 'family': return '- やさしく短い文で、専門用語は言い換える';
    case 'classroom': return '- 専門用語の直後に一言解説を足す';
    case 'boss': return '- 結論 → 理由の順で簡潔に';
    case 'dr': return '- 文書内容をそのまま正確に読み上げる（書き換えは最小）';
    default: return '';
  }
}

export async function rewriteSections(
  sections: MdSection[],
  profile: ProfileId,
  runFn: (p: string) => Promise<string | null> = runClaudePrompt,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; rewritten: MdSection[]; failed: boolean }> {
  let failed = false;
  const rewritten: MdSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    onProgress?.(i + 1, sections.length);
    const parts = splitLongBody(sec.bodyText);
    let out = '';
    for (const part of parts) {
      const res = await runFn(buildRewritePrompt({ ...sec, bodyText: part }, profile));
      if (res === null) { failed = true; out = sec.bodyText; break; }
      out += (out ? '\n' : '') + res.trim();
    }
    rewritten.push({ ...sec, bodyText: out || sec.bodyText });
  }
  return { ok: !failed, rewritten, failed };
}
```

※ parseSections の prelude 対応・heading regex lastIndex リセットは上記実装に含む。テスト期待（sections.length=2 は見出し1/見出し2 のみ）に合わせ、先頭見出し前の空行は無視される。

- [ ] **Step 4: PASS 確認**
Run: `npx vitest run tests/features/tts/llm-rewrite.test.ts` → PASS

- [ ] **Step 5: コミット**
`git add src/features/tts/llm-rewrite.ts tests/features/tts/llm-rewrite.test.ts` → `feat(tts): llm-rewrite セクション分割・プロンプト・書き換え`

---

### Task 2: キャッシュ（llm-rewrite-cache）

**Files:**
- Create: `src/features/tts/llm-rewrite-cache.ts`
- Create: `tests/features/tts/llm-rewrite-cache.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `rewriteCacheKey(filePath: string, contentLength: number, profile: string): string`
  - `class RewriteCache { constructor(pluginDataDir: string) }` で `get(key): Promise<string | null>` / `put(key, value): Promise<void>`（上限 100・LRU・`llm-rewrite-cache.json`）

- [ ] **Step 1: テスト**
key は `${filePath}|${contentLength}|${profile}`。get→put→get で同一値。100 件超で最古が消える（モック fs / 実ファイルを一時 dir 使用）。

- [ ] **Step 2〜4: 実装 + PASS**（fs 直書き・JSON 読み書き・古い順削除）

- [ ] **Step 5: コミット**

---

### Task 3: 統合（md-file-read-flow LLM 経路 + 粗ハイライト）

**Files:**
- Modify: `src/features/tts/md-file-read-flow.ts`
- Modify: `src/features/tts/md-read-highlight/setup.ts`（section 対応は最小限: 従来の idx 通知をそのまま利用し、登録 chunk を Section 単位にすれば粗ハイライトになるため変更最小）
- Modify: `tests/features/tts/md-read-highlight/e2e-underline.test.ts`

**Interfaces:**
- Consumes: Task1 `parseSections/rewriteSections`、Task2 `RewriteCache`、既存 `extractMdText/filterSpeechText/chunkTextNatural/mdReadState`
- Produces: `addMdToTts` が非 original かつ MD 読み上げ時に LLM 原稿で再生

実装方針（最小）:
- `addMdToTts` 冒頭で `const content` 取得後、`const profile = cfg.tts.mdReadProfile ?? 'original'`
- original は従来経路（トークン変換含む）
- 非 original:
  1. cache 確認（`rewriteCacheKey(filePath, content.length, profile)`）→ hit なら原稿使用
  2. miss: `sections = parseSections(content)`、`rewriteSections(sections, profile, undefined, progress)`。進行 Notice `原稿生成中 i/n…`
  3. failed=true → `applyProfileTransform(extractMdText(...))` フォールバック（従来）
  4. 成功 → 原稿 = sections を heading 込みで `# {heading}\n{body}` 連結。これを `text` として後続へ
- ハイライト: 従来は平坦 TTS chunk を anchor 照合。書き換え時は原稿が DOM と不一致のため、**見出し単位**にする：`mdReadState.register` の chunk を `rewrittenSections` の各セクション先頭見出し anchor（元 DOM に存在）で 1 チャンク=1 Section として登録し、`text` は元セクション本文（DOM 照合用・下線範囲）。TTS 本体は原稿の平坦 chunk で流すため、`onChunkStart(idx)` の idx を section 番号へ丸める写像関数を作る：
  - `sectionStarts[i]` = 原稿連結後を `chunkTextNatural` で分割したとき、section i が始まる平坦チャンク index
  - `onChunkStart(flatIdx)` → `sectionOfFlat = lastIndexWhere(sectionStarts <= flatIdx)` → `setActiveIdx(sectionOfFlat)`
- 失敗時・original は従来どおり `filterSpeechText(text)+chunkTextNatural` で登録（anchor 完全一致維持）

- [ ] **Step 1: E2E テスト追加（workplace + LLM モックでセクション原稿→読み上げ・見出し粗ハイライト）**
mockAddTextToTTS に渡る text に「rewritten」を含むこと・mdReadState.chunks がセクション数であること

- [ ] **Step 2〜4: 実装 + 全テスト PASS + build+deploy**

- [ ] **Step 5: コミット**

---

### Task 4: 設定キー + i18n + UI（tts.llmRewriteCache 既定 ON）

**Files:**
- Modify: `src/core/settings.ts`（`tts.llmRewriteCache?: boolean`・normalize 既定 true）
- Modify: `src/settings/SettingTabTts.ts`（プロファイル直下にトグル「🧠 LLM 原稿書き換えキャッシュ」）
- Modify: `src/core/i18n.ts`（ja/zh/en）
- Modify: `tests/core/settings.test.ts`

- [ ] **Step 1〜4: TDD + PASS**
- [ ] **Step 5: コミット**

---

### Task 5: ドキュメント・バージョン

**Files:** package.json/manifest.json → 0.37.0、CHANGELOG F-033、00_使用ガイド、POC_017 CHANGELOG/リリースノート
- [ ] bump / 追記 / build / コミット

---

## セルフレビュー

- Spec 網羅: R1(T1) R2(T3) R3(T3) R4(T3) R5(T2) R6(T3)
- 型整合: `rewriteSections`/`parseSections`/`RewriteCache` を Task 定義・利用で統一
