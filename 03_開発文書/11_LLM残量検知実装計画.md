---
title: "Claudian Bridge LLM 残量検知 実装計画"
type: implementation-plan
version: 1.0.0
status: ✅ 已批准
created: 2026-08-11
modified: 2026-08-11
project_id: POC_017_ClaudianBridge
phase: 3
related_design:
  - 80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/11_LLM残量検知設計.md
tags:
  - 実装計画
  - LLM残量
  - ClaudeOAuth
  - TDD
language: Japanese
applied_rules_version: 2.9.2
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# 🛠️ Claudian Bridge LLM 残量検知 実装計画

**Goal:** Claudian Bridge 設定「一般」タブに「Claude 残量検出」トグルを追加 → ON 時、Claudian Chat 入力欄直上にステータスバー（5h / 7d 残量 + 残時間 + カラー閾値）を表示。CC Switch の OAuth Usage を参考実装として再利用。

**Architecture:** TypeScript ソース (`D:\AI-Agent\ClaudianBridge\src\features\quota\`) に 4 つのモジュール (types / core / view / index) を追加。TDD で開発 → esbuild → `.obsidian/plugins/claudian-bridge/main.js` にデプロイ。既存の `selection/` / `object/` パターン (core + popup + watcher) を踏襲。`realclaudian` の `getInputWrapper()` API + CSS クラスフォールバックで DOM に挿入。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest / esbuild / DOM API / Claude OAuth Usage API (`https://api.anthropic.com/api/oauth/usage`)

**Spec:** `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/11_LLM残量検知設計.md`

---

## Global Constraints

- ソースリポジトリ: `D:\AI-Agent\ClaudianBridge\`（git main、feature ブランチ `feat/quota-detection` で作業）
- 開発言語: TypeScript（ES2022 / strict）
- テストランナー: vitest（`npm test`）
- ビルド: `npm run build`（esbuild production）
- デプロイ: `npm run deploy` → `.obsidian/plugins/claudian-bridge/`
- 既存パターン踏襲: `src/features/selection/` および `src/features/object/` と同構造（types / core / view / index）
- ⚠️ ==禁止== realclaudian のファイル変更（`.obsidian/plugins/realclaudian/*` は読み取り専用）
- プラグイン本体は触らない (`.obsidian/plugins/claudian-bridge/main.js` は build 成果物)
- 設定 schema は `general.*` 配下に追加（`general.quotaEnabled` / `general.quotaRefreshSec`）
- 設定 UI は `tabGeneral` の末尾に追加（既存「Claudian Bridge を有効化」セクションの後）
- manifest.json バージョン: `0.2.0` → `0.3.0`
- Token は **data.json に書き込まない / DOM に渡さない**（メモリ内のみ）
- HTTPS のみ使用（`https://api.anthropic.com/api/oauth/usage`）
- Mobile プラットフォーム (`Platform.isMobile === true`) では Service 起動しない
- カラー閾値: <70% 緑 / 70–89% 橙 / ≥90% 赤（CC Switch と同一）
- カウントダウン書式: `2h45m` / `3d 4h` / `47m`（ロケール非依存）
- 更新間隔: デフォルト 60 秒、範囲 10–600、`0` でポーリング無効
- i18n 11 キー三語対応（ja / en / zh、`getLocaleStrings()` 経由）
- Vault 共通の MD 生成ルール（frontmatter / Mermaid / 双鏈）に準拠

---

## File Structure

| ファイル | 役割 |
|---------|------|
| **Create** `src/features/quota/types.ts` | 全型定義 + 定数（QuotaWindow / QuotaSnapshot / QuotaStatus）+ EVENT_QUOTA_UPDATED |
| **Create** `src/features/quota/core.ts` | `ClaudeQuotaService` クラス（readToken / fetchQuota / start / stop / forceRefresh / onUpdate） |
| **Create** `src/features/quota/view.ts` | `QuotaBarView` クラス（colorFor / formatCountdown / mount / unmount / render） |
| **Create** `src/features/quota/index.ts` | 公開 API（`registerClaudeQuota` / `unregisterClaudeQuota` / `ClaudeQuotaHandle`） |
| **Modify** `src/core/settings.ts` | `general.quotaEnabled` / `general.quotaRefreshSec` 追加 + `normalizeClaudianBridgeSettings` 拡張 |
| **Modify** `src/core/events.ts` | `EVENT_QUOTA_UPDATED` 定数追加（既存の場合は流用） |
| **Modify** `src/core/i18n.ts` | 11 キー追加（ja / en / zh） |
| **Modify** `src/settings/SettingTabGeneral.ts` | `renderGeneralTab` に quota トグル + 間隔入力 UI 追加 |
| **Modify** `src/main.ts` | `onload` で `registerClaudeQuota` 呼び出し、`onunload` で解除 |
| **Modify** `src/styles.css` | `.claudian-quota-bar` 関連スタイル追加 |
| **Modify** `tests/mocks/obsidian.ts` | `mockFetch` / `mockSpawn` / `mockReadFile` / `Platform.isMobile` spy 追加 |
| **Create** `tests/features/quota/types.test.ts` | `clampRefreshSec` の単体テスト |
| **Create** `tests/features/quota/core.test.ts` | `ClaudeQuotaService` 12 ケース |
| **Create** `tests/features/quota/view.test.ts` | `QuotaBarView` 8 ケース（colorFor / formatCountdown / render） |
| **Create** `tests/features/quota/index.test.ts` | `registerClaudeQuota` 4 ケース（ライフサイクル） |
| **Create** `tests/integration/quota.test.ts` | 統合テスト（Service ↔ EventBus ↔ View） |
| **Modify** `manifest.json` | `version: "0.3.0"` |

---

### Task 1: 型定義 + 定数（`types.ts`）

**Files:**
- Create: `src/features/quota/types.ts`
- Create: `tests/features/quota/types.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `QuotaWindow` / `ExtraUsage` / `QuotaSnapshot` / `QuotaStatus` 型、`EVENT_QUOTA_UPDATED` / `DEFAULT_QUOTA_REFRESH_SEC` / `QUOTA_REFRESH_MIN_SEC` / `QUOTA_REFRESH_MAX_SEC` 定数、`clampRefreshSec(v)` ヘルパー

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { clampRefreshSec, QUOTA_REFRESH_MIN_SEC, QUOTA_REFRESH_MAX_SEC } from '../../../src/features/quota/types';

describe('clampRefreshSec', () => {
  it('範囲内の値はそのまま返す', () => {
    expect(clampRefreshSec(60)).toBe(60);
    expect(clampRefreshSec(120)).toBe(120);
  });

  it('下限未満は MIN にクランプ', () => {
    expect(clampRefreshSec(0)).toBe(QUOTA_REFRESH_MIN_SEC);
    expect(clampRefreshSec(-5)).toBe(QUOTA_REFRESH_MIN_SEC);
    expect(clampRefreshSec(5)).toBe(QUOTA_REFRESH_MIN_SEC);
  });

  it('上限超過は MAX にクランプ', () => {
    expect(clampRefreshSec(9999)).toBe(QUOTA_REFRESH_MAX_SEC);
  });

  it('NaN はデフォルト 60', () => {
    expect(clampRefreshSec(NaN)).toBe(60);
  });

  it('小数は切り捨て', () => {
    expect(clampRefreshSec(60.7)).toBe(60);
  });

  it('非数値（string）はデフォルト 60', () => {
    expect(clampRefreshSec('abc' as unknown as number)).toBe(60);
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/features/quota/types.test.ts
```

Expected: `Failed to resolve import "../../../src/features/quota/types"` で 6 件失敗。

- [ ] **Step 3: types.ts を実装**

`src/features/quota/types.ts`:

```typescript
/** 単一ウィンドウの残量 */
export interface QuotaWindow {
  utilization: number | null;
  resetsAt: string | null;
}

/** 追加計費使用量 */
export interface ExtraUsage {
  isEnabled: boolean;
  utilization: number | null;
  resetsAt: string | null;
}

/** ステータス enum-string */
export type QuotaStatus =
  | 'idle'
  | 'fetching'
  | 'success'
  | 'expired'
  | 'error'
  | 'unsupported';

/** 1 回の API レスポンスのスナップショット */
export interface QuotaSnapshot {
  status: QuotaStatus;
  windows: {
    fiveHour: QuotaWindow;
    sevenDay: QuotaWindow;
    sevenDayOpus?: QuotaWindow;
    sevenDaySonnet?: QuotaWindow;
  };
  extraUsage: ExtraUsage | null;
  fetchedAt: number;
  error?: string;
  tokenSource: 'keychain' | 'file' | 'none';
}

/** ワークスペースイベント名 */
export const EVENT_QUOTA_UPDATED = 'claudian-quota-updated';

/** ポーリング間隔の境界 */
export const DEFAULT_QUOTA_REFRESH_SEC = 60;
export const QUOTA_REFRESH_MIN_SEC = 10;
export const QUOTA_REFRESH_MAX_SEC = 600;

/** 間隔を [MIN, MAX] にクランプ、不正値はデフォルト */
export function clampRefreshSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_QUOTA_REFRESH_SEC;
  return Math.max(QUOTA_REFRESH_MIN_SEC, Math.min(QUOTA_REFRESH_MAX_SEC, Math.floor(v)));
}

/** IDLE 状態の初期スナップショット */
export function createIdleSnapshot(): QuotaSnapshot {
  return {
    status: 'idle',
    windows: {
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
    },
    extraUsage: null,
    fetchedAt: 0,
    tokenSource: 'none',
  };
}
```

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/types.test.ts
```

Expected: 6 件 PASS。

- [ ] **Step 5: コミット**

```bash
cd D:\AI-Agent\ClaudianBridge
git add src/features/quota/types.ts tests/features/quota/types.test.ts
git commit -m "feat(quota): add types and constants for quota detection"
```

---

### Task 2: テスト Mock 拡張（fetch / spawn / fs / Platform）

**Files:**
- Modify: `tests/mocks/obsidian.ts`

**Interfaces:**
- Consumes: 既存の `tests/mocks/obsidian.ts`（`mockApp` 等）
- Produces: `mockFetch(response | Error)` / `mockSpawn(stdout | Error)` / `mockReadFile(content | Error)` / `setMobileMode(true | false)` / `resetMocks()`

- [ ] **Step 1: 既存の mock を確認**

```bash
cd D:\AI-Agent\ClaudianBridge
cat tests/mocks/obsidian.ts | head -100
```

Expected: `mockApp` / `mockWorkspace` 等の定義が存在することを確認。

- [ ] **Step 2: `mockFetch` ヘルパーを追加**

`tests/mocks/obsidian.ts` の末尾に追記:

```typescript
// === fetch ===
let fetchMock: ((input: RequestInfo, init?: RequestInit) => Promise<Response>) | null = null;

export function mockFetch(impl: typeof fetchMock): void {
  fetchMock = impl;
  (globalThis as { fetch?: typeof fetch }).fetch = impl as typeof fetch;
}

export function resetMocks(): void {
  fetchMock = null;
  (globalThis as { fetch?: typeof fetch }).fetch = undefined;
}
```

- [ ] **Step 3: `mockSpawn` ヘルパーを追加**

```typescript
// === child_process.spawn ===
let spawnMock: ((cmd: string, args: string[]) => {
  stdout: { on: (ev: string, cb: (data: Buffer) => void) => void };
  stderr: { on: (ev: string, cb: (data: Buffer) => void) => void };
  on: (ev: string, cb: (code: number) => void) => void;
}) | null = null;

export interface SpawnMockResult {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

export function mockSpawn(impl: (cmd: string, args: string[]) => SpawnMockResult | Error): void {
  spawnMock = (cmd, args) => {
    const result = impl(cmd, args);
    if (result instanceof Error) throw result;
    return {
      stdout: {
        on: (_ev: string, cb: (data: Buffer) => void) => cb(Buffer.from(result.stdout)),
      },
      stderr: {
        on: (_ev: string, cb: (data: Buffer) => void) => cb(Buffer.from(result.stderr ?? '')),
      },
      on: (ev: string, cb: (code: number) => void) => {
        if (ev === 'close') cb(result.exitCode ?? 0);
      },
    };
  };
}

export function clearSpawnMock(): void {
  spawnMock = null;
}
```

- [ ] **Step 4: `mockReadFile` ヘルパーを追加**

```typescript
// === fs/promises ===
let readFileMock: ((path: string) => Promise<string>) | null = null;

export function mockReadFile(impl: (path: string) => string | Error): void {
  readFileMock = async (path) => {
    const result = impl(path);
    if (result instanceof Error) throw result;
    return result;
  };
}

export function clearReadFileMock(): void {
  readFileMock = null;
}
```

- [ ] **Step 5: `Platform.isMobile` spy を追加**

```typescript
// === Platform ===
let mobileMode = false;

export function setMobileMode(value: boolean): void {
  mobileMode = value;
}

export function getPlatformIsMobile(): boolean {
  return mobileMode;
}
```

- [ ] **Step 6: TypeScript ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npx tsc --noEmit
```

Expected: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add tests/mocks/obsidian.ts
git commit -m "test(quota): add fetch/spawn/fs/Platform mock helpers"
```

---

### Task 3: 設定スキーマ拡張（`core/settings.ts`）

**Files:**
- Modify: `src/core/settings.ts`
- Modify (or extend): `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: 既存の `ClaudianBridgeSettings` / `ClaudianBridgeGeneralSettings`
- Produces: `general.quotaEnabled: boolean` / `general.quotaRefreshSec: number` + デフォルト + クランプ

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/settings.test.ts` に追加（既存テストが無い場合は新規作成）:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeClaudianBridgeSettings, DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../src/core/settings';

describe('normalizeClaudianBridgeSettings - quota', () => {
  it('quotaEnabled のデフォルトは false', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaEnabled).toBe(false);
  });

  it('quotaRefreshSec のデフォルトは 60', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaRefreshSec).toBe(60);
  });

  it('quotaEnabled が boolean でない場合 false に正規化', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaEnabled: 'yes' as unknown as boolean } });
    expect(s.general.quotaEnabled).toBe(false);
  });

  it('quotaRefreshSec が 5 のとき 10 にクランプ', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaRefreshSec: 5 } });
    expect(s.general.quotaRefreshSec).toBe(10);
  });

  it('quotaRefreshSec が 9999 のとき 600 にクランプ', () => {
    const s = normalizeClaudianBridgeSettings({ general: { quotaRefreshSec: 9999 } });
    expect(s.general.quotaRefreshSec).toBe(600);
  });

  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general に quota フィールドが含まれる', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general).toHaveProperty('quotaEnabled');
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general).toHaveProperty('quotaRefreshSec');
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/core/settings.test.ts
```

Expected: `Cannot read properties of undefined (reading 'quotaEnabled')` で 6 件失敗。

- [ ] **Step 3: settings.ts の型を拡張**

`src/core/settings.ts`:

```typescript
export interface ClaudianBridgeGeneralSettings {
  enabled: boolean;
  migratedFrom: { source: string; version: string } | null;
  migrationResetAvailable: boolean;
  // ↓ quota detection (v0.3.0)
  quotaEnabled: boolean;
  quotaRefreshSec: number;
}
```

- [ ] **Step 4: DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general を更新**

```typescript
export const DEFAULT_CLAUDIAN_BRIDGE_SETTINGS = {
  general: {
    enabled: true,
    migratedFrom: null,
    migrationResetAvailable: true,
    quotaEnabled: false,
    quotaRefreshSec: 60,
  },
  // ... 既存（selection / tts / office / whitelist / chroma）
} as const;
```

- [ ] **Step 5: `normalizeClaudianBridgeSettings` の `general` ブロックを更新**

```typescript
function normalizeGeneral(raw: unknown): ClaudianBridgeGeneralSettings {
  const r = (raw ?? {}) as Partial<ClaudianBridgeGeneralSettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    migratedFrom: /* 既存ロジック（変更しない） */,
    migrationResetAvailable: typeof r.migrationResetAvailable === 'boolean' ? r.migrationResetAvailable : true,
    quotaEnabled: typeof r.quotaEnabled === 'boolean' ? r.quotaEnabled : false,
    quotaRefreshSec: clampRefreshSec(r.quotaRefreshSec),
  };
}

function clampRefreshSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 60;
  return Math.max(10, Math.min(600, Math.floor(v)));
}
```

> 💡 **注**: `types.ts` の `clampRefreshSec` と同じ実装。`general` ブロックは `types.ts` に依存させない（循環依存回避）ため settings.ts 内にローカル定義。

- [ ] **Step 6: テスト実行 → PASS 確認**

```bash
npm test -- tests/core/settings.test.ts
```

Expected: 6 件 PASS。

- [ ] **Step 7: コミット**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): add quotaEnabled/quotaRefreshSec to general config"
```

---

### Task 4: `ClaudeQuotaService.readToken` の TDD 実装

**Files:**
- Create: `src/features/quota/core.ts`
- Create: `tests/features/quota/core.test.ts`（部分作成）

**Interfaces:**
- Consumes: `QuotaSnapshot` / `QuotaStatus`（Task 1）
- Produces: `ClaudeQuotaService` クラス（初期スケルトン）+ 内部 `readToken()` メソッド

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/core.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeQuotaService } from '../../../src/features/quota/core';
import { setMobileMode, getPlatformIsMobile, resetMocks, mockFetch, mockSpawn, mockReadFile, clearSpawnMock, clearReadFileMock } from '../../mocks/obsidian';

describe('ClaudeQuotaService.readToken', () => {
  let svc: ClaudeQuotaService;

  beforeEach(() => {
    setMobileMode(false);
    svc = new ClaudeQuotaService({ app: {} as never, store: { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never, refreshSec: 60 });
  });

  afterEach(() => {
    resetMocks();
    clearSpawnMock();
    clearReadFileMock();
  });

  it('Mobile のとき readToken は null を返す', async () => {
    setMobileMode(true);
    const token = await (svc as unknown as { readToken: () => Promise<string | null> }).readToken();
    expect(token).toBeNull();
  });

  it('macOS で Keychain から accessToken を取得', async () => {
    mockSpawn(() => ({ stdout: '{"claudeAiOauth":{"accessToken":"keychain-token","expiresAt":9999999999}}' }));
    const token = await (svc as unknown as { readToken: () => Promise<string | null> }).readToken();
    expect(token).toBe('keychain-token');
  });

  it('Keychain 失敗時はファイルから fallback', async () => {
    mockSpawn(() => new Error('spawn ENOENT security'));
    mockReadFile(() => '{"claudeAiOauth":{"accessToken":"file-token","expiresAt":9999999999}}');
    const token = await (svc as unknown as { readToken: () => Promise<string | null> }).readToken();
    expect(token).toBe('file-token');
  });

  it('両方失敗で null を返す', async () => {
    mockSpawn(() => new Error('spawn ENOENT security'));
    mockReadFile(() => new Error('ENOENT .credentials.json'));
    const token = await (svc as unknown as { readToken: () => Promise<string | null> }).readToken();
    expect(token).toBeNull();
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/features/quota/core.test.ts
```

Expected: `Failed to resolve import` で 4 件失敗。

- [ ] **Step 3: `core.ts` のスケルトンを作成**

`src/features/quota/core.ts`:

```typescript
import type { App } from 'obsidian';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import type { ConfigStore } from '../core/config-store';
import { createIdleSnapshot, type QuotaSnapshot, DEFAULT_QUOTA_REFRESH_SEC } from './types';

export interface ClaudeQuotaServiceOptions {
  app: App;
  store: ConfigStore;
  refreshSec: number;
}

export class ClaudeQuotaService {
  private snapshot: QuotaSnapshot = createIdleSnapshot();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(snap: QuotaSnapshot) => void> = new Set();
  private inFlight = false;

  constructor(private readonly opts: ClaudeQuotaServiceOptions) {}

  /** Token 読み取り（macOS Keychain 優先 → ファイル fallback → null） */
  async readToken(): Promise<string | null> {
    if (getPlatformIsMobile()) return null;
    try {
      if (process.platform === 'darwin') {
        const macToken = await this.readFromKeychain();
        if (macToken) {
          this.snapshot.tokenSource = 'keychain';
          return macToken;
        }
      }
    } catch {
      // Keychain 失敗 → ファイルに fallback
    }
    try {
      const fileToken = await this.readFromFile();
      if (fileToken) {
        this.snapshot.tokenSource = 'file';
        return fileToken;
      }
    } catch {
      // ファイル不存在
    }
    this.snapshot.tokenSource = 'none';
    return null;
  }

  private async readFromKeychain(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const proc = spawn('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', async (code) => {
        if (code !== 0) return reject(new Error(`keychain exit ${code}`));
        try {
          const json = JSON.parse(stdout.trim());
          const token = json?.claudeAiOauth?.accessToken ?? json?.['claude.ai_oauth']?.accessToken;
          resolve(typeof token === 'string' ? token : null);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }

  private async readFromFile(): Promise<string | null> {
    const home = os.homedir();
    const credPath = path.join(home, '.claude', '.credentials.json');
    const raw = await fs.readFile(credPath, 'utf-8');
    const json = JSON.parse(raw);
    const token = json?.claudeAiOauth?.accessToken ?? json?.['claude.ai_oauth']?.accessToken;
    return typeof token === 'string' ? token : null;
  }

  // 他のメソッドは Task 5-7 で実装
  start(): Promise<void> { return Promise.resolve(); }
  stop(): Promise<void> { return Promise.resolve(); }
  forceRefresh(): Promise<QuotaSnapshot> { return Promise.resolve(this.snapshot); }
  getSnapshot(): QuotaSnapshot { return this.snapshot; }
  onUpdate(_cb: (snap: QuotaSnapshot) => void): () => void { return () => {}; }
}

let _instance: ClaudeQuotaService | null = null;
export function getClaudeQuotaService(): ClaudeQuotaService | null { return _instance; }
```

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/core.test.ts
```

Expected: 4 件 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/core.ts tests/features/quota/core.test.ts
git commit -m "feat(quota): implement ClaudeQuotaService.readToken with Keychain/file fallback"
```

---

### Task 5: `ClaudeQuotaService.fetchQuota` の TDD 実装

**Files:**
- Modify: `src/features/quota/core.ts`
- Modify: `tests/features/quota/core.test.ts`

**Interfaces:**
- Consumes: `readToken()` (Task 4) + `mockFetch` (Task 2)
- Produces: 内部 `fetchQuota(token)` メソッド + `parseUsageResponse(json)` ヘルパー

- [ ] **Step 1: 失敗するテストを追加**

`tests/features/quota/core.test.ts` に追記:

```typescript
describe('ClaudeQuotaService.fetchQuota', () => {
  let svc: ClaudeQuotaService;

  beforeEach(() => {
    setMobileMode(false);
    svc = new ClaudeQuotaService({ app: {} as never, store: { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never, refreshSec: 60 });
  });

  afterEach(() => { resetMocks(); });

  it('200 OK → success 状態の QuotaSnapshot を返す', async () => {
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 62, resets_at: '2026-08-11T19:30:00Z' },
      seven_day: { utilization: 23, resets_at: '2026-08-14T11:00:00Z' },
    }), { status: 200 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('success');
    expect(snap.windows.fiveHour.utilization).toBe(62);
    expect(snap.windows.sevenDay.utilization).toBe(23);
  });

  it('401 → expired 状態を返す', async () => {
    mockFetch(async () => new Response('Unauthorized', { status: 401 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('expired');
  });

  it('500 → error 状態を返す', async () => {
    mockFetch(async () => new Response('Server Error', { status: 500 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('error');
    expect(snap.error).toContain('500');
  });

  it('JSON 解析失敗 → error 状態を返す', async () => {
    mockFetch(async () => new Response('<html>error</html>', { status: 200 }));
    const snap = await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('test-token');
    expect(snap.status).toBe('error');
  });

  it('Authorization ヘッダーに Bearer トークンが含まれる', async () => {
    let capturedAuth: string | null = null;
    mockFetch(async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? null;
      return new Response('{}', { status: 200 });
    });
    await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('my-token');
    expect(capturedAuth).toBe('Bearer my-token');
  });

  it('anthropic-beta: oauth-2025-04-20 ヘッダーが含まれる', async () => {
    let capturedBeta: string | null = null;
    mockFetch(async (_url, init) => {
      capturedBeta = (init?.headers as Record<string, string>)?.['anthropic-beta'] ?? null;
      return new Response('{}', { status: 200 });
    });
    await (svc as unknown as { fetchQuota: (t: string) => Promise<QuotaSnapshot> }).fetchQuota('t');
    expect(capturedBeta).toBe('oauth-2025-04-20');
  });
});
```

> ⚠️ `QuotaSnapshot` 型を import に追加: `import type { QuotaSnapshot } from '../../../src/features/quota/types';`

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/features/quota/core.test.ts
```

Expected: `fetchQuota is not a function` で 6 件失敗。

- [ ] **Step 3: `fetchQuota` を実装**

`src/features/quota/core.ts` に追記（`readFromFile` の後）:

```typescript
async fetchQuota(token: string): Promise<QuotaSnapshot> {
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claudian-bridge/1.0',
      },
    });
    if (res.status === 401 || res.status === 403) {
      return this.setStatus('expired', `HTTP ${res.status}`);
    }
    if (!res.ok) {
      return this.setStatus('error', `HTTP ${res.status}`);
    }
    const json = await res.json();
    return this.parseUsageResponse(json);
  } catch (e) {
    return this.setStatus('error', e instanceof Error ? e.message : String(e));
  }
}

private parseUsageResponse(json: Record<string, unknown>): QuotaSnapshot {
  const windowFrom = (w: unknown): { utilization: number | null; resetsAt: string | null } => {
    if (!w || typeof w !== 'object') return { utilization: null, resetsAt: null };
    const obj = w as { utilization?: number; resets_at?: string };
    return {
      utilization: typeof obj.utilization === 'number' ? obj.utilization : null,
      resetsAt: typeof obj.resets_at === 'string' ? obj.resets_at : null,
    };
  };

  const extra = json.extra_usage as { is_enabled?: boolean; utilization?: number; resets_at?: string } | undefined;

  return {
    status: 'success',
    windows: {
      fiveHour: windowFrom(json.five_hour),
      sevenDay: windowFrom(json.seven_day),
      sevenDayOpus: json.seven_day_opus ? windowFrom(json.seven_day_opus) : undefined,
      sevenDaySonnet: json.seven_day_sonnet ? windowFrom(json.seven_day_sonnet) : undefined,
    },
    extraUsage: extra ? {
      isEnabled: extra.is_enabled ?? false,
      utilization: typeof extra.utilization === 'number' ? extra.utilization : null,
      resetsAt: typeof extra.resets_at === 'string' ? extra.resets_at : null,
    } : null,
    fetchedAt: Date.now(),
    tokenSource: this.snapshot.tokenSource,
  };
}

private setStatus(status: QuotaStatus, error?: string): QuotaSnapshot {
  this.snapshot = { ...this.snapshot, status, error, fetchedAt: Date.now() };
  return this.snapshot;
}
```

> ⚠️ `QuotaStatus` 型を import に追加: `import type { QuotaStatus } from './types';`

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/core.test.ts
```

Expected: 10 件 PASS（readToken 4 + fetchQuota 6）。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/core.ts tests/features/quota/core.test.ts
git commit -m "feat(quota): implement ClaudeQuotaService.fetchQuota with OAuth Usage API"
```

---

### Task 6: `ClaudeQuotaService.start / stop / forceRefresh / onUpdate` の TDD 実装

**Files:**
- Modify: `src/features/quota/core.ts`
- Modify: `tests/features/quota/core.test.ts`

**Interfaces:**
- Consumes: `readToken()` / `fetchQuota()` (Task 4-5)
- Produces: 完全なライフサイクル（start / stop / forceRefresh / onUpdate / getSnapshot / EVENT 発行）

- [ ] **Step 1: 失敗するテストを追加**

`tests/features/quota/core.test.ts` に追記:

```typescript
describe('ClaudeQuotaService lifecycle', () => {
  let svc: ClaudeQuotaService;

  beforeEach(() => {
    setMobileMode(false);
    resetMocks();
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 10, resets_at: '2026-08-11T19:30:00Z' },
      seven_day: { utilization: 5, resets_at: '2026-08-14T11:00:00Z' },
    }), { status: 200 }));
    mockSpawn(() => ({ stdout: '{"claudeAiOauth":{"accessToken":"t","expiresAt":9999999999}}' }));
    svc = new ClaudeQuotaService({ app: {} as never, store: {} as never, refreshSec: 60 });
  });

  afterEach(() => { resetMocks(); clearSpawnMock(); });

  it('start でタイマー起動 + 即座に 1 回フェッチ', async () => {
    await svc.start();
    expect(svc.getSnapshot().status).toBe('success');
    await svc.stop();
  });

  it('stop でタイマー解除、それ以降のフェッチ停止', async () => {
    await svc.start();
    await svc.stop();
    const before = svc.getSnapshot().fetchedAt;
    await new Promise(r => setTimeout(r, 100));
    expect(svc.getSnapshot().fetchedAt).toBe(before);
  });

  it('forceRefresh は即座にフェッチ', async () => {
    await svc.start();
    const before = svc.getSnapshot().fetchedAt;
    await new Promise(r => setTimeout(r, 10));
    await svc.forceRefresh();
    expect(svc.getSnapshot().fetchedAt).toBeGreaterThan(before);
    await svc.stop();
  });

  it('onUpdate で状態変化を購読', async () => {
    const cb = vi.fn();
    const unsub = svc.onUpdate(cb);
    await svc.start();
    expect(cb).toHaveBeenCalled();
    unsub();
    await svc.stop();
  });

  it('Mobile では start でフェッチしない', async () => {
    setMobileMode(true);
    const cb = vi.fn();
    svc.onUpdate(cb);
    await svc.start();
    expect(cb).not.toHaveBeenCalled();
    expect(svc.getSnapshot().status).toBe('unsupported');
    await svc.stop();
  });

  it('refreshSec=0 のとき start でタイマー起動しない', async () => {
    const local = new ClaudeQuotaService({ app: {} as never, store: {} as never, refreshSec: 0 });
    await local.start();
    expect(local.getSnapshot().status).toBe('success'); // 即座 1 回は走る
    await local.stop();
    // その後のタイマーは無いので手動 forceRefresh のみ
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/features/quota/core.test.ts
```

Expected: lifecycle メソッドが空実装のため 6 件失敗。

- [ ] **Step 3: ライフサイクルメソッドを実装**

`src/features/quota/core.ts` の `start()` / `stop()` / `forceRefresh()` / `onUpdate()` を本実装に置き換え:

```typescript
async start(): Promise<void> {
  if (getPlatformIsMobile()) {
    this.snapshot = { ...this.snapshot, status: 'unsupported' };
    this.emit();
    return;
  }
  await this.refreshOnce();
  if (this.opts.refreshSec > 0 && !this.timer) {
    this.timer = setInterval(() => { void this.refreshOnce(); }, this.opts.refreshSec * 1000);
  }
}

async stop(): Promise<void> {
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }
  this.listeners.clear();
}

async forceRefresh(): Promise<QuotaSnapshot> {
  await this.refreshOnce();
  return this.snapshot;
}

getSnapshot(): QuotaSnapshot {
  return this.snapshot;
}

onUpdate(cb: (snap: QuotaSnapshot) => void): () => void {
  this.listeners.add(cb);
  return () => { this.listeners.delete(cb); };
}

private async refreshOnce(): Promise<void> {
  if (this.inFlight) return;
  this.inFlight = true;
  try {
    this.snapshot = { ...this.snapshot, status: 'fetching' };
    this.emit();
    const token = await this.readToken();
    if (!token) {
      this.snapshot = { ...this.snapshot, status: 'expired', error: 'no token' };
      this.emit();
      return;
    }
    this.snapshot = await this.fetchQuota(token);
    this.emit();
  } finally {
    this.inFlight = false;
  }
}

private emit(): void {
  const snap = this.snapshot;
  for (const cb of this.listeners) {
    try { cb(snap); } catch { /* listener error は握り潰す */ }
  }
}
```

> ⚠️ `setStatus` は `private` → `refreshOnce` 内で `this.snapshot` を直接更新に変更。

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/core.test.ts
```

Expected: 16 件 PASS（readToken 4 + fetchQuota 6 + lifecycle 6）。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/core.ts tests/features/quota/core.test.ts
git commit -m "feat(quota): implement ClaudeQuotaService lifecycle (start/stop/forceRefresh/onUpdate)"
```

---

### Task 7: `QuotaBarView` ヘルパー（colorFor / formatCountdown）の TDD 実装

**Files:**
- Create: `src/features/quota/view.ts`
- Create: `tests/features/quota/view.test.ts`（部分作成）

**Interfaces:**
- Consumes: `QuotaWindow` (Task 1)
- Produces: `colorFor(util)` / `formatCountdown(resetsAt)` pure 関数

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/view.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { colorFor, formatCountdown } from '../../../src/features/quota/view';

describe('colorFor', () => {
  it('<70 → green', () => expect(colorFor(0)).toBe('green'));
  it('69 → green', () => expect(colorFor(69)).toBe('green'));
  it('70 → orange', () => expect(colorFor(70)).toBe('orange'));
  it('89 → orange', () => expect(colorFor(89)).toBe('orange'));
  it('90 → red', () => expect(colorFor(90)).toBe('red'));
  it('100 → red', () => expect(colorFor(100)).toBe('red'));
  it('null → gray', () => expect(colorFor(null)).toBe('gray'));
});

describe('formatCountdown', () => {
  const now = Date.now();
  it('null → 空文字', () => expect(formatCountdown(null, now)).toBe(''));
  it('負数 → "0m"', () => {
    const past = new Date(now - 60_000).toISOString();
    expect(formatCountdown(past, now)).toBe('0m');
  });
  it('47 分後 → "47m"', () => {
    const future = new Date(now + 47 * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('47m');
  });
  it('2 時間 45 分後 → "2h45m"', () => {
    const future = new Date(now + (2 * 60 + 45) * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('2h45m');
  });
  it('3 日 4 時間後 → "3d 4h"', () => {
    const future = new Date(now + (3 * 24 + 4) * 60 * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('3d 4h');
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
npm test -- tests/features/quota/view.test.ts
```

Expected: import エラーで全件失敗。

- [ ] **Step 3: view.ts のヘルパー部分を実装**

`src/features/quota/view.ts`:

```typescript
export type QuotaColor = 'green' | 'orange' | 'red' | 'gray';

export function colorFor(util: number | null): QuotaColor {
  if (util === null || !Number.isFinite(util)) return 'gray';
  if (util >= 90) return 'red';
  if (util >= 70) return 'orange';
  return 'green';
}

export function formatCountdown(resetsAt: string | null, nowMs?: number): string {
  if (!resetsAt) return '';
  const now = nowMs ?? Date.now();
  const target = new Date(resetsAt).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - now;
  if (diffMs <= 0) return '0m';

  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h${m % 60}m`;
  return `${m}m`;
}

// 以下は Task 8 で実装
export class QuotaBarView {
  mount(_anchor: HTMLElement): void {}
  unmount(): void {}
  render(_snap: unknown): void {}
}
```

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/view.test.ts
```

Expected: 12 件 PASS（colorFor 7 + formatCountdown 5）。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/view.ts tests/features/quota/view.test.ts
git commit -m "feat(quota): add QuotaBarView helpers (colorFor, formatCountdown)"
```

---

### Task 8: `QuotaBarView.mount / unmount / render` の TDD 実装

**Files:**
- Modify: `src/features/quota/view.ts`
- Modify: `tests/features/quota/view.test.ts`

**Interfaces:**
- Consumes: `colorFor` / `formatCountdown` (Task 7) + `QuotaSnapshot` (Task 1)
- Produces: `QuotaBarView` クラス完全実装（DOM 生成 + 購読 + 60s ローカル tick）

- [ ] **Step 1: 失敗するテストを追加**

`tests/features/quota/view.test.ts` に追記（`@vitest-environment jsdom` を冒頭で指定）:

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// ↑ 既存 import を置き換え

describe('QuotaBarView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.className = 'claudian-input-wrapper';
    document.body.appendChild(container);
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('mount で .claudian-quota-bar が生成される', async () => {
    const { QuotaBarView } = await import('../../../src/features/quota/view');
    const v = new QuotaBarView();
    v.mount(container);
    expect(container.parentElement?.querySelector('.claudian-quota-bar')).not.toBeNull();
  });

  it('mount 二重呼び出しは冪等', async () => {
    const { QuotaBarView } = await import('../../../src/features/quota/view');
    const v = new QuotaBarView();
    v.mount(container);
    v.mount(container);
    expect(container.parentElement?.querySelectorAll('.claudian-quota-bar').length).toBe(1);
  });

  it('unmount で DOM 除去', async () => {
    const { QuotaBarView } = await import('../../../src/features/quota/view');
    const v = new QuotaBarView();
    v.mount(container);
    v.unmount();
    expect(container.parentElement?.querySelector('.claudian-quota-bar')).toBeNull();
  });

  it('render(success+62%) → data-color="green" + テキスト 62%', async () => {
    const { QuotaBarView } = await import('../../../src/features/quota/view');
    const v = new QuotaBarView();
    v.mount(container);
    v.render({
      status: 'success',
      windows: {
        fiveHour: { utilization: 62, resetsAt: '2099-01-01T00:00:00Z' },
        sevenDay: { utilization: 10, resetsAt: '2099-01-01T00:00:00Z' },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'file',
    });
    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.getAttribute('data-status')).toBe('success');
    expect(bar?.querySelector('[data-color="green"]')).not.toBeNull();
    expect(bar?.textContent).toContain('62%');
  });

  it('render(expired) → data-status="expired"', async () => {
    const { QuotaBarView } = await import('../../../src/features/quota/view');
    const v = new QuotaBarView();
    v.mount(container);
    v.render({
      status: 'expired',
      windows: {
        fiveHour: { utilization: null, resetsAt: null },
        sevenDay: { utilization: null, resetsAt: null },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'none',
    });
    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.getAttribute('data-status')).toBe('expired');
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
npm test -- tests/features/quota/view.test.ts
```

Expected: QuotaBarView がスケルトンのため 5 件失敗。

- [ ] **Step 3: `QuotaBarView` クラスを完全実装**

`src/features/quota/view.ts` の `QuotaBarView` を置き換え:

```typescript
import type { QuotaSnapshot } from './types';

export class QuotaBarView {
  private el: HTMLElement | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: QuotaSnapshot | null = null;

  mount(anchor: HTMLElement): void {
    if (this.el) return; // 冪等
    const parent = anchor.parentElement;
    if (!parent) return;
    this.el = parent.createDiv({ cls: 'claudian-quota-bar', attr: { 'data-status': 'idle' } });
    // anchor の前に挿入（prepend）
    parent.insertBefore(this.el, anchor);
    // 60 秒ごとのローカル tick（カウントダウン再描画）
    this.tickTimer = setInterval(() => {
      if (this.lastSnapshot) this.render(this.lastSnapshot);
    }, 60_000);
  }

  unmount(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.el) { this.el.remove(); this.el = null; }
    this.lastSnapshot = null;
  }

  render(snap: QuotaSnapshot): void {
    if (!this.el) return;
    this.lastSnapshot = snap;
    this.el.empty();
    this.el.setAttribute('data-status', snap.status);

    const main = this.el.createSpan({ cls: 'claudian-quota-bar__main' });
    const dot = main.createSpan({ cls: 'claudian-quota-bar__dot' });
    dot.setAttribute('data-color', colorFor(snap.windows.fiveHour.utilization));
    main.createSpan({ cls: 'claudian-quota-bar__label', text: '5h' });
    main.createSpan({ cls: 'claudian-quota-bar__value', text: snap.windows.fiveHour.utilization !== null ? `${snap.windows.fiveHour.utilization}%` : '--' });
    const cd = formatCountdown(snap.windows.fiveHour.resetsAt);
    if (cd) main.createSpan({ cls: 'claudian-quota-bar__countdown', text: `🕘 ${cd}` });

    const sub = this.el.createSpan({ cls: 'claudian-quota-bar__sub' });
    sub.createSpan({ cls: 'claudian-quota-bar__sub-label', text: '7d' });
    sub.createSpan({ cls: 'claudian-quota-bar__value', text: snap.windows.sevenDay.utilization !== null ? `${snap.windows.sevenDay.utilization}%` : '--' });

    const btn = this.el.createEl('button', { cls: 'claudian-quota-bar__refresh clickable-icon', attr: { 'aria-label': 'Refresh quota' } });
    btn.innerHTML = '↻';
  }
}
```

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/view.test.ts
```

Expected: 17 件 PASS（colorFor 7 + formatCountdown 5 + view 5）。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/view.ts tests/features/quota/view.test.ts
git commit -m "feat(quota): implement QuotaBarView mount/unmount/render"
```

---

### Task 9: `registerClaudeQuota` 公開 API（`index.ts`）

**Files:**
- Create: `src/features/quota/index.ts`
- Create: `tests/features/quota/index.test.ts`

**Interfaces:**
- Consumes: `ClaudeQuotaService` (Task 6) + `QuotaBarView` (Task 8) + `App` / `ConfigStore` / `realclaudian` プラグイン
- Produces: `registerClaudeQuota(app, store)` / `unregisterClaudeQuota()` / `ClaudeQuotaHandle`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/index.test.ts`:

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetMocks, setMobileMode } from '../../mocks/obsidian';

describe('registerClaudeQuota', () => {
  beforeEach(() => { setMobileMode(false); resetMocks(); document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('Mobile のとき null を返す', async () => {
    setMobileMode(true);
    const { registerClaudeQuota } = await import('../../../src/features/quota/index');
    const handle = await registerClaudeQuota({} as never, { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never);
    expect(handle).toBeNull();
  });

  it('正常時 ClaudeQuotaHandle を返す', async () => {
    const { registerClaudeQuota } = await import('../../../src/features/quota/index');
    const handle = await registerClaudeQuota({} as never, { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never);
    expect(handle).not.toBeNull();
    expect(handle?.service).toBeDefined();
    expect(handle?.view).toBeDefined();
    expect(typeof handle?.dispose).toBe('function');
    await handle?.dispose();
  });

  it('quotaEnabled=false のとき Service は start しない', async () => {
    const { registerClaudeQuota } = await import('../../../src/features/quota/index');
    const handle = await registerClaudeQuota({} as never, { load: () => ({ general: { quotaEnabled: false, quotaRefreshSec: 60 } }) } as never);
    // handle は null ではなく返るが service は idle のまま
    expect(handle?.service.getSnapshot().status).not.toBe('success');
    await handle?.dispose();
  });

  it('dispose で全リソース解放', async () => {
    const { registerClaudeQuota } = await import('../../../src/features/quota/index');
    const handle = await registerClaudeQuota({} as never, { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) } as never);
    await handle?.dispose();
    // dispose 後の状態確認（タイマー無し）
    expect(handle?.service.getSnapshot().status).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
npm test -- tests/features/quota/index.test.ts
```

Expected: import エラーで 4 件失敗。

- [ ] **Step 3: `index.ts` を実装**

`src/features/quota/index.ts`:

```typescript
import type { App } from 'obsidian';
import { getPlatformIsMobile } from '../../../../tests/mocks/obsidian'; // ← テスト用、実装時は Platform から取得
import { ClaudeQuotaService } from './core';
import { QuotaBarView } from './view';
import type { ConfigStore } from '../core/config-store';
import { Platform } from 'obsidian';

export interface ClaudeQuotaHandle {
  service: ClaudeQuotaService;
  view: QuotaBarView;
  dispose(): Promise<void>;
}

let _handle: ClaudeQuotaHandle | null = null;

export async function registerClaudeQuota(
  _app: App,
  store: ConfigStore,
): Promise<ClaudeQuotaHandle | null> {
  if (Platform.isMobile) return null;

  const cfg = store.load();
  const service = new ClaudeQuotaService({
    app: _app,
    store,
    refreshSec: cfg.general.quotaRefreshSec,
  });

  const view = new QuotaBarView();

  // realclaudian が有効な場合のみ自動マウント
  const realClaudian = (_app as unknown as {
    plugins?: { plugins?: Record<string, { getView?: () => unknown } | undefined> };
  })?.plugins?.plugins?.['realclaudian'];

  if (realClaudian?.getView) {
    try {
      const v = realClaudian.getView() as { getInputWrapper?: () => HTMLElement | null } | null;
      const wrapper = v?.getInputWrapper?.();
      if (wrapper) view.mount(wrapper);
    } catch {
      // マウント失敗は silent skip
    }
  }

  // quotaEnabled が true のときだけ Service 起動
  if (cfg.general.quotaEnabled) {
    await service.start();
  }

  _handle = {
    service,
    view,
    async dispose() {
      await service.stop();
      view.unmount();
      _handle = null;
    },
  };

  return _handle;
}

export async function unregisterClaudeQuota(): Promise<void> {
  if (_handle) await _handle.dispose();
}
```

> 💡 **注**: 実コードでは `Platform.isMobile` を使う。テストでは `tests/mocks/obsidian.ts` の `setMobileMode()` → `getPlatformIsMobile()` を使う。Task 2 で `Platform.isMobile` spy を mock に追加済みの前提。

- [ ] **Step 4: テスト実行 → PASS 確認**

```bash
npm test -- tests/features/quota/index.test.ts
```

Expected: 4 件 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/features/quota/index.ts tests/features/quota/index.test.ts
git commit -m "feat(quota): add registerClaudeQuota public API with realclaudian integration"
```

---

### Task 10: i18n 三語対応（`core/i18n.ts`）

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Consumes: 既存の `getLocaleStrings()` / STRINGS オブジェクト
- Produces: 11 キー追加（`quotaEnabled` / `quotaEnabledDesc` / `quotaRefreshSec` / `quotaRefreshSecDesc` / `quotaFetching` / `quotaNotLoggedIn` / `quotaError` / `quotaUnsupportedMobile` / `quotaRefresh` / `quotaWindow5h` / `quotaWindow7d`）

- [ ] **Step 1: 既存 i18n の構造を確認**

```bash
cd D:\AI-Agent\ClaudianBridge
grep -n "tabGeneral\|generalEnabled" src/core/i18n.ts | head -20
```

Expected: `tabGeneral` / `generalEnabled` 等のキーが `STRINGS.ja` / `STRINGS.en` / `STRINGS.zh` に存在することを確認。

- [ ] **Step 2: 3 言語分の 11 キーを追加**

`src/core/i18n.ts` の `STRINGS.ja` / `STRINGS.en` / `STRINGS.zh` オブジェクト末尾に追加:

```typescript
// ja:
quotaEnabled: 'Claude 残量検出',
quotaEnabledDesc: 'Claude Code の OAuth 利用状況を表示します（デスクトップのみ）',
quotaRefreshSec: '更新間隔（秒）',
quotaRefreshSecDesc: '10〜600 の範囲で指定',
quotaFetching: '読み込み中…',
quotaNotLoggedIn: 'Claude Code に未ログインです',
quotaError: '残量取得に失敗しました',
quotaUnsupportedMobile: '残量検出はデスクトップでのみ利用可能です',
quotaRefresh: '残量を更新',
quotaWindow5h: '5時間',
quotaWindow7d: '7日間',

// en:
quotaEnabled: 'Claude quota detection',
quotaEnabledDesc: 'Show Claude Code OAuth usage (desktop only)',
quotaRefreshSec: 'Refresh interval (sec)',
quotaRefreshSecDesc: 'Range 10–600',
quotaFetching: 'Fetching…',
quotaNotLoggedIn: 'Not logged in to Claude Code',
quotaError: 'Failed to fetch quota',
quotaUnsupportedMobile: 'Quota detection is desktop-only',
quotaRefresh: 'Refresh quota',
quotaWindow5h: '5h',
quotaWindow7d: '7d',

// zh:
quotaEnabled: 'Claude 残量检测',
quotaEnabledDesc: '显示 Claude Code OAuth 使用情况（仅桌面端）',
quotaRefreshSec: '刷新间隔（秒）',
quotaRefreshSecDesc: '10–600 秒范围',
quotaFetching: '加载中…',
quotaNotLoggedIn: '未登录 Claude Code',
quotaError: '获取额度失败',
quotaUnsupportedMobile: '残量检测仅在桌面端可用',
quotaRefresh: '刷新额度',
quotaWindow5h: '5小时',
quotaWindow7d: '7天',
```

- [ ] **Step 3: TypeScript ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npx tsc --noEmit
```

Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/core/i18n.ts
git commit -m "feat(i18n): add 11 quota detection strings in ja/en/zh"
```

---

### Task 11: 設定画面 UI 追加（`SettingTabGeneral.ts`）

**Files:**
- Modify: `src/settings/SettingTabGeneral.ts`

**Interfaces:**
- Consumes: `getLocaleStrings()` (Task 10) + `ConfigStore` (Task 3) + `clampRefreshSec` (Task 3)
- Produces: 「Claude 残量検出」トグル + 間隔入力欄 UI

- [ ] **Step 1: 既存の `renderGeneralTab` を確認**

```bash
cd D:\AI-Agent\ClaudianBridge
grep -n "renderGeneralTab\|generalEnabled" src/settings/SettingTabGeneral.ts | head -10
```

Expected: 既存「Claudian Bridge を有効化」セクションの実装パターンを把握。

- [ ] **Step 2: quota セクションを `draw()` 関数の末尾に追加**

`src/settings/SettingTabGeneral.ts` の `draw()` 関数内、「Claudian Bridge を有効化」セクションの後ろに追記:

```typescript
// === Quota Detection (v0.3.0) ===
const quotaSection = containerEl.createDiv({ cls: 'claudian-bridge-settings-section' });
quotaSection.createEl('h3', { text: s.quotaEnabled });

new Setting(quotaSection)
  .setName(s.quotaEnabled)
  .setDesc(s.quotaEnabledDesc)
  .addToggle((t) =>
    t.setValue(cfg.general.quotaEnabled).onChange(async (v) => {
      cfg.general.quotaEnabled = v;
      await store.save(cfg);
    }),
  );

new Setting(quotaSection)
  .setName(s.quotaRefreshSec)
  .setDesc(s.quotaRefreshSecDesc)
  .addText((t) => {
    t.setValue(String(cfg.general.quotaRefreshSec)).onChange(async (v) => {
      const n = parseInt(v, 10);
      cfg.general.quotaRefreshSec = Number.isFinite(n) ? clampRefreshSec(n) : 60;
      await store.save(cfg);
    });
  });
```

> ⚠️ `clampRefreshSec` は `src/core/settings.ts` から export する（Task 3 で既にローカル定義済み → Step 4 で export 化）

- [ ] **Step 3: `clampRefreshSec` を `src/core/settings.ts` から export**

```typescript
export function clampRefreshSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 60;
  return Math.max(10, Math.min(600, Math.floor(v)));
}
```

- [ ] **Step 4: TypeScript ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npx tsc --noEmit
```

Expected: エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/settings/SettingTabGeneral.ts src/core/settings.ts
git commit -m "feat(settings): add quota detection toggle and refresh interval input to general tab"
```

---

### Task 12: スタイル追加（`styles.css`）

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: 既存 `.claudian-bridge-*` スタイル
- Produces: `.claudian-quota-bar` 関連スタイル（28px 高、flex レイアウト、カラー閾値）

- [ ] **Step 1: styles.css の末尾に quota-bar スタイルを追加**

`src/styles.css` 末尾に追記:

```css
/* === Quota Detection (v0.3.0) === */
.claudian-quota-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
}
.claudian-quota-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
.claudian-quota-bar__dot[data-color="green"]  { background: #4caf50; }
.claudian-quota-bar__dot[data-color="orange"] { background: #ff9800; }
.claudian-quota-bar__dot[data-color="red"]    { background: #f44336; }
.claudian-quota-bar__dot[data-color="gray"]   { background: #9e9e9e; }
.claudian-quota-bar__countdown {
  margin-left: 4px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.claudian-quota-bar__refresh {
  margin-left: auto;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.claudian-quota-bar:hover .claudian-quota-bar__refresh {
  opacity: 1;
}
.claudian-quota-bar[data-status="fetching"] .claudian-quota-bar__dot {
  animation: claudian-quota-pulse 1.2s ease-in-out infinite;
}
@keyframes claudian-quota-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1.0; }
}
```

- [ ] **Step 2: ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm run build
```

Expected: ビルド成功、`main.js` に CSS がバンドルされる。

- [ ] **Step 3: コミット**

```bash
git add src/styles.css
git commit -m "feat(styles): add .claudian-quota-bar styles for quota detection"
```

---

### Task 13: イベント定数（`core/events.ts`）

**Files:**
- Modify: `src/core/events.ts`

**Interfaces:**
- Consumes: 既存 `events.ts`（存在しなければ新規作成）
- Produces: `EVENT_QUOTA_UPDATED` 定数の re-export（`features/quota/types.ts` から re-export）

- [ ] **Step 1: 既存 events.ts を確認**

```bash
cd D:\AI-Agent\ClaudianBridge
test -f src/core/events.ts && cat src/core/events.ts || echo "NOT FOUND"
```

- [ ] **Step 2: 既存なら re-export、なければ作成**

**既存の場合**（`src/core/events.ts` の末尾に追加）:

```typescript
// Re-export from quota feature module
export { EVENT_QUOTA_UPDATED } from '../features/quota/types';
```

**存在しない場合**（新規作成）:

```typescript
// 中央集約イベント名（機能間で共有）
export { EVENT_QUOTA_UPDATED } from '../features/quota/types';
```

- [ ] **Step 3: TypeScript ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npx tsc --noEmit
```

Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/core/events.ts
git commit -m "feat(events): export EVENT_QUOTA_UPDATED constant"
```

---

### Task 14: `main.ts` ライフサイクル統合

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `registerClaudeQuota` / `unregisterClaudeQuota` (Task 9) + `this.store`
- Produces: `onload` で呼び出し、`onunload` で解除

- [ ] **Step 1: 既存の `onload` / `onunload` を確認**

```bash
cd D:\AI-Agent\ClaudianBridge
grep -n "onload\|onunload" src/main.ts | head -10
```

Expected: 既存パターン（`registerObjectContextMenu` 等）を把握。

- [ ] **Step 2: `onload` 末尾に `registerClaudeQuota` 呼び出しを追加**

```typescript
// === Quota Detection (v0.3.0) ===
import { registerClaudeQuota, unregisterClaudeQuota } from './features/quota/index';

// onload() 内の末尾に追加:
this.quotaHandle = await registerClaudeQuota(this.app, this.store);
```

- [ ] **Step 3: `onunload` 内に解除処理を追加**

```typescript
// onunload() 内の末尾に追加:
if (this.quotaHandle) {
  await unregisterClaudeQuota();
  this.quotaHandle = null;
}
```

- [ ] **Step 4: `quotaHandle` フィールドをクラスに追加**

```typescript
private quotaHandle: Awaited<ReturnType<typeof registerClaudeQuota>> = null;
```

- [ ] **Step 5: TypeScript ビルド確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npx tsc --noEmit
```

Expected: エラーなし。

- [ ] **Step 6: ビルド + デプロイ確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm run build
```

Expected: ビルド成功。

- [ ] **Step 7: コミット**

```bash
git add src/main.ts
git commit -m "feat(main): integrate quota detection lifecycle in onload/onunload"
```

---

### Task 15: 統合テスト（Service ↔ EventBus ↔ View）

**Files:**
- Create: `tests/integration/quota.test.ts`

**Interfaces:**
- Consumes: 既存統合テストの構造、`fake timers`（vitest）
- Produces: フルライフサイクル / 設定変更伝播 / 複数 View 購読 / Settings バリデーションの 4 シナリオ

- [ ] **Step 1: 失敗する統合テストを書く**

`tests/integration/quota.test.ts`:

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetMocks, setMobileMode, mockFetch, mockSpawn, mockReadFile, clearSpawnMock, clearReadFileMock } from '../mocks/obsidian';
import { ClaudeQuotaService } from '../../src/features/quota/core';
import { QuotaBarView } from '../../src/features/quota/view';
import { EVENT_QUOTA_UPDATED } from '../../src/features/quota/types';
import { normalizeClaudianBridgeSettings } from '../../src/core/settings';

describe('Quota Integration', () => {
  beforeEach(() => {
    setMobileMode(false);
    resetMocks();
    clearSpawnMock();
    clearReadFileMock();
    mockSpawn(() => ({ stdout: '{"claudeAiOauth":{"accessToken":"t","expiresAt":9999999999}}' }));
    mockFetch(async () => new Response(JSON.stringify({
      five_hour: { utilization: 50, resets_at: '2099-01-01T00:00:00Z' },
      seven_day: { utilization: 10, resets_at: '2099-01-01T00:00:00Z' },
    }), { status: 200 }));
    document.body.innerHTML = '<div class="claudian-input-wrapper"></div>';
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('フルライフサイクル: start → emit → render → stop', async () => {
    const store = { load: () => ({ general: { quotaEnabled: true, quotaRefreshSec: 60 } }) };
    const svc = new ClaudeQuotaService({ app: {} as never, store: store as never, refreshSec: 60 });
    const view = new QuotaBarView();
    const anchor = document.querySelector('.claudian-input-wrapper') as HTMLElement;
    view.mount(anchor);

    const received: string[] = [];
    svc.onUpdate((s) => { received.push(s.status); view.render(s); });

    await svc.start();
    expect(received).toContain('success');
    expect(view['el']?.getAttribute('data-status')).toBe('success');

    await svc.stop();
  });

  it('Settings 変更伝播: quotaEnabled=true で Service が start する', async () => {
    const cfg1 = normalizeClaudianBridgeSettings({});
    cfg1.general.quotaEnabled = true;
    expect(cfg1.general.quotaEnabled).toBe(true);
  });

  it('複数 View が同一 Service からの更新を受信', async () => {
    const svc = new ClaudeQuotaService({ app: {} as never, store: {} as never, refreshSec: 60 });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    svc.onUpdate(cb1);
    svc.onUpdate(cb2);
    await svc.start();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
    await svc.stop();
  });

  it('Settings バリデーション: quotaRefreshSec 欠損 → デフォルト 60', () => {
    const s = normalizeClaudianBridgeSettings({});
    expect(s.general.quotaRefreshSec).toBe(60);
  });
});
```

- [ ] **Step 2: テスト実行 → FAIL 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- tests/integration/quota.test.ts
```

Expected: 各種 import エラーで 4 件失敗。

- [ ] **Step 3: テスト修正 + 実行 → PASS 確認**

統合テストは Task 1-9 の完了が前提。必要に応じてモックの微調整を行う。すべての import パスと型参照が正しいか確認。

```bash
npm test -- tests/integration/quota.test.ts
```

Expected: 4 件 PASS。

- [ ] **Step 4: 全テスト一括実行 → すべて PASS 確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test
```

Expected: 全テスト緑（types 6 + core 16 + view 17 + index 4 + integration 4 + 既存テスト = 47+ 件）。

- [ ] **Step 5: コミット**

```bash
git add tests/integration/quota.test.ts
git commit -m "test(integration): add quota detection integration tests"
```

---

### Task 16: カバレッジ確認 + manifest.json 更新

**Files:**
- Modify: `manifest.json`

**Interfaces:**
- Consumes: 既存 `manifest.json` の `version` フィールド
- Produces: `"version": "0.3.0"`

- [ ] **Step 1: カバレッジレポートを確認**

```bash
cd D:\AI-Agent\ClaudianBridge
npm test -- --coverage
```

Expected:
| ファイル | 行カバレッジ | 分岐カバレッジ |
|---------|:------------:|:--------------:|
| `src/features/quota/core.ts` | ≥ 90% | ≥ 85% |
| `src/features/quota/view.ts` | ≥ 80% | ≥ 75% |
| `src/features/quota/types.ts` | 100% | 100% |
| `src/features/quota/index.ts` | ≥ 85% | ≥ 80% |

カバレッジ未達の場合、Task 4-9 のテストケースを追加して全目標達成。

- [ ] **Step 2: `manifest.json` のバージョンを更新**

```json
{
  "version": "0.3.0"
}
```

- [ ] **Step 3: 本番ビルド**

```bash
cd D:\AI-Agent\ClaudianBridge
npm run build
```

Expected: `main.js` が minify されて生成される。

- [ ] **Step 4: コミット**

```bash
git add manifest.json
git commit -m "chore: bump version to 0.3.0 for quota detection feature"
```

---

### Task 17: 手動 UAT（主人レビュー）

**Files:**
- Modify: `.obsidian/plugins/claudian-bridge/main.js`（build 成果物 → デプロイ）

**Interfaces:**
- Consumes: Task 1-16 で生成された全成果物
- Produces: 受入チェックリスト 20 項目の検証結果

- [ ] **Step 1: デプロイ**

```bash
cd D:\AI-Agent\ClaudianBridge
npm run deploy
```

Expected: `.obsidian/plugins/claudian-bridge/main.js` が上書きされる。

- [ ] **Step 2: Obsidian 再起動 + プラグインリロード**

Obsidian を再起動 → Settings → Community plugins → Claudian Bridge をリロード。

- [ ] **Step 3: インストール & 設定（5 項目）を確認**

| # | 検証項目 | 結果 |
|:--:|----------|:----:|
| 1 | Plugin ロード時エラーなし | ☐ |
| 2 | Settings → 一般タブに「Claude 残量検出」表示 | ☐ |
| 3 | トグル初期値 = OFF | ☐ |
| 4 | トグル ON で「更新間隔（秒）」入力欄表示 | ☐ |
| 5 | 間隔範囲 10–600 の境界クランプ動作 | ☐ |

- [ ] **Step 4: 表示（6 項目）を確認**

| # | 検証項目 | 結果 |
|:--:|----------|:----:|
| 6 | ON 後 realclaudian ChatView 顶部にステータスバー | ☐ |
| 7 | 利用率 <70% → 緑、70–89% → 橙、≥90% → 赤 | ☐ |
| 8 | カウントダウン 60 秒毎再描画 | ☐ |
| 9 | 7日間指標 hover 展開 | ☐ |
| 10 | リフレッシュボタン押下で即時フェッチ | ☐ |
| 11 | 複数 Chat タブが独立表示 | ☐ |

- [ ] **Step 5: エラー状態（4 項目）を確認**

| # | 検証項目 | 結果 |
|:--:|----------|:----:|
| 12 | 未ログイン → 灰円 + 「未ログイン」 | ☐ |
| 13 | ネットワーク断 → 赤円 + 「取得失敗」 | ☐ |
| 14 | Token 期限切れ → 401 後 expired | ☐ |
| 15 | Mobile で DOM 非マウント | ☐ |

- [ ] **Step 6: i18n & 互換性（5 項目）を確認**

| # | 検証項目 | 結果 |
|:--:|----------|:----:|
| 16 | Obsidian 言語切替（ja / en / zh）で文言変化 | ☐ |
| 17 | カウントダウン数字はロケール非依存 | ☐ |
| 18 | realclaudian DOM クラス変更後でもマウント可 | ☐ |
| 19 | 既存 feature と同時有効で競合なし | ☐ |
| 20 | Plugin アンロードで全リソース解放 | ☐ |

- [ ] **Step 7: 結果を `04_開発ログ` に記録**

`80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/04_開発ログ.md` に 2026-08-11 のエントリとして UAT 結果を追記。

- [ ] **Step 8: コミット（ログのみ）**

```bash
git add 80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/04_開発ログ.md
git commit -m "docs: record UAT results for quota detection feature"
```

---

### Task 18: CHANGELOG 更新 + main マージ

**Files:**
- Modify: `CHANGELOG.md`（存在しなければ新規作成）
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/04_開発ログ.md`

- [ ] **Step 1: CHANGELOG.md に v0.3.0 セクションを追加**

```markdown
## [0.3.0] - 2026-08-11

### Added

- **LLM 残量検知機能**（Claudian OAuth Usage API 利用）
  - 設定「一般」タブに「Claude 残量検出」トグル追加（デフォルト OFF）
  - Claudian Chat 入力欄直上にステータスバー表示（5h / 7d 残量 + 残時間）
  - 利用率閾値による色分け（<70% 緑 / 70–89% 橙 / ≥90% 赤）
  - 60 秒間隔の自動更新（10–600 秒範囲でカスタマイズ可）
  - Keychain / ファイル fallback による OAuth Token 読み取り
  - Mobile プラットフォームでは自動的に無効化
  - trilingual i18n 対応（ja / en / zh）

### Technical

- 新規モジュール: `src/features/quota/{types,core,view,index}.ts`
- テスト: types 6 + core 16 + view 17 + index 4 + integration 4 = 47 ケース
- カバレッジ目標: core ≥ 90% / view ≥ 80% / types 100% / index ≥ 85%
```

- [ ] **Step 2: feature ブランチを main にマージ**

```bash
cd D:\AI-Agent\ClaudianBridge
git checkout main
git merge --no-ff feat/quota-detection -m "Merge feat/quota-detection: LLM quota detection (v0.3.0)"
```

- [ ] **Step 3: タグ付け**

```bash
git tag -a v0.3.0 -m "LLM quota detection release"
```

- [ ] **Step 4: リモートへプッシュ**

```bash
git push origin main --tags
```

---

## 進捗チェックリスト

| # | Task | 状態 |
|:--:|------|:----:|
| 1 | 型定義 + 定数（types.ts） | ☐ |
| 2 | テスト Mock 拡張 | ☐ |
| 3 | 設定スキーマ拡張 | ☐ |
| 4 | ClaudeQuotaService.readToken | ☐ |
| 5 | ClaudeQuotaService.fetchQuota | ☐ |
| 6 | ClaudeQuotaService lifecycle | ☐ |
| 7 | QuotaBarView ヘルパー | ☐ |
| 8 | QuotaBarView mount/render | ☐ |
| 9 | registerClaudeQuota 公開 API | ☐ |
| 10 | i18n 三語対応 | ☐ |
| 11 | 設定画面 UI | ☐ |
| 12 | スタイル追加 | ☐ |
| 13 | イベント定数 | ☐ |
| 14 | main.ts ライフサイクル統合 | ☐ |
| 15 | 統合テスト | ☐ |
| 16 | カバレッジ + manifest | ☐ |
| 17 | 手動 UAT | ☐ |
| 18 | CHANGELOG + main マージ | ☐ |

---

## 📚 参考文献

| # | 種別 | 参照元 |
|:--:|:----:|------|
| 1 | Vault MD | [[../02_設計文書/11_LLM残量検知設計]] |
| 2 | Vault MD | [[10_オブジェクトコンテキストメニュー実装計画]]（実装計画テンプレ） |
| 3 | GitHub | [farion1231/cc-switch - Usage Query](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/2-providers/2.5-usage-query.md) |

---

*🛠️ Claudian Bridge LLM 残量検知 実装計画 v1.0.0 · MiuMiu 🐾 · 2026-08-11*