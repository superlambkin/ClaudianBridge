---
tags:
  - skill-superpowers-subagent-driven-development
  - skill-superpowers-executing-plans
version: 1.0.0
status: 🟢 安定
created: 2026-09-12 09:01
title: 23_Thinkモード選択機能実装計画
type: implementation-plan
modified: 2026-09-13 12:30
---
# Think モード選択機能 Implementation Plan

> 📂 パス：80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/23_Thinkモード選択機能実装計画.md
> 📍 設計書：[[19_Thinkモード選択機能設計]]
> 📍 リポジトリ：`D:\AI-Agent\ClaudianBridge`
> 🔖 関連: [[F-number_master#F-039]], [[F-number_master#F-040]]
> 🏷️ バージョン：v1.0（2026-09-08 作成・v0.39.0/v0.40.0 で実装完了）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ℹ️ **実装実績**: 本計画は **Phase 1 (v0.39.0, F-039) Claude のみ** と **Phase 2 (v0.40.0, F-040) 他 4 プロバイダ** の 2 段階でリリース済。コミット履歴は [[CHANGELOG]] 参照。

**Goal:** 5 プロバイダ（Claude / DeepSeek / Zhipu / MiniMax / Kimi）ごとに Think モード（ON/OFF + エフォート）を設定タブで個別選択可能にし、polishInstruction が各プロバイダのネイティブ API で Think 制御パラメータを送る。

**Architecture:** `LlmClient` インターフェースを共通化し、Claude は既存 `claude -p` 経路（env 変数 `MAX_THINKING_TOKENS`）、他 4 プロバイダは `fetch` 直接呼び出し（OpenAI 互換 body で `thinking.type` + `reasoning_effort`）。`dispatch.ts` が `LlmProviderId` を解決して適切なクライアントを返す。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest / Node.js `fetch` / `claude -p` CLI

## Global Constraints

- 対象プラグイン: ClaudianBridge（`D:\AI-Agent\ClaudianBridge`）
- 既存パターン遵守: `quota/providers/*.ts`（provider 別ファイル＋factory 関数）
- テストランナー: vitest（既存 1006+ 件パスに追加で 44 件）
- マイグレーション: `normalizeClaudianBridgeSettings` で default 補完（後方互換必須）
- 段階リリース: v0.38.0 = Claude のみ、v0.39.0 = 他 4 プロバイダ
- 既存 `ClaudeCliOptions.disableThinking` は v0.38.0 で deprecated（削除は次メジャー）
- コミットメッセージ規約: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` + Conventional Commits
- ブランチ: `hotfix/v0.32.1`（既存）にコミット
- i18n キー追加: `getLocaleStrings()` の両言語（en/ja）に必ず追加

---

## Phase 1: Claude + 基盤（v0.38.0）

### Task 1: Add `ThinkingConfig` 型を新設

**Files:**
- Create: `src/features/llm/types.ts`
- Test: `tests/llm/types.test.ts`

**Interfaces:**
- Consumes: （なし）
- Produces: `export type ThinkingEffort = 'off' \| 'low' \| 'medium' \| 'high'`, `export interface ThinkingConfig { enabled: boolean; effort: ThinkingEffort; }`, `export interface LlmClient { readonly id: 'claude' \| 'deepseek' \| 'kimi' \| 'minimax' \| 'zhipu'; runPrompt(prompt, opts): Promise<string \| null>; }`, `export const THINKING_EFFORT_VALUES = ['off','low','medium','high'] as const;`

- [ ] **Step 1: Write the failing test**

Create `tests/llm/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { THINKING_EFFORT_VALUES, type ThinkingEffort } from '../../src/features/llm/types';

describe('THINKING_EFFORT_VALUES', () => {
  it('off/low/medium/high の 4 値を含む', () => {
    expect(THINKING_EFFORT_VALUES).toEqual(['off', 'low', 'medium', 'high']);
  });
  
  it('不正な文字列は型エラー（コンパイル時保証）', () => {
    // Type-level test: assigning invalid string to ThinkingEffort should fail
    const valid: ThinkingEffort = 'medium';
    expect(valid).toBe('medium');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/types.test.ts`
Expected: FAIL with "Cannot find module '../../src/features/llm/types'"

- [ ] **Step 3: Write minimal implementation**

Create `src/features/llm/types.ts`:
```typescript
/**
 * LlmClient インターフェースと共通型定義。
 * v0.38.0 (F-038): Think モード選択機能で追加。
 */

/** エフォートレベル。プロバイダごとに意味が異なる（low/medium/high のみ利用、'off' は enabled=false の意） */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

export const THINKING_EFFORT_VALUES = ['off', 'low', 'medium', 'high'] as const;

/** プロバイダ共通の Think モード設定 */
export interface ThinkingConfig {
  enabled: boolean;
  effort: ThinkingEffort;
}

/** LlmClient インターフェース（全プロバイダ実装の契約） */
export interface LlmClient {
  /** プロバイダ ID（設定 UI で表示用） */
  readonly id: 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu';
  
  /**
   * 整形用プロンプトを実行し本文を返す。失敗・タイムアウト・空応答は null。
   * @param prompt 入力文（整形前）
   * @param opts.thinking Think モード設定
   * @param opts.timeoutMs 既定 30000
   * @param opts.signal AbortSignal（外部 abort 用）
   */
  runPrompt(
    prompt: string,
    opts: {
      thinking: ThinkingConfig;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<string | null>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/types.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/types.ts tests/llm/types.test.ts
git commit -m "feat(llm): LlmClient インターフェースと ThinkingConfig 型を追加 (v0.38.0)"
```

---

### Task 2: Add `thinking` フィールドを ClaudianBridgeSettings に追加

**Files:**
- Modify: `src/core/settings.ts:1-30`（import 追加）
- Modify: `src/core/settings.ts:580-625`（ClaudianBridgeSettings interface に thinking 追加）
- Modify: `src/core/settings.ts:680-720`（DEFAULT_CLAUDIAN_BRIDGE_SETTINGS に thinking 追加）
- Modify: `src/core/settings.ts:820-840`（normalizeClaudianBridgeSettings に thinking 補完追加）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: `ThinkingConfig` from `src/features/llm/types.ts`
- Produces: `ClaudianBridgeSettings.thinking: { claude: ThinkingConfig; deepseek: ThinkingConfig; kimi: ThinkingConfig; minimax: ThinkingConfig; zhipu: ThinkingConfig; }`, `DEFAULT_THINKING_CONFIGS` 定数, `normalizeThinkingConfigs()` 関数

- [ ] **Step 1: Write the failing test**

Append to `tests/core/settings.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeClaudianBridgeSettings, DEFAULT_THINKING_CONFIGS } from '../../src/core/settings';

describe('Think モード default', () => {
  it('thinking 欠落時に 5 プロバイダ分 default が補完される', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.thinking.claude).toEqual(DEFAULT_THINKING_CONFIGS.claude);
    expect(result.thinking.deepseek).toEqual(DEFAULT_THINKING_CONFIGS.deepseek);
    expect(result.thinking.kimi).toEqual(DEFAULT_THINKING_CONFIGS.kimi);
    expect(result.thinking.minimax).toEqual(DEFAULT_THINKING_CONFIGS.minimax);
    expect(result.thinking.zhipu).toEqual(DEFAULT_THINKING_CONFIGS.zhipu);
  });
  
  it('Claude だけ enabled=true、他は enabled=false', () => {
    const result = normalizeClaudianBridgeSettings({});
    expect(result.thinking.claude.enabled).toBe(true);
    expect(result.thinking.deepseek.enabled).toBe(false);
    expect(result.thinking.kimi.enabled).toBe(false);
    expect(result.thinking.minimax.enabled).toBe(false);
    expect(result.thinking.zhipu.enabled).toBe(false);
  });
  
  it('既存ユーザーの thinking 設定はそのまま保持される', () => {
    const result = normalizeClaudianBridgeSettings({
      thinking: {
        claude: { enabled: false, effort: 'high' },
        deepseek: { enabled: true, effort: 'low' },
        kimi: { enabled: false, effort: 'medium' },
        minimax: { enabled: true, effort: 'high' },
        zhipu: { enabled: true, effort: 'low' },
      },
    });
    expect(result.thinking.claude.enabled).toBe(false);
    expect(result.thinking.deepseek.enabled).toBe(true);
    expect(result.thinking.deepseek.effort).toBe('low');
  });
  
  it('部分設定（Claude のみ）は他プロバイダを default で補完', () => {
    const result = normalizeClaudianBridgeSettings({
      thinking: {
        claude: { enabled: false, effort: 'high' },
      },
    });
    expect(result.thinking.claude.enabled).toBe(false);
    expect(result.thinking.deepseek).toEqual(DEFAULT_THINKING_CONFIGS.deepseek);
    expect(result.thinking.zhipu).toEqual(DEFAULT_THINKING_CONFIGS.zhipu);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts -t "Think モード default"`
Expected: FAIL with "result.thinking is undefined" or "thinking is not a property"

- [ ] **Step 3: Add thinking field to ClaudianBridgeSettings**

Edit `src/core/settings.ts`:
```typescript
// 1. import 追加（ファイル先頭付近）
import type { ThinkingConfig } from '../features/llm/types';

// 2. ClaudianBridgeSettings interface に追加（imageGen フィールドの直前）
  // === v0.38.0 (F-038): Think モード選択機能 ===
  /** プロバイダ別 Think モード設定 */
  thinking: {
    claude: ThinkingConfig;
    deepseek: ThinkingConfig;
    kimi: ThinkingConfig;
    minimax: ThinkingConfig;
    zhipu: ThinkingConfig;
  };
}

// 3. DEFAULT_CLAUDIAN_BRIDGE_SETTINGS の imageGen の直前に追加
export const DEFAULT_THINKING_CONFIGS = {
  claude:  { enabled: true,  effort: 'medium' } as ThinkingConfig,
  deepseek:{ enabled: false, effort: 'medium' } as ThinkingConfig,
  kimi:    { enabled: false, effort: 'medium' } as ThinkingConfig,
  minimax: { enabled: false, effort: 'medium' } as ThinkingConfig,
  zhipu:   { enabled: false, effort: 'medium' } as ThinkingConfig,
};

// 4. DEFAULT_CLAUDIAN_BRIDGE_SETTINGS 内に追加（imageGen の直前）
  thinking: { ...DEFAULT_THINKING_CONFIGS },
```

- [ ] **Step 4: Add normalize logic for thinking**

In `normalizeClaudianBridgeSettings`, add at the end (before `return {`):
```typescript
  // === v0.38.0 (F-038): Think モード default 補完 ===
  const normalizeThinking = (raw: unknown): ThinkingConfig => {
    const t = (raw ?? {}) as Partial<ThinkingConfig>;
    const effort = (t.effort === 'low' || t.effort === 'medium' || t.effort === 'high' || t.effort === 'off')
      ? t.effort : 'medium';
    return { enabled: typeof t.enabled === 'boolean' ? t.enabled : false, effort };
  };
```

Add to the returned object (before `imageGen:`):
```typescript
    thinking: {
      claude: normalizeThinking(r.thinking?.claude) === (r.thinking?.claude as ThinkingConfig | undefined)
        ? (r.thinking?.claude ?? DEFAULT_THINKING_CONFIGS.claude)
        : DEFAULT_THINKING_CONFIGS.claude,
      // より堅牢な書き方（下記に置換）:
      claude: r.thinking?.claude ?? DEFAULT_THINKING_CONFIGS.claude,
      deepseek: normalizeThinking(r.thinking?.deepseek),
      kimi: normalizeThinking(r.thinking?.kimi),
      minimax: normalizeThinking(r.thinking?.minimax),
      zhipu: normalizeThinking(r.thinking?.zhipu),
    },
```

Remove the first `claude:` line (the one with the awkward ternary) - keep only the second clean version.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts -t "Think モード default"`
Expected: PASS（4 tests）

- [ ] **Step 6: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): ClaudianBridgeSettings に thinking フィールドを追加 (v0.38.0, F-038)"
```

---

### Task 3: Add `createClaudeClient` factory to claude-cli.ts

**Files:**
- Modify: `src/features/llm/claude-cli.ts:1-118`
- Test: `tests/llm/claude-cli.test.ts`

**Interfaces:**
- Consumes: `ThinkingConfig` from `src/features/llm/types.ts`
- Produces: `export function createClaudeClient(thinking: ThinkingConfig): LlmClient`

- [ ] **Step 1: Write the failing test**

Create `tests/llm/claude-cli.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaudeClient } from '../../src/features/llm/claude-cli';

// child_process.spawn をモック
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(() => 'C:\\fake\\claude.cmd'),
}));

import { spawn } from 'child_process';
const spawnMock = vi.mocked(spawn);

describe('createClaudeClient', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });
  
  // ... 以下 6 テスト
});
```

Body details for the 6 tests:
```typescript
function makeFakeChild(stdout: string = '', exitCode: number = 0) {
  const stdoutHandlers: Array<(d: Buffer) => void> = [];
  const closeHandlers: Array<(code: number) => void> = [];
  return {
    stdout: { on: (ev: string, cb: (d: Buffer) => void) => { if (ev === 'data') stdoutHandlers.push(cb); } },
    stderr: { on: () => {} },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: (ev: string, cb: (code: number) => void) => { if (ev === 'close') closeHandlers.push(cb); },
    kill: vi.fn(),
    _emit: (chunk: string, code: number) => {
      stdoutHandlers.forEach(h => h(Buffer.from(chunk)));
      closeHandlers.forEach(h => h(code));
    },
  } as any;
}

describe('createClaudeClient.runPrompt', () => {
  beforeEach(() => spawnMock.mockReset());
  
  it('enabled=false で MAX_THINKING_TOKENS=0 を env に注入', async () => {
    const child = makeFakeChild('result', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ MAX_THINKING_TOKENS: '0' }),
      }),
    );
  });
  
  it('enabled=true, effort=high で MAX_THINKING_TOKENS=4096', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '4096' }) }),
    );
  });
  
  it('enabled=true, effort=medium で MAX_THINKING_TOKENS=1024', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'medium' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '1024' }) }),
    );
  });
  
  it('enabled=true, effort=low で MAX_THINKING_TOKENS=512', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'low' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'low' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '512' }) }),
    );
  });
  
  it('exit code 0 以外で null 返却', async () => {
    const child = makeFakeChild('error msg', 1);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(result).toBeNull();
  });
  
  it('client.id === "claude"', () => {
    const client = createClaudeClient({ enabled: true, effort: 'medium' });
    expect(client.id).toBe('claude');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/claude-cli.test.ts`
Expected: FAIL with "createClaudeClient is not a function"

- [ ] **Step 3: Add createClaudeClient to claude-cli.ts**

Append to `src/features/llm/claude-cli.ts` (do NOT modify existing exports for backward compat):
```typescript
import type { LlmClient, ThinkingConfig } from './types';

/**
 * v0.38.0 (F-038): ThinkingConfig を受ける createClaudeClient factory。
 * ThinkingConfig を env 変数（MAX_THINKING_TOKENS）に変換する。
 */
export function createClaudeClient(thinking: ThinkingConfig): LlmClient {
  return {
    id: 'claude',
    async runPrompt(prompt, opts) {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (!thinking.enabled) {
        env.MAX_THINKING_TOKENS = '0';
      } else if (thinking.effort === 'high') {
        env.MAX_THINKING_TOKENS = '4096';
      } else if (thinking.effort === 'low') {
        env.MAX_THINKING_TOKENS = '512';
      } else {
        env.MAX_THINKING_TOKENS = '1024';  // medium or 'off' (安全フォールバック)
      }
      // 既存 runClaudePrompt は env を受け取らないため、内部で spawn する新しい経路を使う
      return runClaudePromptWithEnv(prompt, { ...opts, env });
    },
  };
}

/** 内部用: env を指定して claude -p を実行 */
async function runClaudePromptWithEnv(
  prompt: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; env: NodeJS.ProcessEnv },
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let out = '';
    let child: ReturnType<typeof spawn>;
    const settle = (v: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    let timer: ReturnType<typeof setTimeout>;
    try {
      child = spawn(resolveClaudeCommand(), ['-p'], {
        windowsHide: true,
        env: opts.env,
      });
    } catch (e) {
      console.warn('[cb-claude-cli] spawn threw:', e);
      resolve(null);
      return;
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    const onAbort = (): void => {
      try { child.kill(); } catch { /* ignore */ }
      try { clearTimeout(timer); } catch { /* ignore */ }
      settle(null);
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => console.warn('[cb-claude-cli] stderr:', d.toString().slice(0, 200)));
    child.on('error', (e) => {
      console.warn('[cb-claude-cli] error:', e.message);
      settle(null);
    });
    child.on('close', (code) => {
      if (code === 0) {
        const trimmed = out.trim();
        settle(trimmed === '' ? null : trimmed);
      } else {
        console.warn('[cb-claude-cli] exit code:', code);
        settle(null);
      }
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/claude-cli.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS（既存テストは壊さない）

- [ ] **Step 6: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/claude-cli.ts tests/llm/claude-cli.test.ts
git commit -m "feat(llm): createClaudeClient factory を追加（ThinkingConfig → MAX_THINKING_TOKENS）"
```

---

### Task 4: Add i18n strings for Think モード

**Files:**
- Modify: `src/core/i18n.ts`（両言語の strings に追加）

**Interfaces:**
- Consumes: （なし）
- Produces: `getLocaleStrings()` の返り値に以下のキー:
  - `settingThinkMode.title`: "Think モード" / "Think Mode"
  - `settingThinkMode.description`: 説明文
  - `settingThinkMode.currentProvider`: "現在の LLM プロバイダ" / "Current LLM provider"
  - `settingThinkMode.providerClaude`: "Claude"
  - `settingThinkMode.providerDeepseek`: "DeepSeek"
  - `settingThinkMode.providerKimi`: "Kimi"
  - `settingThinkMode.providerMiniMax`: "MiniMax"
  - `settingThinkMode.providerZhipu`: "Zhipu (GLM)"
  - `settingThinkMode.enabled`: "Think モード" / "Think Mode"
  - `settingThinkMode.effort`: "エフォート" / "Effort"
  - `settingThinkMode.effortOff`: "OFF"
  - `settingThinkMode.effortLow`: "低" / "Low"
  - `settingThinkMode.effortMedium`: "中" / "Medium"
  - `settingThinkMode.effortHigh`: "高" / "High"
  - `settingThinkMode.badgeOn`: "🧠 ON"
  - `settingThinkMode.badgeOff`: "🧠 OFF"

- [ ] **Step 1: Inspect existing i18n structure**

Run: `grep -n "general.tokenRateEnabled" src/core/i18n.ts | head -5`
Expected: Show where general.* keys are defined (around line X for English, line Y for Japanese).

- [ ] **Step 2: Add Think モード strings**

In `src/core/i18n.ts`, find both the `en` and `ja` locale objects. Add at the end of each (or in the general section):
```typescript
// English (en):
settingThinkMode: {
  title: 'Think Mode',
  description: 'Configure thinking mode per LLM provider. Affects MD read-aloud and AI read-aloud buttons.',
  currentProvider: 'Current LLM provider',
  providerClaude: 'Claude',
  providerDeepseek: 'DeepSeek',
  providerKimi: 'Kimi',
  providerMiniMax: 'MiniMax',
  providerZhipu: 'Zhipu (GLM)',
  enabled: 'Think Mode',
  effort: 'Effort',
  effortOff: 'OFF',
  effortLow: 'Low',
  effortMedium: 'Medium',
  effortHigh: 'High',
  badgeOn: '🧠 ON',
  badgeOff: '🧠 OFF',
},

// Japanese (ja):
settingThinkMode: {
  title: 'Think モード',
  description: 'LLM プロバイダごとに Think モードを設定します。MD 読み上げ・AI 読み上げボタンに影響します。',
  currentProvider: '現在の LLM プロバイダ',
  providerClaude: 'Claude',
  providerDeepseek: 'DeepSeek',
  providerKimi: 'Kimi',
  providerMiniMax: 'MiniMax',
  providerZhipu: 'Zhipu (GLM)',
  enabled: 'Think モード',
  effort: 'エフォート',
  effortOff: 'OFF',
  effortLow: '低',
  effortMedium: '中',
  effortHigh: '高',
  badgeOn: '🧠 ON',
  badgeOff: '🧠 OFF',
},
```

- [ ] **Step 3: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS

- [ ] **Step 4: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/core/i18n.ts
git commit -m "feat(i18n): Think モード用のロケール文字列を追加 (v0.38.0, F-038)"
```

---

### Task 5: Add Think モード セクション to SettingTabGeneral

**Files:**
- Modify: `src/settings/SettingTabGeneral.ts`（render メソッドに新セクション追加）
- Test: `tests/settings/SettingTabGeneral.test.ts`（既存があれば追記）

**Interfaces:**
- Consumes: `ClaudianBridgeSettings.thinking`, `DEFAULT_THINKING_CONFIGS`, `readLlmInfoFromSettings()`, i18n keys
- Produces: UI セクション（プロバイダ別折りたたみ・トグル・スライダー）

- [ ] **Step 1: Write the failing test**

Create `tests/settings/SettingTabGeneral.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeClaudianBridgeSettings } from '../../src/core/settings';

describe('SettingTabGeneral.thinking セクションのデータ構造', () => {
  it('thinking 設定の型が正しい', () => {
    const settings = normalizeClaudianBridgeSettings({});
    expect(settings.thinking).toHaveProperty('claude');
    expect(settings.thinking).toHaveProperty('deepseek');
    expect(settings.thinking).toHaveProperty('kimi');
    expect(settings.thinking).toHaveProperty('minimax');
    expect(settings.thinking).toHaveProperty('zhipu');
  });
  
  it('各プロバイダの ThinkingConfig が enabled + effort を持つ', () => {
    const settings = normalizeClaudianBridgeSettings({});
    for (const provider of ['claude', 'deepseek', 'kimi', 'minimax', 'zhipu'] as const) {
      expect(settings.thinking[provider]).toHaveProperty('enabled');
      expect(settings.thinking[provider]).toHaveProperty('effort');
      expect(['off','low','medium','high']).toContain(settings.thinking[provider].effort);
    }
  });
  
  it('ユーザーが thinking を編集すると保存される（round-trip）', () => {
    const original = normalizeClaudianBridgeSettings({});
    const modified = {
      ...original,
      thinking: {
        ...original.thinking,
        deepseek: { enabled: true, effort: 'high' },
      },
    };
    const restored = normalizeClaudianBridgeSettings(modified);
    expect(restored.thinking.deepseek.enabled).toBe(true);
    expect(restored.thinking.deepseek.effort).toBe('high');
  });
  
  it('不正な effort は default でフォールバック', () => {
    const settings = normalizeClaudianBridgeSettings({
      thinking: {
        claude: { enabled: true, effort: 'invalid' as any },
        deepseek: { enabled: false, effort: 'low' },
        kimi: { enabled: false, effort: 'medium' },
        minimax: { enabled: false, effort: 'high' },
        zhipu: { enabled: false, effort: 'off' },
      },
    });
    expect(settings.thinking.claude.effort).toBe('medium');  // フォールバック
    expect(settings.thinking.deepseek.effort).toBe('low');
    expect(settings.thinking.zhipu.effort).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (data shape テストは既に Task 2 で実装済みなので PASS のはず)**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/settings/SettingTabGeneral.test.ts`
Expected: PASS（4 tests、Task 2 の normalize 実装で動く）

- [ ] **Step 3: Add Think モード section to SettingTabGeneral**

In `src/settings/SettingTabGeneral.ts`, find the end of `renderGeneral(containerEl)` and add before the closing:
```typescript
  // === v0.38.0 (F-038): Think モード セクション ===
  containerEl.createEl('h2', { text: getLocaleStrings().settingThinkMode.title });
  containerEl.createEl('p', {
    text: getLocaleStrings().settingThinkMode.description,
    cls: 'setting-item-description',
  });
  
  // 現在の LLM プロバイダ表示
  const llmInfo = readLlmInfoFromSettings(this.plugin.settings.quota.claudeSettingsPath);
  const providerLabel = getProviderLabel(llmInfo.provider);
  containerEl.createEl('div', {
    text: `${getLocaleStrings().settingThinkMode.currentProvider}: ${providerLabel}`,
    cls: 'setting-item-description',
  });
  
  // プロバイダ別ブロック
  const providers = ['claude', 'deepseek', 'kimi', 'minimax', 'zhipu'] as const;
  for (const provider of providers) {
    const details = containerEl.createEl('details');
    const summary = details.createEl('summary');
    summary.createEl('span', { text: getProviderName(provider) });
    summary.createEl('span', {
      text: this.plugin.settings.thinking[provider].enabled
        ? getLocaleStrings().settingThinkMode.badgeOn
        : getLocaleStrings().settingThinkMode.badgeOff,
      cls: this.plugin.settings.thinking[provider].enabled ? 'thinking-badge-on' : 'thinking-badge-off',
    });
    
    // Think モード ON/OFF トグル
    new Setting(details)
      .setName(getLocaleStrings().settingThinkMode.enabled)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.thinking[provider].enabled)
          .onChange(async (value) => {
            this.plugin.settings.thinking[provider].enabled = value;
            await this.plugin.saveSettings();
          }),
      );
    
    // エフォート dropdown
    new Setting(details)
      .setName(getLocaleStrings().settingThinkMode.effort)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('off', getLocaleStrings().settingThinkMode.effortOff)
          .addOption('low', getLocaleStrings().settingThinkMode.effortLow)
          .addOption('medium', getLocaleStrings().settingThinkMode.effortMedium)
          .addOption('high', getLocaleStrings().settingThinkMode.effortHigh)
          .setValue(this.plugin.settings.thinking[provider].effort)
          .onChange(async (value) => {
            const v = value as ThinkingEffort;
            this.plugin.settings.thinking[provider].effort = v;
            await this.plugin.saveSettings();
          }),
      );
  }
```

Also add helper functions at top of file:
```typescript
import type { ThinkingEffort } from '../features/llm/types';
import { readLlmInfoFromSettings, type LlmProviderId } from '../features/quota/llm-info';

type ThinkProviderKey = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu';

function getProviderName(p: ThinkProviderKey): string {
  const strings = getLocaleStrings().settingThinkMode;
  switch (p) {
    case 'claude':   return strings.providerClaude;
    case 'deepseek': return strings.providerDeepseek;
    case 'kimi':     return strings.providerKimi;
    case 'minimax':  return strings.providerMiniMax;
    case 'zhipu':    return strings.providerZhipu;
  }
}

function getProviderLabel(p: LlmProviderId): string {
  if (p === 'unknown') return 'unknown';
  return getProviderName(p);
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/settings/SettingTabGeneral.ts tests/settings/SettingTabGeneral.test.ts
git commit -m "feat(settings): SettingTabGeneral に Think モード セクションを追加 (v0.38.0, F-038)"
```

---

### Task 6: Update polishInstruction callers (input-ai-read-button.ts)

**Files:**
- Modify: `src/features/tts/input-ai-read-button.ts`（polishInstruction 呼び出しを置換）
- Modify: `src/features/tts/md-file-read-flow.ts`（同様）

**Interfaces:**
- Consumes: `createClaudeClient`, `readLlmInfoFromSettings`, `plugin.settings.thinking`
- Produces: dispatch 経由で client を取得し `client.runPrompt` を呼ぶ

- [ ] **Step 1: Add temporary dispatch stub**

Create `src/features/llm/dispatch.ts` (this will be expanded in Phase 2, but for now just Claude):
```typescript
import { readLlmInfoFromSettings, type LlmProviderId } from '../quota/llm-info';
import type { LlmClient, ThinkingConfig } from './types';
import { createClaudeClient } from './claude-cli';

/**
 * v0.38.0 (F-038): プロバイダ → LlmClient の解決。
 * v0.39.0 で他プロバイダの case を追加する。
 */
export function resolveLlmClient(
  provider: LlmProviderId,
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  switch (provider) {
    case 'claude':
      return createClaudeClient(thinking);
    case 'deepseek':
    case 'kimi':
    case 'minimax':
    case 'zhipu':
    case 'unknown':
    default:
      // v0.38.0 は Claude のみ。他は v0.39.0 で実装
      return createClaudeClient(thinking);
  }
}
```

- [ ] **Step 2: Update input-ai-read-button.ts**

Find the line:
```typescript
import { polishInstruction } from '../llm/claude-cli';
```
Replace with:
```typescript
import { resolveLlmClient } from '../llm/dispatch';
import { readLlmInfoFromSettings } from '../quota/llm-info';
```

Find the `polishInstruction` call and replace with:
```typescript
const llmInfo = readLlmInfoFromSettings(this.plugin.settings.quota.claudeSettingsPath);
const thinking = this.plugin.settings.thinking[llmInfo.provider];
const client = resolveLlmClient(llmInfo.provider, llmInfo.apiKey, thinking);
const result = await client.runPrompt(buildPolishPrompt(text), { thinking, signal });
```

- [ ] **Step 3: Update md-file-read-flow.ts**

Same pattern as Step 2 (replace direct `polishInstruction` call with dispatch).

- [ ] **Step 4: Run tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run`
Expected: All tests PASS（既存テスト含む）

- [ ] **Step 5: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS

- [ ] **Step 6: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/dispatch.ts src/features/tts/input-ai-read-button.ts src/features/tts/md-file-read-flow.ts
git commit -m "refactor(tts): polishInstruction 呼び出しを resolveLlmClient 経由に変更 (v0.38.0, F-038)"
```

---

### Task 7: Add 🧠 badge to quota/view.ts

**Files:**
- Modify: `src/features/quota/view.ts`（render メソッドに thinking badge 追加）

**Interfaces:**
- Consumes: `plugin.settings.thinking`, `getCurrentLlmProvider()`, i18n keys
- Produces: ステータスバー横に 🧠 ON/OFF バッジ表示

- [ ] **Step 1: Inspect current quota/view.ts render logic**

Run: `grep -n "setIcon\|createEl\|appendChild" src/features/quota/view.ts | head -20`
Expected: Show where the quota bar is rendered.

- [ ] **Step 2: Add thinking badge**

In the render method, after creating the quota display element, add:
```typescript
// === v0.38.0 (F-038): Think モード バッジ ===
const provider = getCurrentLlmProvider();
const thinking = this.plugin.settings.thinking[provider];
const badge = containerEl.createEl('span', {
  text: thinking.enabled
    ? getLocaleStrings().settingThinkMode.badgeOn
    : getLocaleStrings().settingThinkMode.badgeOff,
  cls: thinking.enabled ? 'thinking-badge-on' : 'thinking-badge-off',
});
badge.title = `${getLocaleStrings().settingThinkMode.enabled}: ${thinking.effort}`;
```

- [ ] **Step 3: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS

- [ ] **Step 4: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/quota/view.ts
git commit -m "feat(quota): ステータスバーに Think モード バッジ (🧠) を追加 (v0.38.0, F-038)"
```

---

### Task 8: Update docs and release notes for v0.38.0

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md`（v0.38.0 エントリ追加）
- Create: `RELEASE-NOTES-v0.38.0.md`
- Modify: `00_プロジェクト立項.md`（F-038 追加）

**Interfaces:**
- Consumes: （なし）
- Produces: リリースドキュメント一式

- [ ] **Step 1: Update CHANGELOG.md**

In `80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md`, add at top:
```markdown
## v0.38.0 (2026-09-XX)

### 新機能（F-038）

- **Think モード選択機能**：Claude / DeepSeek / Zhipu / MiniMax / Kimi ごとに Think モード（ON/OFF + エフォート low/medium/high）を設定タブで個別選択可能
- `LlmClient` インターフェース抽象化により将来の chat 系 API 呼び出しも同インターフェースで実装可能
- quota ステータスバーに 🧠 ON/OFF バッジを追加

### 変更

- `claude-cli.ts` に `createClaudeClient(thinking)` factory を追加（既存 `disableThinking` は deprecated）
- `polishInstruction` 呼び出しを `resolveLlmClient` 経由に変更

### 互換性

- 既存ユーザーの設定はそのまま動作（`normalizeClaudianBridgeSettings` が default 補完）
```

- [ ] **Step 2: Create RELEASE-NOTES-v0.38.0.md**

参照: 既存 `RELEASE-NOTES-v0.37.1.md` のテンプレ。
Create `RELEASE-NOTES-v0.38.0.md`:
```markdown
# ClaudianBridge v0.38.0 リリースノート

## 🎉 Think モード選択機能（F-038）

Claude / DeepSeek / Zhipu / MiniMax / Kimi ごとに Think モードを切り替え可能。

### 設定場所

設定 → ClaudianBridge → 一般 → Think モード

### 使い方

1. 各プロバイダの折りたたみを開く
2. 「Think モード」を ON にすると、そのプロバイダを使う整形時に拡張思考が有効化
3. エフォート（low / medium / high）で強度を調整

### 互換性

- 既存ユーザーの設定は自動引き継ぎ（Claude は Think ON、他プロバイダは OFF が default）
- 既存の `disableThinking` オプションは deprecated（次メジャーで削除予定）

### 既知の制限

- 初回リリース（v0.38.0）は Claude のみ動作。他プロバイダは v0.39.0 で実装
- MiniMax / Zhipu / Kimi の `reasoning_effort` パラメータサポートは v0.39.0 実装時に検証
```

- [ ] **Step 3: Update 00_プロジェクト立項.md F-038**

In the F-番号一覧 section, add:
```markdown
| F-038 | Think モード選択機能 | 2026-09-XX | v0.38.0 | Claude / DeepSeek / Zhipu / MiniMax / Kimi ごとの Think モード（ON/OFF + エフォート）設定 UI |
```

- [ ] **Step 4: Commit Vault docs**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault"
git add 80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md 80_POC_Projects/POC_017_ClaudianBridge/00_プロジェクト立項.md
git commit -m "docs(POC_017): CHANGELOG/プロジェクト立項に v0.38.0 / F-038 を追加"
```

Then import the new RELEASE-NOTES file:
```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault"
mkdir -p 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/
cp "D:/AI-Agent/ClaudianBridge/RELEASE-NOTES-v0.38.0.md" 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/
git add 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/RELEASE-NOTES-v0.38.0.md
git commit -m "docs(POC_017): RELEASE-NOTES-v0.38.0.md を追加"
```

- [ ] **Step 5: Tag v0.38.0**

After Phase 1 release build & deploy (out of scope of this plan), tag:
```bash
cd D:/AI-Agent/ClaudianBridge
git tag v0.38.0
git push origin v0.38.0
```

---

## Phase 2: 他プロバイダ（v0.39.0）

### Task 9: Add API key resolution for non-Claude providers

**Files:**
- Modify: `src/features/quota/llm-info.ts:1-55`（apiKey フィールド追加）
- Modify: `src/core/settings.ts:680-720`（normalize で apiKey 解決）
- Test: `tests/llm/llm-info.test.ts`

**Interfaces:**
- Consumes: `plugin.settings.quota`（apiKey フィールド）
- Produces: `LlmInfo.apiKey: string | undefined`（プロバイダ別 env 変数または settings から解決）

- [ ] **Step 1: Write the failing test**

Create `tests/llm/llm-info.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveApiKey, detectProviderFromBaseUrl } from '../../src/features/quota/llm-info';

describe('resolveApiKey', () => {
  it('provider=deepseek で settings.apiKey を返す', () => {
    const key = resolveApiKey('deepseek', { deepseekApiKey: 'sk-xxx' });
    expect(key).toBe('sk-xxx');
  });
  
  it('provider=zhipu で settings.zhipuApiKey を返す', () => {
    const key = resolveApiKey('zhipu', { zhipuApiKey: 'zai-xxx' });
    expect(key).toBe('zai-xxx');
  });
  
  it('provider=minimax で settings.minimaxApiKey を返す', () => {
    const key = resolveApiKey('minimax', { minimaxApiKey: 'mini-xxx' });
    expect(key).toBe('mini-xxx');
  });
  
  it('provider=kimi で settings.kimiApiKey を返す', () => {
    const key = resolveApiKey('kimi', { kimiApiKey: 'kimi-xxx' });
    expect(key).toBe('kimi-xxx');
  });
  
  it('空文字キーは undefined として扱う', () => {
    const key = resolveApiKey('deepseek', { deepseekApiKey: '' });
    expect(key).toBeUndefined();
  });
  
  it('provider=claude は undefined（ANTHROPIC_* を直接参照するため）', () => {
    const key = resolveApiKey('claude', { deepseekApiKey: 'sk-xxx' });
    expect(key).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/llm-info.test.ts`
Expected: FAIL with "resolveApiKey is not a function"

- [ ] **Step 3: Add resolveApiKey to llm-info.ts**

Append to `src/features/quota/llm-info.ts`:
```typescript
import type { ClaudianBridgeSettings } from '../../core/settings';

/**
 * v0.39.0 (F-039): プロバイダ別 API キーを settings から解決。
 * Claude は ANTHROPIC_* を settings.json から読むため undefined。
 */
export function resolveApiKey(
  provider: LlmProviderId,
  quotaSettings: Pick<ClaudianBridgeSettings['quota'], 'deepseekApiKey' | 'kimiApiKey' | 'minimaxApiKey' | 'zhipuApiKey'>,
): string | undefined {
  if (provider === 'claude' || provider === 'unknown') return undefined;
  const key = (() => {
    switch (provider) {
      case 'deepseek': return quotaSettings.deepseekApiKey;
      case 'kimi':     return quotaSettings.kimiApiKey;
      case 'minimax':  return quotaSettings.minimaxApiKey;
      case 'zhipu':    return quotaSettings.zhipuApiKey;
    }
  })();
  return key && key.trim() !== '' ? key : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/llm-info.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/quota/llm-info.ts tests/llm/llm-info.test.ts
git commit -m "feat(quota): resolveApiKey 関数を追加（プロバイダ別 API キー解決）"
```

---

### Task 10: Create deepseek-api.ts

**Files:**
- Create: `src/features/llm/deepseek-api.ts`
- Test: `tests/llm/deepseek-api.test.ts`

**Interfaces:**
- Consumes: `ThinkingConfig`, `apiKey`
- Produces: `createDeepSeekClient(apiKey, thinking): LlmClient`

- [ ] **Step 1: Write the failing test**

Create `tests/llm/deepseek-api.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeepSeekClient } from '../../src/features/llm/deepseek-api';

const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

function mockJsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createDeepSeekClient.runPrompt', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => fetchMock.mockReset());
  
  it('thinking.enabled=true で thinking.type=enabled と reasoning_effort=high を送る', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      choices: [{ message: { content: 'OK', reasoning_content: 'thinking...' } }],
    }));
    const client = createDeepSeekClient('sk-xxx', { enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });
    
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer sk-xxx' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBe('high');
  });
  
  it('thinking.enabled=false で thinking.type=disabled', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      choices: [{ message: { content: 'OK' } }],
    }));
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
  
  it('effort=medium は high にフォールバック（DeepSeek API 仕様）', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      choices: [{ message: { content: 'OK' } }],
    }));
    const client = createDeepSeekClient('sk-xxx', { enabled: true, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'medium' } });
    
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('high');
  });
  
  it('HTTP 401 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 401));
    const client = createDeepSeekClient('bad-key', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(result).toBeNull();
  });
  
  it('HTTP 500 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 500));
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(result).toBeNull();
  });
  
  it('response.content が空文字なら null', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      choices: [{ message: { content: '' } }],
    }));
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/deepseek-api.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement deepseek-api.ts**

Create `src/features/llm/deepseek-api.ts`:
```typescript
import type { LlmClient, ThinkingConfig, ThinkingEffort } from './types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/** DeepSeek の effort を API の reasoning_effort 値にマップ */
function mapEffort(effort: ThinkingEffort): 'low' | 'high' | 'max' {
  if (effort === 'low') return 'low';
  if (effort === 'high') return 'high';
  return 'high';  // medium, off → high フォールバック
}

/**
 * v0.39.0 (F-039): DeepSeek API 直接呼び出しクライアント。
 * thinking.type + reasoning_effort を body に付与。
 */
export function createDeepSeekClient(apiKey: string | undefined, thinking: ThinkingConfig): LlmClient {
  return {
    id: 'deepseek',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-deepseek-api] no api key');
        return null;
      }
      const controller = new AbortController();
      const timeoutMs = opts.timeoutMs ?? 30000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const body = {
          model: DEEPSEEK_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          thinking: { type: thinking.enabled ? 'enabled' : 'disabled' },
          reasoning_effort: mapEffort(thinking.effort),
        };
        const res = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-deepseek-api] HTTP ${res.status}`);
          return null;
        }
        const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-deepseek-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/deepseek-api.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/deepseek-api.ts tests/llm/deepseek-api.test.ts
git commit -m "feat(llm): DeepSeek API 直接呼び出しクライアントを追加 (v0.39.0, F-039)"
```

---

### Task 11: Create zhipu-api.ts, minimax-api.ts, kimi-api.ts

**Files:**
- Create: `src/features/llm/zhipu-api.ts`
- Create: `src/features/llm/minimax-api.ts`
- Create: `src/features/llm/kimi-api.ts`
- Create: `tests/llm/zhipu-api.test.ts`
- Create: `tests/llm/minimax-api.test.ts`
- Create: `tests/llm/kimi-api.test.ts`

**Interfaces:**
- Same pattern as Task 10, each with their own base URL and effort mapping

- [ ] **Step 1: Create zhipu-api.ts**

Create `src/features/llm/zhipu-api.ts`:
```typescript
import type { LlmClient, ThinkingConfig } from './types';

const ZHIPU_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZHIPU_DEFAULT_MODEL = 'glm-4.5';

/** v0.39.0 (F-039): Zhipu (GLM-4.5) クライアント。thinking.type のみ。 */
export function createZhipuClient(apiKey: string | undefined, thinking: ThinkingConfig): LlmClient {
  return {
    id: 'zhipu',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-zhipu-api] no api key');
        return null;
      }
      const controller = new AbortController();
      const timeoutMs = opts.timeoutMs ?? 30000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const body = {
          model: ZHIPU_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          thinking: { type: thinking.enabled ? 'enabled' : 'disabled' },
        };
        const res = await fetch(ZHIPU_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-zhipu-api] HTTP ${res.status}`);
          return null;
        }
        const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-zhipu-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

- [ ] **Step 2: Write zhipu-api.test.ts**

Create `tests/llm/zhipu-api.test.ts`（Task 10 の deepseek-api.test.ts と同パターン。5 テスト: enabled/disabled, 401, 500, empty content, abort）。

- [ ] **Step 3: Run zhipu-api tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/zhipu-api.test.ts`
Expected: PASS

- [ ] **Step 4: Create minimax-api.ts**

Create `src/features/llm/minimax-api.ts`:
```typescript
import type { LlmClient, ThinkingConfig, ThinkingEffort } from './types';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const MINIMAX_DEFAULT_MODEL = 'minimax-text-01';

/** effort → thinking.type 値にマップ。minimax は reasoning_effort 非対応 */
function mapType(enabled: boolean, effort: ThinkingEffort): 'enabled' | 'adaptive' | 'disabled' {
  if (!enabled) return 'disabled';
  if (effort === 'low') return 'enabled';  // low でも enabled
  if (effort === 'medium') return 'adaptive';  // medium → adaptive に委ねる
  return 'enabled';  // high
}

/** v0.39.0 (F-039): MiniMax クライアント。thinking.type (enabled/adaptive/disabled) */
export function createMiniMaxClient(apiKey: string | undefined, thinking: ThinkingConfig): LlmClient {
  // ... deepseek と同様の構造（body に model + messages + thinking）
  // thinking.type = mapType(thinking.enabled, thinking.effort)
}
```

- [ ] **Step 5: Write minimax-api.test.ts**

5 テスト (enabled/disabled, adaptive=medium, 401, 500, empty content)。

- [ ] **Step 6: Run minimax-api tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/minimax-api.test.ts`
Expected: PASS

- [ ] **Step 7: Create kimi-api.ts**

Create `src/features/llm/kimi-api.ts`:
```typescript
import type { LlmClient, ThinkingConfig, ThinkingEffort } from './types';

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-128k';

function mapEffort(effort: ThinkingEffort): string {
  // Moonshot/Kimi の thinking 制御パラメータは未確定。low/medium/high をそのまま送る。
  return effort === 'off' ? 'low' : effort;
}

/** v0.39.0 (F-039): Kimi (Moonshot) クライアント。thinking.type + reasoning_effort */
export function createKimiClient(apiKey: string | undefined, thinking: ThinkingConfig): LlmClient {
  // ... 同様
}
```

- [ ] **Step 8: Write kimi-api.test.ts** & run

4 テスト (enabled/disabled, 401, 500).

- [ ] **Step 9: Commit all three**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/zhipu-api.ts src/features/llm/minimax-api.ts src/features/llm/kimi-api.ts
git add tests/llm/zhipu-api.test.ts tests/llm/minimax-api.test.ts tests/llm/kimi-api.test.ts
git commit -m "feat(llm): Zhipu / MiniMax / Kimi の API 直接呼び出しクライアントを追加 (v0.39.0, F-039)"
```

---

### Task 12: Update dispatch.ts with non-Claude providers

**Files:**
- Modify: `src/features/llm/dispatch.ts`（switch case 追加）
- Test: `tests/llm/dispatch.test.ts`

**Interfaces:**
- Consumes: `resolveApiKey`, `createDeepSeekClient`, `createZhipuClient`, `createMiniMaxClient`, `createKimiClient`
- Produces: 完全な `resolveLlmClient` 実装

- [ ] **Step 1: Write the failing test**

Create `tests/llm/dispatch.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveLlmClient } from '../../src/features/llm/dispatch';

describe('resolveLlmClient', () => {
  it('provider=claude で createClaudeClient を返す', () => {
    const client = resolveLlmClient('claude', undefined, { enabled: true, effort: 'medium' });
    expect(client.id).toBe('claude');
  });
  
  it('provider=deepseek で createDeepSeekClient を返す', () => {
    const client = resolveLlmClient('deepseek', 'sk-xxx', { enabled: true, effort: 'high' });
    expect(client.id).toBe('deepseek');
  });
  
  it('provider=zhipu で createZhipuClient を返す', () => {
    const client = resolveLlmClient('zhipu', 'zai-xxx', { enabled: false, effort: 'medium' });
    expect(client.id).toBe('zhipu');
  });
  
  it('provider=minimax で createMiniMaxClient を返す', () => {
    const client = resolveLlmClient('minimax', 'mini-xxx', { enabled: true, effort: 'low' });
    expect(client.id).toBe('minimax');
  });
  
  it('provider=kimi で createKimiClient を返す', () => {
    const client = resolveLlmClient('kimi', 'kimi-xxx', { enabled: true, effort: 'medium' });
    expect(client.id).toBe('kimi');
  });
  
  it('provider=unknown は Claude にフォールバック', () => {
    const client = resolveLlmClient('unknown', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
  });
});
```

- [ ] **Step 2: Run test to verify partial pass (existing dispatch only has Claude)**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/dispatch.test.ts`
Expected: PASS for 'claude' and 'unknown', FAIL for others

- [ ] **Step 3: Update dispatch.ts**

Replace `src/features/llm/dispatch.ts`:
```typescript
import { readLlmInfoFromSettings, type LlmProviderId } from '../quota/llm-info';
import type { LlmClient, ThinkingConfig } from './types';
import { createClaudeClient } from './claude-cli';
import { createDeepSeekClient } from './deepseek-api';
import { createZhipuClient } from './zhipu-api';
import { createMiniMaxClient } from './minimax-api';
import { createKimiClient } from './kimi-api';

/**
 * v0.39.0 (F-039): プロバイダ → LlmClient の解決。
 */
export function resolveLlmClient(
  provider: LlmProviderId,
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  switch (provider) {
    case 'deepseek': return createDeepSeekClient(apiKey, thinking);
    case 'zhipu':    return createZhipuClient(apiKey, thinking);
    case 'minimax':  return createMiniMaxClient(apiKey, thinking);
    case 'kimi':     return createKimiClient(apiKey, thinking);
    case 'claude':   return createClaudeClient(thinking);
    case 'unknown':
    default:         return createClaudeClient(thinking);  // フォールバック
  }
}
```

- [ ] **Step 4: Run test to verify all pass**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/llm/dispatch.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/llm/dispatch.ts tests/llm/dispatch.test.ts
git commit -m "feat(llm): dispatch.ts に 4 プロバイダを追加 (v0.39.0, F-039)"
```

---

### Task 13: Update polishInstruction callers with apiKey

**Files:**
- Modify: `src/features/tts/input-ai-read-button.ts`
- Modify: `src/features/tts/md-file-read-flow.ts`

**Interfaces:**
- Consumes: `resolveApiKey`, `resolveLlmClient`
- Produces: apiKey を含む完全な呼び出し

- [ ] **Step 1: Update input-ai-read-button.ts**

Replace the resolveLlmClient call site:
```typescript
const llmInfo = readLlmInfoFromSettings(this.plugin.settings.quota.claudeSettingsPath);
const thinking = this.plugin.settings.thinking[llmInfo.provider];
const apiKey = resolveApiKey(llmInfo.provider, this.plugin.settings.quota);
const client = resolveLlmClient(llmInfo.provider, apiKey, thinking);
const result = await client.runPrompt(buildPolishPrompt(text), { thinking, signal });
```

- [ ] **Step 2: Update md-file-read-flow.ts**

Same pattern.

- [ ] **Step 3: Run all tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: typecheck PASS

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/features/tts/input-ai-read-button.ts src/features/tts/md-file-read-flow.ts
git commit -m "refactor(tts): polishInstruction 呼び出しに apiKey を追加 (v0.39.0, F-039)"
```

---

### Task 14: Update docs and release notes for v0.39.0

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md`（v0.39.0 エントリ追加）
- Create: `RELEASE-NOTES-v0.39.0.md`
- Modify: `00_プロジェクト立項.md`（F-039 追加）

**Interfaces:**
- Consumes: （なし）
- Produces: リリースドキュメント一式

- [ ] **Step 1: Update CHANGELOG.md**

Add v0.39.0 entry（同 v0.38.0 パターン）

- [ ] **Step 2: Create RELEASE-NOTES-v0.39.0.md**

主要内容:
- DeepSeek / Zhipu / MiniMax / Kimi でも Think モードが選択可能に
- `LlmClient` 抽象化により将来 chat 系 API も実装可能

- [ ] **Step 3: Update 00_プロジェクト立項.md**

Add F-039 row.

- [ ] **Step 4: Commit Vault docs**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault"
git add 80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md 80_POC_Projects/POC_017_ClaudianBridge/00_プロジェクト立項.md 80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/RELEASE-NOTES-v0.39.0.md
git commit -m "docs(POC_017): CHANGELOG/プロジェクト立項に v0.39.0 / F-039 を追加"
```

- [ ] **Step 5: Tag v0.39.0** (after build & deploy)

```bash
cd D:/AI-Agent/ClaudianBridge
git tag v0.39.0
git push origin v0.39.0
```

---

## 受入テスト（UAT）チェックリスト

両フェーズ完了後に Obsidian 実機で確認：

- [ ] 設定タブで各プロバイダの ON/OFF トグルが動く
- [ ] エフォートスライダー変更で data.json に保存される
- [ ] Claude 利用中に OFF → 整形が体感高速化
- [ ] DeepSeek 利用中に ON → API リクエストに `thinking.type=enabled` が含まれる（DevTools で確認）
- [ ] Zhipu 利用中に OFF → `thinking.type=disabled`
- [ ] MiniMax 利用中に adaptive (medium) → `thinking.type=adaptive`
- [ ] Kimi 利用中に ON → `thinking.type=enabled`
- [ ] 既存挙動（OFF デフォルト）との後方互換性
- [ ] quota ステータスバーに 🧠 バッジ表示
- [ ] `npm run build` で typecheck PASS
- [ ] 全テスト（1006+44 = **1050 件**）PASS
- [ ] Vault デプロイ後、Obsidian でプラグイン再起動して動作確認

---

## ロールバック計画

| 状況 | 対応 |
|------|------|
| Phase 1 (v0.38.0) で重大バグ | `disableThinking` 旧 API に切替可能なフラグを内部に持つ（v0.37.1 互換） |
| Phase 2 (v0.39.0) で特定プロバイダ不具合 | `settings.thinking.<provider>.enabled = false` で個別 OFF |
| 全体ロールバック | `git revert <Phase-2-tag>` + ホットフィックスブランチで復旧 |
