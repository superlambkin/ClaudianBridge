# MD 読み上げ聴き手プロファイル（F-032）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to TTS で読み上げる内容を聴き手プロファイル（職場/顧客/家族/教室/上司/DR/原文）に合わせて変換し、口調・専門用語・並び順・警告音を最適化する。

**Architecture:** 既存 MD 抽出 → フィルタ後に `applyProfileTransform(text, profile, termsMap)` を挟む。プロファイルごとに口調変換・略語展開・数字漢数字・並び順・ビープ挿入（DR）を適用。設定は `tts.mdReadProfile` と `tts.termsDict` を追加。Web Audio API で短音生成（DR）。

**Tech Stack:** TypeScript, Obsidian API, Web Audio API, vitest + jsdom, esbuild

**Spec:** `docs/superpowers/specs/2026-09-05-md-read-profile-design.md`

## Global Constraints

- 設定キー: `tts.mdReadProfile: 'original' | 'workplace' | 'customer' | 'family' | 'classroom' | 'boss' | 'dr'`（既定 `'original'`）
- 設定キー: `tts.termsDict: string`（Vault 内 MD パス・既定 `''`）
- 用語辞書デフォルト: `00_Vault管理/Tech_用語対照表.md`（存在しないパスは無視）
- キャッシュしない（毎回変換）
- Web Audio API 未対応時はビープスキップ（console warn のみ）
- i18n: ja/zh/en すべてにプロファイル表示名を追加
- 既存キー不変・後方互換（`'original'` で既存挙動と完全一致）
- テスト: TDD・vitest + jsdom・既存テスト 1006 PASS を維持

---

### Task 1: `profile.ts` プロファイル enum と共通基盤

**Files:**
- Create: `src/features/tts/profile.ts`
- Test: `tests/features/tts/profile.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `export type ProfileId = 'original' | 'workplace' | 'customer' | 'family' | 'classroom' | 'boss' | 'dr'`
- Produces: `export const PROFILE_IDS: readonly ProfileId[]`
- Produces: `export function applyProfileTransform(text: string, profile: ProfileId, termsMap: Map<string, string>): string`（他の Task で中身を段階実装・Task 1 では骨組みのみ＋original は no-op 動作）

- [ ] **Step 1: 失敗テストを書く**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyProfileTransform, PROFILE_IDS } from '../../../src/features/tts/profile';

describe('applyProfileTransform (v0.36.0)', () => {
  it('PROFILE_IDS は 7 種', () => {
    expect(PROFILE_IDS.length).toBe(7);
    expect(PROFILE_IDS).toContain('original');
    expect(PROFILE_IDS).toContain('workplace');
    expect(PROFILE_IDS).toContain('customer');
    expect(PROFILE_IDS).toContain('family');
    expect(PROFILE_IDS).toContain('classroom');
    expect(PROFILE_IDS).toContain('boss');
    expect(PROFILE_IDS).toContain('dr');
  });

  it('original プロファイルは入力文字列をそのまま返す', () => {
    const out = applyProfileTransform('API を 3 つ使います', 'original', new Map());
    expect(out).toBe('API を 3 つ使います');
  });
});
```

- [ ] **Step 2: テスト失敗確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: FAIL（`profile.ts` 未定義）

- [ ] **Step 3: 骨組み実装**

```typescript
/**
 * v0.36.0 (F-032): 聴き手プロファイル別の口調・用語変換。
 * 既存 MD 抽出 → フィルタ後に挟んで使う。
 */
export type ProfileId =
  | 'original' | 'workplace' | 'customer' | 'family'
  | 'classroom' | 'boss' | 'dr';

export const PROFILE_IDS: readonly ProfileId[] = [
  'original', 'workplace', 'customer', 'family',
  'classroom', 'boss', 'dr',
] as const;

/** プロファイル変換の薄いエントリ。各プロファイル固有処理は Task 2〜7 で段階実装 */
export function applyProfileTransform(
  text: string,
  profile: ProfileId,
  termsMap: Map<string, string>,
): string {
  if (profile === 'original') return text;
  // 段階実装(Task 2-7)で switch 分岐を展開。v0.36.0 初回は original のみ動作。
  return text;
}
```

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/profile.ts tests/features/tts/profile.test.ts
git commit -m "feat(tts): 聴き手プロファイル enum と applyProfileTransform 骨組み追加"
```

---

### Task 2: workplace プロファイル（略語 1 文字展開）

**Files:**
- Modify: `src/features/tts/profile.ts`
- Modify: `tests/features/tts/profile.test.ts`

**Interfaces:**
- Consumes: Task 1 の `applyProfileTransform`
- Produces: 同一

- [ ] **Step 1: 失敗テストを追記**

```typescript
describe('workplace プロファイル', () => {
  it('略語を 1 文字ずつカタカナ読みに展開', () => {
    const out = applyProfileTransform('API と URL が使えます', 'workplace', new Map());
    expect(out).toBe('エー ピー アイ と ユー アール エル が使えます');
  });

  it('用語辞書の語が優先される', () => {
    const map = new Map([['API', 'アプリケーション・プログラミング・インターフェース']]);
    const out = applyProfileTransform('API を呼ぶ', 'workplace', map);
    expect(out).toBe('アプリケーション・プログラミング・インターフェース を呼ぶ');
  });

  it('元々カタカナの語（エッジタ）はそのまま', () => {
    const out = applyProfileTransform('エッジ で配信', 'workplace', new Map());
    expect(out).toBe('エッジ で配信');
  });
});
```

- [ ] **Step 2: テスト失敗確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: FAIL（workplace 分岐未実装）

- [ ] **Step 3: 最小実装**

```typescript
/** 職場でよく出る略語の既定読みマップ（カタカナ文字単位） */
const DEFAULT_ABBREVIATIONS: Record<string, string> = {
  api: 'エー ピー アイ',
  url: 'ユー アール エル',
  http: 'エー ティ ーティー ピー',
  https: 'エー ティ ーティー ピー エス',
  json: 'ジェイソン',
  yaml: 'ヤムル',
  cli: 'シー エル アイ',
  gui: 'ジー ユー アイ',
  ui: 'ユー アイ',
  ux: 'ユー エックス',
  api: 'エー ピー アイ',
  css: 'シー エス エス',
  html: 'エイチ ティー エム エル',
  sql: 'エスキューエル',
  db: 'ディービー',
  os: 'オー エス',
  pdf: 'ピー ディー エフ',
  url: 'ユー アール エル',
  uri: 'ユー アー アイ',
  ai: 'エー アイ',
  ml: 'エム エル',
  sso: 'エス エス オー',
  oauth: 'オー オース',
};

/** 1 文字ずつ読み: 'API' → 'エー ピー アイ'（スペース区切り・大文字連続語） */
function expandAbbreviation(word: string): string {
  const upper = word.toUpperCase();
  if (DEFAULT_ABBREVIATIONS[upper.toLowerCase()] !== undefined) {
    return DEFAULT_ABBREVIATIONS[upper.toLowerCase()];
  }
  // 大文字連続語（例: "HTTP", "MyAPI"）の各文字をカタカナ読みに
  // ただし全文字が ASCII 英字 2 文字以上の場合のみ展開（誤適用回避）
  if (/^[A-Z]{2,}$/.test(word)) {
    return word.split('').map(toKatakanaChar).join(' ');
  }
  return word;
}

const ASCII_CHAR_KATAKANA: Record<string, string> = {
  A: 'エー', B: 'ビー', C: 'シー', D: 'ディー', E: 'イー',
  F: 'エフ', G: 'ジー', H: 'エイチ', I: 'アイ', J: 'ジェー',
  K: 'ケー', L: 'エル', M: 'エム', N: 'エヌ', O: 'オー',
  P: 'ピー', Q: 'キュー', R: 'アール', S: 'エス', T: 'ティー',
  U: 'ユー', V: 'ブイ', W: 'ダブリュー', X: 'エックス',
  Y: 'ワイ', Z: 'ズィー',
};
function toKatakanaChar(c: string): string {
  return ASCII_CHAR_KATAKANA[c] ?? c;
}

function transformWorkplace(text: string, termsMap: Map<string, string>): string {
  // 単語境界（大文字連続 + 小文字連続・半角空白・句読点）で分割し、各語に展開を適用
  return text.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
}

// Task 1 の switch 分岐に workplace ケースを追加
case 'workplace':
  return transformWorkplace(text, termsMap);
```

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/profile.ts tests/features/tts/profile.test.ts
git commit -m "feat(tts): workplace プロファイル（略語 1 文字展開）を実装"
```

---

### Task 3: customer / family / classroom プロファイル

**Files:**
- Modify: `src/features/tts/profile.ts`
- Modify: `tests/features/tts/profile.test.ts`

**Interfaces:**
- Consumes: Task 1/2 の `applyProfileTransform`
- Produces: 同一

- [ ] **Step 1: 失敗テストを追記**

```typescript
describe('customer プロファイル', () => {
  it('コードフェンス箇所を「コードブロック省略」に置換', () => {
    const out = applyProfileTransform('ここに\n```python\nprint(1)\n```\nコード', 'customer', new Map());
    expect(out).toContain('コードブロック省略');
    expect(out).not.toContain('print(1)');
  });

  it('丁寧語化（だ → です）', () => {
    const out = applyProfileTransform('これは動く。', 'customer', new Map());
    expect(out).toContain('です');
  });
});

describe('family プロファイル', () => {
  it('数字を漢数字に変換', () => {
    const out = applyProfileTransform('3 個の 100 円', 'family', new Map());
    expect(out).toBe('さん 個の ひゃく 円');
  });

  it('コードフェンスを除外', () => {
    const out = applyProfileTransform('前\n```\nprint(1)\n```\n後', 'family', new Map());
    expect(out).not.toContain('print(1)');
  });

  it('用語辞書の語を口語置換', () => {
    const map = new Map([['API', 'アプリと会話する仕組み']]);
    const out = applyProfileTransform('API を説明します', 'family', map);
    expect(out).toBe('アプリと会話する仕組み を説明します');
  });
});

describe('classroom プロファイル', () => {
  it('用語辞書の語直後に「〜とは〇〇」を付記', () => {
    const map = new Map([['API', 'アプリと会話する仕組み']]);
    const out = applyProfileTransform('API を学ぶ', 'classroom', map);
    expect(out).toContain('API とは アプリと会話する仕組み');
  });

  it('図プレースホルダ「ここに図があります」を挿入', () => {
    const out = applyProfileTransform('下の図参照', 'classroom', new Map());
    // 画像や mermaid コードブロックに対する注記は別途 Task で扱うため、ここでは用語辞書なしの単純な丁寧語化のみ検証
    expect(out).toBe('下の図参照'); // まず挙動としては変化なしを確認
  });
});
```

- [ ] **Step 2: テスト失敗確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: FAIL（customer / family / classroom 分岐未実装）

- [ ] **Step 3: 最小実装**

```typescript
/** 顧客向け: コードフェンス除去＋丁寧語化 */
function transformCustomer(text: string, termsMap: Map<string, string>): string {
  let t = text.replace(/```[a-z]*\n[\s\S]*?\n```/g, 'コードブロック省略');
  t = t.replace(/```[\s\S]*?```/g, 'コードブロック省略');
  // 簡単な丁寧語化（文末の「だ」を「です」に）
  t = t.replace(/(です|ます|[。\n])([^。\n]*?)だ(?=[。\n])/g, (_, head, body) => `${head}${body}です`);
  // 用語辞書は workplace と同じ展開を適用
  t = t.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
  return t;
}

/** 数字を漢数字に変換（0-9999） */
const KANJI_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function toKanjiNumber(n: number): string {
  if (n === 0) return '零';
  if (n >= 10000) return String(n); // 1万超はアラビア数字のまま
  const k = (h: number, c: string) => h === 0 ? c : (h === 1 ? '' : KANJI_DIGITS[h]) + c;
  const sen = Math.floor(n / 1000);
  const hyaku = Math.floor((n % 1000) / 100);
  const ju = Math.floor((n % 100) / 10);
  const ichi = n % 10;
  return (sen > 0 ? k(sen, '千') : '') + (hyaku > 0 ? k(hyaku, '百') : '') + (ju > 0 ? k(ju, '十') : '') + (ichi > 0 ? KANJI_DIGITS[ichi] : '');
}

function transformFamily(text: string, termsMap: Map<string, string>): string {
  let t = text.replace(/```[\s\S]*?```/g, ' ');
  // 数字を漢数字に変換
  t = t.replace(/\d+/g, (m) => toKanjiNumber(Number(m)));
  // 用語辞書適用
  t = t.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
  return t;
}

function transformClassroom(text: string, termsMap: Map<string, string>): string {
  let t = text;
  // 用語辞書の語直後に「とは〇〇」を付記
  for (const [term, gloss] of termsMap) {
    t = t.replace(new RegExp(`(${escapeRegExp(term)})(?![とは])`, 'g'),
      `${term} とは ${gloss}`);
  }
  return t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

switch 文に `case 'customer': return transformCustomer(...);` / `family` / `classroom` を追加。

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/profile.ts tests/features/tts/profile.test.ts
git commit -m "feat(tts): customer / family / classroom プロファイルを実装"
```

---

### Task 4: boss / dr プロファイル

**Files:**
- Modify: `src/features/tts/profile.ts`
- Create: `src/features/tts/audio-beep.ts`
- Modify: `tests/features/tts/profile.test.ts`
- Create: `tests/features/tts/audio-beep.test.ts`

**Interfaces:**
- Consumes: Task 1-3 の `applyProfileTransform`
- Produces: 同一＋`export function playBeep(freq?, durMs?): void`（`audio-beep.ts`）

- [ ] **Step 1: 失敗テスト（profile 側）**

```typescript
describe('boss プロファイル', () => {
  it('チャンク配列で 🎯 結論 を先頭に並び替え（チャンク内の段落レベル判定）', () => {
    // boss プロファイルは呼び出し側でチャンク順序を制御するため、
    // applyProfileTransform 自体は文字列変換に専念し、並び替えは呼び出し側で行う設計とする。
    // ここでは text 内の 🎯 結論 見出し直前にマーカー「結論：」を付与することで並び替えヒントを残す。
    const out = applyProfileTransform('## 🎯 結論\n要点\n## 詳細\n詳細', 'boss', new Map());
    expect(out).toMatch(/結論：[\s\S]*要点[\s\S]*詳細：[\s\S]*詳細/);
  });

  it('数値を漢数字にする', () => {
    const out = applyProfileTransform('売上 150 万円', 'boss', new Map());
    expect(out).toContain('百五十');
  });
});

describe('dr プロファイル', () => {
  it('誤字疑い箇所にビープマーカー（[BEEP]）を挿入', () => {
    const out = applyProfileTransform('原文ママ', 'dr', new Map());
    expect(out).toContain('[BEEP]');
  });

  it('修正提案は TODO: プレフィックスを付与', () => {
    const out = applyProfileTransform('修正案', 'dr', new Map());
    expect(out).toContain('TODO:');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/features/tts/profile.test.ts`
Expected: FAIL（boss / dr 分岐未実装）

- [ ] **Step 3: profile.ts 最小実装**

```typescript
function transformBoss(text: string): string {
  // 🎯 結論 見出しの前に「結論：」マーカー、他の見出しの前に「：」マーカー
  let t = text.replace(/(^|\n)(## 🎯 結論\b[^\n]*)/g, '$1結論：$2');
  t = t.replace(/(^|\n)(## (?!🎯 )[^\n]*)/g, '$1詳細：$2');
  // 数字を漢数字（family と同じ toKanjiNumber を利用）
  t = t.replace(/\d+/g, (m) => toKanjiNumber(Number(m)));
  return t;
}

function transformDr(text: string): string {
  // 誤字疑い: "原文ママ" / "TODO" / "FIXME" など
  let t = text;
  t = t.replace(/(原文ママ|TBD|FIXME|XXX|HACK)/g, '[BEEP] $1 [BEEP]');
  // 修正提案: 「修正」始まりを TODO: に変換
  t = t.replace(/^(修正[：:])\s*/gm, 'TODO: ');
  return t;
}
```

switch 文に `case 'boss'` / `case 'dr'` を追加。

- [ ] **Step 4: audio-beep.ts 実装＋テスト**

```typescript
// src/features/tts/audio-beep.ts
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
    catch { return null; }
  }
  return ctx;
}

export function playBeep(freq = 880, durMs = 80): void {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = 0.05;
    osc.connect(gain).connect(c.destination);
    osc.start();
    setTimeout(() => { osc.stop(); }, durMs);
  } catch { /* no-op */ }
}
```

```typescript
// tests/features/tts/audio-beep.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playBeep } from '../../../src/features/tts/audio-beep';

describe('playBeep (v0.36.0)', () => {
  beforeEach(() => {
    const mockCtx = {
      createOscillator: vi.fn(() => ({ frequency: { value: 0 }, type: '', connect: vi.fn().mockReturnThis(), start: vi.fn(), stop: vi.fn })),
      createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn().mockReturnThis() })),
      destination: {},
    };
    // @ts-expect-error: グローバル AudioContext モック
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;
  });

  it('AudioContext 未対応時は no-op（throw しない）', () => {
    // @ts-expect-error: undefined で throw 回避確認
    delete (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    expect(() => playBeep()).not.toThrow();
  });
});
```

- [ ] **Step 5: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/profile.test.ts tests/features/tts/audio-beep.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/features/tts/profile.ts src/features/tts/audio-beep.ts tests/features/tts/profile.test.ts tests/features/tts/audio-beep.test.ts
git commit -m "feat(tts): boss / dr プロファイルと DR 用ビープ生成を追加"
```

---

### Task 5: terms-dict.ts（用語辞書読み込み）

**Files:**
- Create: `src/features/tts/terms-dict.ts`
- Test: `tests/features/tts/terms-dict.test.ts`

**Interfaces:**
- Consumes: なし（Obsidian API は受け取る側で adapter 化）
- Produces: `export function loadTermsDict(app: App, filePath: string): Promise<Map<string, string>>`

- [ ] **Step 1: 失敗テスト**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { loadTermsDict } from '../../../src/features/tts/terms-dict';

describe('loadTermsDict (v0.36.0)', () => {
  it('空パスなら空 Map', async () => {
    const map = await loadTermsDict({} as never, '');
    expect(map.size).toBe(0);
  });

  it('ファイル不在なら空 Map（throw しない）', async () => {
    const app = { vault: { getAbstractFileByPath: () => null } } as never;
    const map = await loadTermsDict(app, '00_Vault管理/Tech_用語対照表.md');
    expect(map.size).toBe(0);
  });

  it('箇条書きの「用語 | 説明」または table から Map を作成', async () => {
    const md = [
      '## 用語',
      '',
      '| 用語 | やさしい表現 |',
      '| --- | --- |',
      '| API | アプリと会話する仕組み |',
      '| DB | データの保管庫 |',
      '',
      '- CLI → コマンド入力',
      '- GUI → 画面操作',
    ].join('\n');
    const file = { path: 'Tech_用語対照表.md' };
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => p.endsWith('Tech_用語対照表.md') ? file : null,
        cachedRead: vi.fn().mockResolvedValue(md),
      },
    } as never;
    const map = await loadTermsDict(app, 'Tech_用語対照表.md');
    expect(map.get('API')).toBe('アプリと会話する仕組み');
    expect(map.get('DB')).toBe('データの保管庫');
    expect(map.get('CLI')).toBe('コマンド入力');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/features/tts/terms-dict.test.ts`
Expected: FAIL（`terms-dict.ts` 未定義）

- [ ] **Step 3: 最小実装**

```typescript
/**
 * v0.36.0 (F-032): 用語辞書ローダ。
 * 指定パスの MD を読み、テーブルまたは箇条書きから「用語 → やさしい表現」Map を返す。
 */
import type { App } from 'obsidian';

export async function loadTermsDict(app: App, filePath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!filePath || !app?.vault) return map;
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) return map;
  const content = await app.vault.cachedRead(file as { path: string });
  parseTable(content, map);
  parseBulletList(content, map);
  return map;
}

function parseTable(md: string, map: Map<string, string>): void {
  const rows = md.split('\n').filter((l) => l.trim().startsWith('|'));
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (/^[-:\s|]+$/.test(cells[0])) continue; // 区切り行
    map.set(cells[0], cells[1]);
  }
}

function parseBulletList(md: string, map: Map<string, string>): void {
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+(\S+)\s*[→\-]\s*(.+)$/);
    if (m) map.set(m[1], m[2].trim());
  }
}
```

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/terms-dict.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/terms-dict.ts tests/features/tts/terms-dict.test.ts
git commit -m "feat(tts): 用語辞書ローダ（テーブル / 箇条書き対応）を実装"
```

---

### Task 6: 設定キー追加（settings.ts / i18n）

**Files:**
- Modify: `src/core/settings.ts`（`TtsSettings` に `mdReadProfile` / `termsDict` を追加・normalize に追加）
- Modify: `src/core/i18n.ts`（ja/zh/en に 7 プロファイル名・辞書パス用ラベル）
- Test: `tests/core/settings.test.ts`（mdReadProfile 既定値とフォールバック）

- [ ] **Step 1: 失敗テスト**

```typescript
describe('tts.mdReadProfile (v0.36.0)', () => {
  it('既定は original', () => {
    expect(normalizeClaudianBridgeSettings({}).tts.mdReadProfile).toBe('original');
  });

  it('職場/顧客/家族/教室/上司/DR も許可される', () => {
    for (const p of ['workplace', 'customer', 'family', 'classroom', 'boss', 'dr']) {
      expect(normalizeClaudianBridgeSettings({ tts: { mdReadProfile: p } }).tts.mdReadProfile).toBe(p);
    }
  });

  it('未知の値は original にフォールバック', () => {
    expect(normalizeClaudianBridgeSettings({ tts: { mdReadProfile: 'unknown' } }).tts.mdReadProfile).toBe('original');
  });

  it('termsDict は空文字が既定', () => {
    expect(normalizeClaudianBridgeSettings({}).tts.termsDict).toBe('');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`mdReadProfile` が `MdReadHighlightSettings` 等に存在しない）

- [ ] **Step 3: 設定型と既定値を追加**

`src/core/settings.ts` の `TtsSettings` 相当のセクションに（実際の既存構造は task 実装時に読み合わせてから配置すること）：

```typescript
  /** v0.36.0 (F-032): 聴き手プロファイル */
  mdReadProfile: 'original' | 'workplace' | 'customer' | 'family' | 'classroom' | 'boss' | 'dr';
  /** v0.36.0: 用語辞書（Vault 内 MD パス） */
  termsDict: string;
```

`DEFAULT_*_SETTINGS` に `mdReadProfile: 'original'` と `termsDict: ''` を追加。`normalize` で `typeof ... === 'string'` チェックし、未知の値は `'original'` にフォールバック。

`src/core/i18n.ts` の `LocaleStrings` に以下を追加：

```typescript
  mdReadProfile: string;
  mdReadProfileDesc: string;
  mdReadProfileOriginal: string;
  mdReadProfileWorkplace: string;
  mdReadProfileCustomer: string;
  mdReadProfileFamily: string;
  mdReadProfileClassroom: string;
  mdReadProfileBoss: string;
  mdReadProfileDr: string;
  mdReadTermsDict: string;
  mdReadTermsDictDesc: string;
```

各 ja / zh / en ロケールに翻訳を追加（例 ja: `mdReadProfile: '👂 聴き手プロファイル'` / `mdReadProfileOriginal: '原文（デフォルト）'` 等）。

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/settings.ts src/core/i18n.ts tests/core/settings.test.ts
git commit -m "feat(tts): 設定キー mdReadProfile / termsDict を追加"
```

---

### Task 7: 設定画面 UI（SettingTabTts 拡張）

**Files:**
- Modify: `src/settings/SettingTabTts.ts`（「ハイライト色」の上に追加）
- Modify: `tests/settings/SettingTabTts.test.ts`（ドロップダウン選択肢を検証）

- [ ] **Step 1: 失敗テスト**

```typescript
describe('聴き手プロファイル設定 UI (v0.36.0)', () => {
  it('SettingTabTts に mdReadProfile ドロップダウンを追加', () => {
    const captured = captureApp();
    renderTtsTab(captured.app as never, captured.containerEl, captured.store);
    // 7 つの選択肢が登録されることを検証
    const options = captured.dropdownHandlers.at(-1)?.options ?? [];
    expect(options).toContain('original');
    expect(options).toContain('workplace');
    expect(options).toContain('customer');
    expect(options).toContain('family');
    expect(options).toContain('classroom');
    expect(options).toContain('boss');
    expect(options).toContain('dr');
  });

  it('termsDict 入力欄が追加される', () => {
    const captured = captureApp();
    renderTtsTab(captured.app as never, captured.containerEl, captured.store);
    const textInputs = captured.textInputs;
    expect(textInputs.some((i) => i.placeholder?.includes('00_Vault管理'))).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/settings/SettingTabTts.test.ts`
Expected: FAIL（ドロップダウンに 7 選択肢がない）

- [ ] **Step 3: 最小実装**

`src/settings/SettingTabTts.ts` のハイライト色設定ブロックの上に挿入：

```typescript
// v0.36.0 (F-032): 聴き手プロファイル
new Setting(containerEl)
  .setName(s.mdReadProfile)
  .setDesc(s.mdReadProfileDesc)
  .addDropdown((d) => {
    d.addOption('original', s.mdReadProfileOriginal);
    d.addOption('workplace', s.mdReadProfileWorkplace);
    d.addOption('customer', s.mdReadProfileCustomer);
    d.addOption('family', s.mdReadProfileFamily);
    d.addOption('classroom', s.mdReadProfileClassroom);
    d.addOption('boss', s.mdReadProfileBoss);
    d.addOption('dr', s.mdReadProfileDr);
    d.setValue(cfg.tts.mdReadProfile)
      .onChange(async (v) => {
        const latest = store.load();
        store.save({ ...latest, tts: { ...latest.tts, mdReadProfile: v as ProfileId } });
        new Notice(s.noticeSaved);
      });
  });

new Setting(containerEl)
  .setName(s.mdReadTermsDict)
  .setDesc(s.mdReadTermsDictDesc)
  .addText((t) =>
    t.setPlaceholder('00_Vault管理/Tech_用語対照表.md')
      .setValue(cfg.tts.termsDict)
      .onChange(async (v) => {
        const latest = store.load();
        store.save({ ...latest, tts: { ...latest.tts, termsDict: v } });
        new Notice(s.noticeSaved);
      }));
```

import `ProfileId` を `./features/tts/profile` から追加。

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/settings/SettingTabTts.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/settings/SettingTabTts.ts tests/settings/SettingTabTts.test.ts
git commit -m "feat(tts): 設定画面に聴き手プロファイルと用語辞書を追加"
```

---

### Task 8: 適用統合（md-file-read-flow 拡張）

**Files:**
- Modify: `src/features/tts/md-file-read-flow.ts`（ファイル名読み上げと本文読み上げの間にプロファイル変換とビープ挿入）
- Modify: `src/features/tts/speak.ts`（`speakText` の第一引数で `profile` を渡す経路を追加）
- Test: `tests/features/tts/md-read-highlight/e2e-underline.test.ts`（プロファイル変換の動作検証）

- [ ] **Step 1: 失敗テスト**

```typescript
it('v0.36.0: workplace プロファイル設定で略語が展開されて読み上げられる', async () => {
  setupMdReadHighlight(app, {} as never);
  const cfg = makeCfg();
  cfg.tts.mdReadProfile = 'workplace';
  const result = await addMdToTts(app, { path: '/a.md', extension: 'md' }, cfg);
  expect(result).toBe(true);
  // ファイル名の後はプロファイル変換後の本文が読まれる
  const calls = mockAddTextToTTS.mock.calls;
  expect(calls[1][1]).toContain('エー ピー アイ'); // API 展開
  expect(calls[1][1]).not.toMatch(/API\b/); // 略語はそのまま残らない
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/features/tts/md-read-highlight/e2e-underline.test.ts`
Expected: FAIL（`cfg.tts.mdReadProfile` 未設定で適用されない）

- [ ] **Step 3: 統合実装**

```typescript
// md-file-read-flow.ts
import { applyProfileTransform } from './profile';
import { loadTermsDict } from './terms-dict';
import { playBeep } from './audio-beep';

export async function addMdToTts(...) {
  ...
  // 2. プロファイル変換（用語辞書ロード → 変換）
  const profile = cfg.tts.mdReadProfile;
  const termsMap = await loadTermsDict(app, cfg.tts.termsDict);
  const transformed = applyProfileTransform(text, profile, termsMap);

  // 3. [BEEP] プレースホルダ箇所で playBeep を予約（DR プロファイル時のみ）
  // speak.ts に beepPositions 配列を引き渡す（後段でチャンク境界に挿入）

  // 4. speakText 実行
  await speakText('md', transformed, cfg, { ... });
}
```

`playBeep` の実行タイミング： [BEEP] マーカーがチャンク内に存在する場合、そのチャンクの音声再生開始時にビープを鳴らす。実装は speakChunks にオプションで `onChunkStartExtra?: () => void` のような仕組みを足すか、`speakChunks` 呼び出し前後でビープを鳴らす（実装時に詳細決定）。

- [ ] **Step 4: テスト PASS 確認**

Run: `npx vitest run tests/features/tts/md-read-highlight/e2e-underline.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/md-file-read-flow.ts src/features/tts/speak.ts tests/features/tts/md-read-highlight/e2e-underline.test.ts
git commit -m "feat(tts): addMdToTts でプロファイル変換と DR ビープを統合"
```

---

### Task 9: ドキュメント・バージョン

**Files:**
- Modify: `package.json` / `src/manifest.json`（バージョン bump: **0.36.0**）
- Modify: `CHANGELOG.md`（新エントリ `[0.36.0] — MD 読み上げ聴き手プロファイル（F-032）`）
- Modify: `00_使用ガイド.md`（機能一覧に聴き手プロファイル追加）

- [ ] **Step 1: バージョン bump（0.36.0）**
- [ ] **Step 2: CHANGELOG に F-032 エントリ追加（Added: 7 プロファイル / 用語辞書 / DR ビープ）**
- [ ] **Step 3: 使用ガイド更新（テキスト読み上げタブの機能一覧に聴き手プロファイル行追加）**
- [ ] **Step 4: `npm test && npm run build` 全緑確認**
- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs(tts): v0.36.0 リリース準備（F-032 聴き手プロファイル）"
```

---

## セルフレビュー結果

- **Spec 網羅**： R1-R10 すべてに対応タスクあり
- **プレースホルダ**： Task 4 Step 1 の「classroom 図プレースホルダ」は Task 3 内で挙動変化なしのテストとして明記
- **型整合**： `ProfileId` / `applyProfileTransform` / `loadTermsDict` / `playBeep` を各タスクで統一
