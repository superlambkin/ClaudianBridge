# Folder Mapping (F-049) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "フォルダマッピング" section to the existing "Vault表示" settings tab that lets users map arbitrary external folders to `Vault/@10_Input/{linkName}` via Windows junctions, enabling bidirectional file access without copying.

**Architecture:** New `FolderMappingManager` class in `src/features/folder-mapping/` modeled after the existing `OutputsMirrorManager` (DI-injected FS, idempotent apply, states). Settings store gains `general.folderMappings: FolderMapping[]`. UI section sits between whitelist toggles and the existing Outputs Mirror section. Plugin's `onload()` calls `applyAllMappings()` to materialize junctions on startup.

**Tech Stack:** TypeScript, Node.js `fs` (DI-injected for testability), Obsidian plugin APIs (`Setting`, `Notice`, `Modal`, `electron.shell.openPath`), vitest.

## Global Constraints

- Existing tests: 1348 (must remain green)
- Target: v0.50.0 release, F-049, branch `feat/v0.50.0-folder-mapping`
- Strict TDD: write failing test → run → implement → run → commit
- All FS ops go through DI-injected `fs` interface (no `vi.mock('fs')`)
- Validation regex must use `u` flag for CJK / surrogate pair safety
- 既存 `OutputsMirrorManager` には**一切触らない**（並走・後方互換 100%）
- 既存 `general.outputsMirror*` キー無変更
- デフォルト `folderMappings = []`（既存ユーザー影響ゼロ）
- All new code paths must have an i18n key for ja/en/zh
- Branch policy: create `feat/v0.50.0-folder-mapping` from `main`, merge via PR
- Linked destination: `vaultBasePath + '@10_Input/' + linkName` (固定)
- Link type: Windows junction only (`fs.symlinkSync(target, path, 'junction')`)
- Delete must only remove the junction link, never the external target files
- 禁止 externalPath: vaultBasePath 自体 / Vault 祖先 / `C:\Windows` / `C:\Program Files` / `~/.ssh` / `~/.aws` / `~/.gnupg`
- UI section appears between whitelist toggles and existing Outputs Mirror section in `SettingTabWhitelist.ts`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/features/folder-mapping/types.ts` | `FolderMapping`, `FolderMappingState`, `FolderMappingDeps`, `ApplyAllResult` types | Create |
| `src/features/folder-mapping/defaults.ts` | `DEFAULT_FOLDER_MAPPINGS = []` | Create |
| `src/features/folder-mapping/manager.ts` | `FolderMappingManager` class — `resolveLinkPath`, `apply`, `applyAll`, `status`, `openExternal`, validation | Create |
| `src/features/folder-mapping/manager.test.ts` | 20+ unit tests covering all states | Create |
| `src/features/folder-mapping/validation.ts` | `validateLinkName`, `validateExternalPath`, `FORBIDDEN_PATH_PREFIXES`, linkName regex | Create |
| `src/features/folder-mapping/validation.test.ts` | 8+ unit tests | Create |
| `src/core/settings.ts` | Add `folderMappings: FolderMapping[]` to `GeneralSettings`, export `DEFAULT_FOLDER_MAPPINGS` | Modify |
| `src/core/migrator.ts` | (if needed) ensure normalize fills `folderMappings` with `[]` when missing | Modify |
| `src/core/i18n.ts` | Add 8 keys × 3 locales | Modify |
| `src/settings/SettingTabWhitelist.ts` | Insert new section + add/edit/toggle/remove handlers + 2 modals + confirm dialog | Modify |
| `src/settings/SettingTabWhitelist.test.ts` (if not present, create) | 6+ integration tests | Create or modify |
| `main.ts` | Call `folderMappingsManager.applyAll()` in `onload()` | Modify |
| `CHANGELOG.md` | Add `[0.50.0]` entry | Modify |
| `package.json` | Bump version 0.49.1 → 0.50.0 | Modify |
| `src/manifest.json` | Bump version 0.49.1 → 0.50.0 | Modify |
| `Plugin/manifest.json` | Bump version 0.49.1 → 0.50.0 | Modify |

---

## Task 1: Type definitions + defaults + folder scaffolding

**Files:**
- Create: `src/features/folder-mapping/types.ts`
- Create: `src/features/folder-mapping/defaults.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```typescript
  // types.ts
  export interface FolderMapping {
    id: string;
    linkName: string;
    externalPath: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
  }
  export type FolderMappingState =
    | 'linked' | 'created' | 'removed' | 'inactive'
    | 'vault_exists' | 'external_missing' | 'circular'
    | 'forbidden_path' | 'error';
  export interface FolderMappingFs {
    existsSync: (p: string) => boolean;
    mkdirSync: (p: string, opts: { recursive: true }) => void;
    symlinkSync: (target: string, path: string, type: string) => void;
    lstatSync: (p: string) => { isSymbolicLink(): boolean };
    rmdirSync: (p: string) => void;
    rmSync: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;
    realpathSync?: (p: string) => string;
    statSync?: (p: string) => { isDirectory(): boolean };
  }
  export interface FolderMappingDeps {
    vaultBasePath: string;
    fs: FolderMappingFs;
    notice: (msg: string) => void;
    openPath: (p: string) => Promise<string>;
    generateId?: () => string;
    now?: () => number;
  }
  export interface ApplyAllResult {
    applied: Array<{ id: string; state: FolderMappingState }>;
    totalCreated: number;
    totalRemoved: number;
    totalErrors: number;
  }
  export interface MappingStatus {
    linked: boolean;
    target?: string;
    state: FolderMappingState;
  }

  // defaults.ts
  export const DEFAULT_FOLDER_MAPPINGS: FolderMapping[] = [];
  ```

- [ ] **Step 1: Create `src/features/folder-mapping/` directory**

```bash
mkdir -p "D:/AI-Agent/ClaudianBridge/src/features/folder-mapping"
```

- [ ] **Step 2: Create `src/features/folder-mapping/types.ts`** with the exact contents above.

- [ ] **Step 3: Create `src/features/folder-mapping/defaults.ts`**:

```typescript
import type { FolderMapping } from './types';

/** F-049: デフォルトは空配列（既存ユーザー影響ゼロ） */
export const DEFAULT_FOLDER_MAPPINGS: FolderMapping[] = [];
```

- [ ] **Step 4: Run typecheck to verify**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/types.ts src/features/folder-mapping/defaults.ts && git commit -m "feat(folder-mapping): F-049 型定義とデフォルト値を追加"
```

---

## Task 2: Validation module + tests

**Files:**
- Create: `src/features/folder-mapping/validation.ts`
- Create: `src/features/folder-mapping/validation.test.ts`

**Interfaces:**
- Consumes: `vaultBasePath: string`, platform info (`process.platform`)
- Produces:
  ```typescript
  export const LINK_NAME_REGEX = /^[A-Za-z0-9_\-ぁ-んァ-ヴ一-鿿\s]{1,64}$/u;
  export function validateLinkName(name: string, existing: FolderMapping[]): { ok: true } | { ok: false; reason: string };
  export function validateExternalPath(p: string, vaultBasePath: string): { ok: true } | { ok: false; reason: 'empty'|'not_absolute'|'null_byte'|'circular'|'forbidden_path' };
  ```

- [ ] **Step 1: Write failing tests in `src/features/folder-mapping/validation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  LINK_NAME_REGEX,
  validateLinkName,
  validateExternalPath,
} from './validation';
import type { FolderMapping } from './types';

const VAULT = 'C:\\Users\\me\\Vault';

const baseMapping = (overrides: Partial<FolderMapping> = {}): FolderMapping => ({
  id: 'id-1',
  linkName: 'ExternalDocs',
  externalPath: 'D:\\projects\\docs',
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('LINK_NAME_REGEX', () => {
  it('accepts ASCII', () => {
    expect(LINK_NAME_REGEX.test('ExternalDocs')).toBe(true);
  });
  it('accepts CJK', () => {
    expect(LINK_NAME_REGEX.test('外部資料')).toBe(true);
  });
  it('rejects empty', () => {
    expect(LINK_NAME_REGEX.test('')).toBe(false);
  });
  it('rejects slash', () => {
    expect(LINK_NAME_REGEX.test('foo/bar')).toBe(false);
  });
  it('rejects backslash', () => {
    expect(LINK_NAME_REGEX.test('foo\\bar')).toBe(false);
  });
  it('rejects 65 chars', () => {
    expect(LINK_NAME_REGEX.test('a'.repeat(65))).toBe(false);
  });
  it('accepts 64 chars', () => {
    expect(LINK_NAME_REGEX.test('a'.repeat(64))).toBe(true);
  });
});

describe('validateLinkName', () => {
  it('returns ok for unique valid name', () => {
    expect(validateLinkName('NewName', [])).toEqual({ ok: true });
  });
  it('rejects empty', () => {
    const r = validateLinkName('', []);
    expect(r.ok).toBe(false);
  });
  it('rejects duplicate', () => {
    const r = validateLinkName('ExternalDocs', [baseMapping()]);
    expect(r).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('validateExternalPath', () => {
  it('accepts absolute Windows path', () => {
    expect(validateExternalPath('D:\\projects\\docs', VAULT)).toEqual({ ok: true });
  });
  it('rejects empty', () => {
    expect(validateExternalPath('', VAULT)).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects relative', () => {
    expect(validateExternalPath('foo\\bar', VAULT)).toEqual({ ok: false, reason: 'not_absolute' });
  });
  it('rejects null byte', () => {
    expect(validateExternalPath('D:\\foo\0bar', VAULT)).toEqual({ ok: false, reason: 'null_byte' });
  });
  it('rejects vault itself', () => {
    expect(validateExternalPath(VAULT, VAULT)).toEqual({ ok: false, reason: 'circular' });
  });
  it('rejects vault ancestor', () => {
    expect(validateExternalPath('C:\\Users\\me', VAULT)).toEqual({ ok: false, reason: 'circular' });
  });
  it('rejects C:\\Windows', () => {
    expect(validateExternalPath('C:\\Windows\\System32', VAULT)).toEqual({ ok: false, reason: 'forbidden_path' });
  });
  it('rejects C:\\Program Files', () => {
    expect(validateExternalPath('C:\\Program Files\\app', VAULT)).toEqual({ ok: false, reason: 'forbidden_path' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/validation.test.ts
```

Expected: FAIL — `./validation` module not found.

- [ ] **Step 3: Implement `src/features/folder-mapping/validation.ts`**

```typescript
import * as nodePath from 'path';
import type { FolderMapping } from './types';

/** F-049: linkName 正規表現
 *  - `u` フラグ必須（CJK サロゲートペア保護）
 *  - `/` `\` 制御文字 先頭ドット 末尾空白 は除外（正規表現に含まない）
 */
export const LINK_NAME_REGEX = /^[A-Za-z0-9_\-ぁ-んァ-ヴ一-鿿\s]{1,64}$/u;

/** 禁止 externalPath プレフィックス（Windows） */
const FORBIDDEN_WIN = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

/** 禁止 externalPath プレフィックス（POSIX・best-effort） */
const FORBIDDEN_POSIX = [
  '/.ssh',
  '/.aws',
  '/.gnupg',
];

function isForbiddenAbsolute(absPath: string): boolean {
  const list = process.platform === 'win32' ? FORBIDDEN_WIN : FORBIDDEN_POSIX;
  const normalized = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
  return list.some((p) => {
    const needle = process.platform === 'win32' ? p.toLowerCase() : p;
    return normalized === needle || normalized.startsWith(needle + (process.platform === 'win32' ? '\\' : '/'));
  });
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateLinkName(
  name: string,
  existing: FolderMapping[],
): ValidateResult {
  if (!name || !LINK_NAME_REGEX.test(name)) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (existing.some((m) => m.linkName === name)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true };
}

export type ValidateExternalPathResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'not_absolute' | 'null_byte' | 'circular' | 'forbidden_path' };

export function validateExternalPath(
  p: string,
  vaultBasePath: string,
): ValidateExternalPathResult {
  if (!p || p.trim() === '') return { ok: false, reason: 'empty' };
  if (p.indexOf('\0') !== -1) return { ok: false, reason: 'null_byte' };
  if (!nodePath.isAbsolute(p)) return { ok: false, reason: 'not_absolute' };

  // Vault 自身・祖先検出
  const rel = nodePath.relative(vaultBasePath, p);
  if (rel === '' || (!rel.startsWith('..') && !nodePath.isAbsolute(rel))) {
    // Vault 内を指している
    return { ok: false, reason: 'circular' };
  }
  if (rel.startsWith('..') || nodePath.isAbsolute(rel)) {
    // Vault の外 → OK（ただし forbidden チェック）
  }

  if (isForbiddenAbsolute(p)) return { ok: false, reason: 'forbidden_path' };
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/validation.test.ts
```

Expected: PASS — all 14+ tests green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/validation.ts src/features/folder-mapping/validation.test.ts && git commit -m "feat(folder-mapping): F-049 バリデーションモジュールと単体テスト"
```

---

## Task 3: Manager - basic apply (resolveLinkPath, create, remove, idempotency)

**Files:**
- Create: `src/features/folder-mapping/manager.ts`
- Create: `src/features/folder-mapping/manager.test.ts` (initial 6 tests)

**Interfaces:**
- Consumes: `FolderMappingDeps` from Task 1
- Produces: `FolderMappingManager` class with `resolveLinkPath`, `apply` methods

- [ ] **Step 1: Write failing tests for basic apply in `manager.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FolderMappingManager } from './manager';
import type { FolderMapping, FolderMappingDeps } from './types';
import type { FolderMappingFs } from './types';

/** Minimal in-memory fs stub */
function makeFs(): FolderMappingFs & {
  files: Map<string, 'dir' | 'symlink' | { symTarget: string }>;
} {
  const files = new Map<string, 'dir' | 'symlink' | { symTarget: string }>();
  const fs: FolderMappingFs & {
    files: Map<string, 'dir' | 'symlink' | { symTarget: string }>;
  } = {
    files,
    existsSync: (p) => files.has(p),
    mkdirSync: (p) => {
      files.set(p, 'dir');
    },
    symlinkSync: (target, p) => {
      files.set(p, { symTarget: target });
    },
    lstatSync: (p) => ({
      isSymbolicLink: () => {
        const v = files.get(p);
        return typeof v === 'object' && v !== null && 'symTarget' in v;
      },
    }),
    rmdirSync: (p) => {
      files.delete(p);
    },
    rmSync: (p) => {
      files.delete(p);
    },
    realpathSync: (p) => p,
  };
  return fs;
}

const VAULT = 'C:\\Users\\me\\Vault';

function makeDeps(overrides: Partial<FolderMappingDeps> = {}): FolderMappingDeps {
  return {
    vaultBasePath: VAULT,
    fs: makeFs(),
    notice: () => {},
    openPath: async () => '',
    generateId: () => 'test-id',
    now: () => 1700000000000,
    ...overrides,
  };
}

function makeMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    id: 'm1',
    linkName: 'ExternalDocs',
    externalPath: 'D:\\projects\\docs',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('FolderMappingManager - basic apply', () => {
  let mgr: FolderMappingManager;
  let fs: ReturnType<typeof makeFs>;

  beforeEach(() => {
    fs = makeFs();
    mgr = new FolderMappingManager(makeDeps({ fs }));
  });

  it('resolveLinkPath returns vaultBasePath + @10_Input/ + linkName', () => {
    const p = mgr.resolveLinkPath(makeMapping({ linkName: 'Foo' }));
    expect(p).toBe('C:\\Users\\me\\Vault\\@10_Input\\Foo');
  });

  it('apply(enabled=true, target exists externally) creates junction → created', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    expect(mgr.apply(m)).toBe('created');
    const link = mgr.resolveLinkPath(m);
    expect(fs.files.get(link)).toEqual({ symTarget: m.externalPath });
  });

  it('apply(enabled=true, junction already exists) → linked (idempotent)', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.apply(m)).toBe('linked');
  });

  it('apply(enabled=false, junction exists) removes junction → removed', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.apply({ ...m, enabled: false })).toBe('removed');
    const link = mgr.resolveLinkPath(m);
    expect(fs.files.has(link)).toBe(false);
  });

  it('apply(enabled=false, no junction) → inactive', () => {
    const m = makeMapping({ enabled: false });
    expect(mgr.apply(m)).toBe('inactive');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts
```

Expected: FAIL — `./manager` module not found.

- [ ] **Step 3: Implement basic `manager.ts` skeleton**

```typescript
import * as nodePath from 'path';
import type {
  FolderMapping,
  FolderMappingDeps,
  FolderMappingState,
  ApplyAllResult,
  MappingStatus,
} from './types';

const VAULT_SUBPATH = '@10_Input';

export class FolderMappingManager {
  private readonly deps: Required<Omit<FolderMappingDeps, 'generateId' | 'now'>> &
    Pick<FolderMappingDeps, 'generateId' | 'now'>;

  constructor(deps?: Partial<FolderMappingDeps>) {
    this.deps = {
      vaultBasePath: deps?.vaultBasePath ?? '',
      fs: deps?.fs ?? (require('fs') as FolderMappingDeps['fs']),
      notice: deps?.notice ?? ((m: string) => { console.log(m); }),
      openPath: deps?.openPath ?? (async () => ''),
      generateId: deps?.generateId,
      now: deps?.now,
    };
  }

  resolveLinkPath(mapping: FolderMapping): string {
    return nodePath.join(this.deps.vaultBasePath, VAULT_SUBPATH, mapping.linkName);
  }

  apply(mapping: FolderMapping): FolderMappingState {
    const linkPath = this.resolveLinkPath(mapping);
    const exists = this.deps.fs.existsSync(linkPath);
    const isLink = exists && this.deps.fs.lstatSync(linkPath).isSymbolicLink();

    if (!mapping.enabled) {
      if (isLink) {
        this.deps.fs.rmdirSync(linkPath);
        return 'removed';
      }
      return 'inactive';
    }

    // enabled
    if (isLink) {
      // 既存 link 先チェック（target 一致は linked とみなす）
      return 'linked';
    }
    if (exists) {
      // 実フォルダあり — 上書きしない
      return 'vault_exists';
    }
    if (!this.deps.fs.existsSync(mapping.externalPath)) {
      return 'external_missing';
    }
    this.deps.fs.mkdirSync(nodePath.dirname(linkPath), { recursive: true });
    this.deps.fs.symlinkSync(mapping.externalPath, linkPath, 'junction');
    return 'created';
  }

  applyAll(mappings: FolderMapping[]): ApplyAllResult {
    const applied: ApplyAllResult['applied'] = [];
    let totalCreated = 0;
    let totalRemoved = 0;
    let totalErrors = 0;
    for (const m of mappings) {
      const state = this.apply(m);
      applied.push({ id: m.id, state });
      if (state === 'created') totalCreated++;
      else if (state === 'removed') totalRemoved++;
      else if (state === 'error') totalErrors++;
    }
    return { applied, totalCreated, totalRemoved, totalErrors };
  }

  status(mapping: FolderMapping): MappingStatus {
    const linkPath = this.resolveLinkPath(mapping);
    if (!this.deps.fs.existsSync(linkPath)) {
      return { linked: false, state: 'inactive' };
    }
    if (!this.deps.fs.lstatSync(linkPath).isSymbolicLink()) {
      return { linked: false, state: 'vault_exists' };
    }
    return { linked: true, state: 'linked' };
  }

  async openExternal(mapping: FolderMapping): Promise<void> {
    await this.deps.openPath(mapping.externalPath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/manager.ts src/features/folder-mapping/manager.test.ts && git commit -m "feat(folder-mapping): F-049 manager 基本 apply (create/remove/idempotent)"
```

---

## Task 4: Manager - validation states (external_missing, circular, forbidden_path)

**Files:**
- Modify: `src/features/folder-mapping/manager.ts` (add validation pre-checks in `apply`)
- Modify: `src/features/folder-mapping/manager.test.ts` (add 5 tests)

**Interfaces:**
- Consumes: `validateExternalPath` from Task 2, `process.platform`
- Produces: enhanced `apply` that returns `circular` / `forbidden_path` before attempting FS ops

- [ ] **Step 1: Append failing tests to `manager.test.ts`**

```typescript
describe('FolderMappingManager - validation states', () => {
  let mgr: FolderMappingManager;
  let fs: ReturnType<typeof makeFs>;

  beforeEach(() => {
    fs = makeFs();
    mgr = new FolderMappingManager(makeDeps({ fs }));
  });

  it('apply when externalPath is empty → external_missing, no junction', () => {
    const m = makeMapping({ externalPath: '' });
    expect(mgr.apply(m)).toBe('external_missing');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });

  it('apply when externalPath does not exist → external_missing', () => {
    const m = makeMapping({ externalPath: 'D:\\does\\not\\exist' });
    expect(mgr.apply(m)).toBe('external_missing');
  });

  it('apply when externalPath == vaultBasePath → circular', () => {
    const m = makeMapping({ externalPath: VAULT });
    expect(mgr.apply(m)).toBe('circular');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });

  it('apply when externalPath is vault ancestor → circular', () => {
    const m = makeMapping({ externalPath: 'C:\\Users\\me' });
    expect(mgr.apply(m)).toBe('circular');
  });

  it('apply when externalPath is C:\\Windows → forbidden_path', () => {
    const m = makeMapping({ externalPath: 'C:\\Windows\\System32' });
    expect(mgr.apply(m)).toBe('forbidden_path');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts -t "validation states"
```

Expected: FAIL — new tests fail (current code returns `external_missing` for empty, `created` for circular cases etc.).

- [ ] **Step 3: Update `manager.ts` `apply()` to validate first**

Replace the `apply()` method body with:

```typescript
apply(mapping: FolderMapping): FolderMappingState {
  const linkPath = this.resolveLinkPath(mapping);
  const exists = this.deps.fs.existsSync(linkPath);
  const isLink = exists && this.deps.fs.lstatSync(linkPath).isSymbolicLink();

  if (!mapping.enabled) {
    if (isLink) {
      this.deps.fs.rmdirSync(linkPath);
      return 'removed';
    }
    return 'inactive';
  }

  // enabled — 先に validation
  if (!mapping.externalPath || mapping.externalPath.trim() === '') {
    return 'external_missing';
  }
  // circular 検出（Vault 自身・祖先）
  const rel = nodePath.relative(this.deps.vaultBasePath, mapping.externalPath);
  if (rel === '' || (!rel.startsWith('..') && !nodePath.isAbsolute(rel))) {
    return 'circular';
  }
  // forbidden path 検出（Windows のみ厳格・POSIX は validation.ts 任せ）
  if (process.platform === 'win32') {
    const lower = mapping.externalPath.toLowerCase();
    if (
      lower === 'c:\\windows' ||
      lower.startsWith('c:\\windows\\') ||
      lower === 'c:\\program files' ||
      lower.startsWith('c:\\program files\\') ||
      lower === 'c:\\program files (x86)' ||
      lower.startsWith('c:\\program files (x86)\\')
    ) {
      return 'forbidden_path';
    }
  }

  if (isLink) return 'linked';
  if (exists) return 'vault_exists';
  if (!this.deps.fs.existsSync(mapping.externalPath)) return 'external_missing';
  this.deps.fs.mkdirSync(nodePath.dirname(linkPath), { recursive: true });
  this.deps.fs.symlinkSync(mapping.externalPath, linkPath, 'junction');
  return 'created';
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts
```

Expected: PASS — 10 tests green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/manager.ts src/features/folder-mapping/manager.test.ts && git commit -m "feat(folder-mapping): F-049 manager バリデーション状態 (circular/forbidden_path)"
```

---

## Task 5: Manager - applyAll, status, openExternal + Notice messages

**Files:**
- Modify: `src/features/folder-mapping/manager.ts`
- Modify: `src/features/folder-mapping/manager.test.ts`

- [ ] **Step 1: Append failing tests for `applyAll` / `status` / `openExternal`**

```typescript
describe('FolderMappingManager - applyAll + status + openExternal', () => {
  it('applyAll returns counts and per-id states', () => {
    const fs = makeFs();
    const notices: string[] = [];
    const mgr = new FolderMappingManager(
      makeDeps({ fs, notice: (m) => notices.push(m) }),
    );
    const m1 = makeMapping({ id: 'a', linkName: 'A', externalPath: 'D:\\p1' });
    const m2 = makeMapping({ id: 'b', linkName: 'B', externalPath: 'D:\\p2' });
    fs.files.set('D:\\p1', 'dir');
    fs.files.set('D:\\p2', 'dir');

    const r = mgr.applyAll([m1, m2]);

    expect(r.totalCreated).toBe(2);
    expect(r.applied).toEqual([
      { id: 'a', state: 'created' },
      { id: 'b', state: 'created' },
    ]);
    expect(notices.some((n) => n.includes('A → D:\\p1'))).toBe(true);
  });

  it('applyAll continues after single failure', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    const good = makeMapping({ id: 'g', externalPath: 'D:\\ok' });
    const bad = makeMapping({ id: 'b', externalPath: 'C:\\Windows' });
    fs.files.set('D:\\ok', 'dir');

    const r = mgr.applyAll([bad, good]);

    expect(r.applied.find((a) => a.id === 'g')?.state).toBe('created');
    expect(r.applied.find((a) => a.id === 'b')?.state).toBe('forbidden_path');
  });

  it('status returns linked=true when junction exists', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.status(m)).toEqual({ linked: true, state: 'linked' });
  });

  it('status returns linked=false when no junction', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    expect(mgr.status(makeMapping())).toEqual({ linked: false, state: 'inactive' });
  });

  it('openExternal calls deps.openPath with externalPath', async () => {
    let opened = '';
    const mgr = new FolderMappingManager(
      makeDeps({ openPath: async (p) => { opened = p; return ''; } }),
    );
    const m = makeMapping({ externalPath: 'D:\\x' });
    await mgr.openExternal(m);
    expect(opened).toBe('D:\\x');
  });
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts -t "applyAll"
```

Expected: FAIL — `applyAll` doesn't emit notices yet.

- [ ] **Step 3: Enhance `manager.ts` `apply()` with Notice + `applyAll()` aggregation**

Add Notice emission in `apply()`:

```typescript
// at the end of enabled branch, just before `return 'created';`
this.deps.notice(`@10_Input/${mapping.linkName} → ${mapping.externalPath} のリンクを作成しました`);

// and at the removed branch
this.deps.notice(`@10_Input/${mapping.linkName} のリンクを削除しました`);

// and for warning states (after returning):
if (state === 'external_missing') {
  this.deps.notice(`外部パス ${mapping.externalPath} が存在しません。設定を確認してください（リンクは作成していません）。`);
} else if (state === 'vault_exists') {
  this.deps.notice(`@10_Input/${mapping.linkName} に実フォルダが存在します。リンク作成をスキップしました。手動で確認してください。`);
} else if (state === 'circular') {
  this.deps.notice(`外部パスが Vault 自身を指しているため拒否しました: ${mapping.externalPath}`);
} else if (state === 'forbidden_path') {
  this.deps.notice(`禁止パス（Vault 祖先 / システムフォルダ等）: ${mapping.externalPath}`);
}
```

Restructure `apply()` to track state in a variable before emitting notices.

- [ ] **Step 4: Run all manager tests**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts
```

Expected: PASS — 15 tests green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/manager.ts src/features/folder-mapping/manager.test.ts && git commit -m "feat(folder-mapping): F-049 manager applyAll/status/openExternal + Notice"
```

---

## Task 6: Settings schema + migrator

**Files:**
- Modify: `src/core/settings.ts`
- Modify: `src/core/migrator.ts` (if needed for normalize)
- Modify or create: `src/core/settings.test.ts`

**Interfaces:**
- Consumes: `FolderMapping` from Task 1, `DEFAULT_FOLDER_MAPPINGS` from Task 1
- Produces: `GeneralSettings.folderMappings: FolderMapping[]`

- [ ] **Step 1: Read `src/core/settings.ts` lines 100-300 to locate `GeneralSettings` interface and `DEFAULT_GENERAL_SETTINGS`**

(Use Read tool to inspect the file.)

- [ ] **Step 2: Add import + DEFAULT_FOLDER_MAPPINGS import + field**

Add to `src/core/settings.ts` near the top (after existing imports):

```typescript
import type { FolderMapping } from '../features/folder-mapping/types';
import { DEFAULT_FOLDER_MAPPINGS } from '../features/folder-mapping/defaults';
```

In `GeneralSettings` interface, add field:

```typescript
/** F-049: ユーザー定義フォルダマッピング（@10_Input 配下に表示） */
folderMappings: FolderMapping[];
```

In `DEFAULT_GENERAL_SETTINGS` (or equivalent default object), add:

```typescript
folderMappings: DEFAULT_FOLDER_MAPPINGS,
```

- [ ] **Step 3: Read `src/core/migrator.ts` to find `normalizeClaudianBridgeSettings`**

(Use Read tool to inspect. The function is exported and likely applies old→new key transforms.)

- [ ] **Step 4: Add folderMappings fallback in normalizer**

In `normalizeClaudianBridgeSettings`, ensure the output has `general.folderMappings: []` if missing:

```typescript
// F-049: 既存ユーザーの data.json に folderMappings が無い場合は空配列で初期化
if (!Array.isArray(normalized.general?.folderMappings)) {
  normalized.general.folderMappings = [];
}
```

- [ ] **Step 5: Write failing tests in `src/core/settings.test.ts` (create if absent)**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeClaudianBridgeSettings } from './migrator'; // adjust import path as needed

describe('F-049: settings migration', () => {
  it('fills folderMappings=[] when missing in old data.json', () => {
    const out = normalizeClaudianBridgeSettings({
      general: { /* existing fields, no folderMappings */ },
      // ...other sections
    } as any);
    expect(out.general.folderMappings).toEqual([]);
  });

  it('preserves existing folderMappings', () => {
    const existing = [{ id: 'x', linkName: 'X', externalPath: 'D:\\x', enabled: true, createdAt: 0, updatedAt: 0 }];
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: existing },
    } as any);
    expect(out.general.folderMappings).toBe(existing);
  });

  it('preserves outputsMirror* keys untouched', () => {
    const out = normalizeClaudianBridgeSettings({
      general: {
        outputsMirrorEnabled: true,
        outputsMirrorPath: 'D:\\foo',
      },
    } as any);
    expect(out.general.outputsMirrorEnabled).toBe(true);
    expect(out.general.outputsMirrorPath).toBe('D:\\foo');
  });
});
```

(Adjust import path & shape of `normalizeClaudianBridgeSettings` to match actual signature.)

- [ ] **Step 6: Run tests**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/core/settings.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/settings.ts src/core/migrator.ts src/core/settings.test.ts && git commit -m "feat(settings): F-049 folderMappings スキーマ追加 + normalize フォールバック"
```

---

## Task 7: i18n keys (8 keys × 3 locales)

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Produces: 8 new string keys in `LocaleStrings` interface and ja/en/zh objects

- [ ] **Step 1: Read `src/core/i18n.ts` to find `LocaleStrings` interface and the ja/en/zh objects**

(Use Read tool to inspect the entire file.)

- [ ] **Step 2: Add keys to `LocaleStrings` interface**

Add inside the `LocaleStrings` interface (after existing keys):

```typescript
// === v0.50.0 (F-049): フォルダマッピング ===
folderMappingHeading: string;
folderMappingDesc: string;
folderMappingAdd: string;
folderMappingEmpty: string;
folderMappingLinkName: string;
folderMappingExternalPath: string;
folderMappingBrowse: string;
folderMappingRemoveConfirm: string;
```

- [ ] **Step 3: Add localized values to `ja`**

```typescript
folderMappingHeading: 'フォルダマッピング (F-049)',
folderMappingDesc: 'Vault/@10_Input/{linkName} として外部フォルダをリンクします。双向利用可（読み込み・書き出し）。リンク先はあくまで @10_Input 配下です。',
folderMappingAdd: '＋ 追加...',
folderMappingEmpty: 'まだマッピングがありません。＋追加... から登録してください。',
folderMappingLinkName: 'リンク名',
folderMappingExternalPath: '外部パス',
folderMappingBrowse: '📁 参照',
folderMappingRemoveConfirm: '@10_Input/{linkName} のリンクを削除しますか？外部パス {externalPath} のファイルは削除されません。',
```

- [ ] **Step 4: Add localized values to `en`**

```typescript
folderMappingHeading: 'Folder Mapping (F-049)',
folderMappingDesc: 'Link external folders as Vault/@10_Input/{linkName}. Bidirectional (read/write). Destination is always under @10_Input.',
folderMappingAdd: '+ Add...',
folderMappingEmpty: 'No mappings yet. Click + Add... to register.',
folderMappingLinkName: 'Link name',
folderMappingExternalPath: 'External path',
folderMappingBrowse: '📁 Browse',
folderMappingRemoveConfirm: 'Remove the @10_Input/{linkName} link? External files at {externalPath} will NOT be deleted.',
```

- [ ] **Step 5: Add localized values to `zh`**

```typescript
folderMappingHeading: '文件夹映射 (F-049)',
folderMappingDesc: '将外部文件夹链接为 Vault/@10_Input/{linkName}。支持双向读写。链接目标始终位于 @10_Input 下。',
folderMappingAdd: '＋ 添加...',
folderMappingEmpty: '尚无映射。点击 ＋添加... 进行注册。',
folderMappingLinkName: '链接名称',
folderMappingExternalPath: '外部路径',
folderMappingBrowse: '📁 浏览',
folderMappingRemoveConfirm: '是否删除 @10_Input/{linkName} 的链接？外部路径 {externalPath} 中的文件不会被删除。',
```

- [ ] **Step 6: Run typecheck**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck
```

Expected: exit 0

- [ ] **Step 7: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/i18n.ts && git commit -m "feat(i18n): F-049 folder mapping strings (8 keys × 3 locales)"
```

---

## Task 8: SettingTabWhitelist - section header + empty state + list rendering

**Files:**
- Modify: `src/settings/SettingTabWhitelist.ts`
- Create (if absent): `src/settings/SettingTabWhitelist.test.ts`

**Interfaces:**
- Consumes: `cfg.general.folderMappings`, `s.folderMapping*` i18n keys
- Produces: new section between whitelist toggles and Outputs Mirror

- [ ] **Step 1: Read `src/settings/SettingTabWhitelist.ts` end (around line 167 where Outputs Mirror starts)**

(Use Read tool — line 169 is the Outputs Mirror section start.)

- [ ] **Step 2: Insert new section before Outputs Mirror heading**

Find the line `containerEl.createEl('h3', { text: s.outputsMirrorHeading });` and insert the following block BEFORE it:

```typescript
// v0.50.0 (F-049): フォルダマッピング
containerEl.createEl('h3', { text: s.folderMappingHeading });
containerEl.createEl('p', {
  text: s.folderMappingDesc,
  attr: { style: 'color: var(--text-muted); font-size: 0.9em;' },
});

const fmList = cfg.general.folderMappings ?? [];
if (fmList.length === 0) {
  containerEl.createEl('p', {
    text: s.folderMappingEmpty,
    attr: { style: 'color: var(--text-muted); font-style: italic;' },
  });
} else {
  for (const m of fmList) {
    const row = containerEl.createDiv('cb-folder-mapping-row');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 2fr auto auto auto auto';
    row.style.gap = '6px';
    row.style.alignItems = 'center';
    row.createEl('span', { text: `🔗 ${m.linkName}` });
    row.createEl('span', { text: m.externalPath, attr: { style: 'font-family: monospace; font-size: 0.85em;' } });
    // Toggle
    new Setting(row).addToggle((t) =>
      t.setValue(m.enabled).onChange(async (v) => {
        const latest = store.load();
        const updated = latest.general.folderMappings.map((x) =>
          x.id === m.id ? { ...x, enabled: v, updatedAt: Date.now() } : x,
        );
        store.save({ ...latest, general: { ...latest.general, folderMappings: updated } });
        const fm = new FolderMappingManager({
          vaultBasePath: getVaultBasePath(_app),
          fs: require('fs') as FolderMappingFs,
          notice: (msg: string) => new Notice(msg),
        });
        fm.apply({ ...m, enabled: v });
        draw();
      }),
    );
    // Open
    const openBtn = row.createEl('button', { text: '📂' });
    openBtn.title = 'open external';
    openBtn.addEventListener('click', async () => {
      const electron = require('electron');
      await electron.shell.openPath(m.externalPath);
    });
    // Remove
    const removeBtn = row.createEl('button', { text: '✕', attr: { style: 'color: var(--text-error);' } });
    removeBtn.title = 'remove';
    removeBtn.addEventListener('click', () => {
      const ok = confirm(s.folderMappingRemoveConfirm
        .replace('{linkName}', m.linkName)
        .replace('{externalPath}', m.externalPath));
      if (!ok) return;
      const fm = new FolderMappingManager({
        vaultBasePath: getVaultBasePath(_app),
        fs: require('fs') as FolderMappingFs,
        notice: (msg: string) => new Notice(msg),
      });
      fm.apply({ ...m, enabled: false });
      const latest = store.load();
      store.save({
        ...latest,
        general: {
          ...latest.general,
          folderMappings: latest.general.folderMappings.filter((x) => x.id !== m.id),
        },
      });
      draw();
    });
  }
}

// Add button (placeholder for Task 9)
const addBtn = new Setting(containerEl)
  .setName(s.folderMappingAdd)
  .addButton((b) => b.setButtonText(s.folderMappingAdd).onClick(() => {
    new FolderMappingModal(_app, store, draw).open();
  }));
```

Also add at the top of file:

```typescript
import { FolderMappingManager } from '../features/folder-mapping/manager';
import type { FolderMappingFs } from '../features/folder-mapping/types';
import { FolderMappingModal } from './FolderMappingModal';
```

And add helper:

```typescript
function getVaultBasePath(app: App): string {
  const adapter = app.vault.adapter as unknown as { getBasePath?: () => string; basePath?: string };
  return adapter.getBasePath ? adapter.getBasePath() : adapter.basePath ?? '';
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck
```

Expected: Will FAIL with "Cannot find module './FolderMappingModal'" — this is expected, fixed in Task 9.

- [ ] **Step 4: Commit (WIP — Task 9 will complete the wiring)**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/settings/SettingTabWhitelist.ts && git commit -m "feat(settings-ui): F-049 フォルダマッピングセクション枠（list レンダリング）"
```

---

## Task 9: FolderMappingModal + add/edit handlers

**Files:**
- Create: `src/settings/FolderMappingModal.ts`

- [ ] **Step 1: Create `src/settings/FolderMappingModal.ts`**

```typescript
import { App, Modal, Notice, Setting } from 'obsidian';
import type { FolderMapping } from '../features/folder-mapping/types';
import { FolderMappingManager } from '../features/folder-mapping/manager';
import { validateLinkName, validateExternalPath } from '../features/folder-mapping/validation';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type { ConfigStore } from '../core/config-store';

export class FolderMappingModal extends Modal {
  private readonly existing: FolderMapping[];
  private readonly editingId?: string;
  private linkName = '';
  private externalPath = '';
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly store: ConfigStore,
    private readonly onSaved: () => void,
    opts: { existing: FolderMapping[]; editing?: FolderMapping },
  ) {
    super(app);
    this.existing = opts.existing;
    if (opts.editing) {
      this.editingId = opts.editing.id;
      this.linkName = opts.editing.linkName;
      this.externalPath = opts.editing.externalPath;
    }
  }

  onOpen(): void {
    const s = getLocaleStrings(getUILanguage());
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.editingId ? `✎ ${this.linkName}` : s.folderMappingAdd });

    new Setting(contentEl)
      .setName(s.folderMappingLinkName)
      .addText((t) => t.setValue(this.linkName).onChange((v) => { this.linkName = v; this.refreshError(); }));

    new Setting(contentEl)
      .setName(s.folderMappingExternalPath)
      .addText((t) => t.setValue(this.externalPath).onChange((v) => { this.externalPath = v; this.refreshError(); }))
      .addButton((b) => b.setButtonText(s.folderMappingBrowse).onClick(async () => {
        // Electron openDialog — minimal impl: defer to a folder picker
        // For simplicity, prompt() in this iteration; can be replaced with native picker later.
        const picked = window.prompt(s.folderMappingExternalPath, this.externalPath);
        if (picked) { this.externalPath = picked; this.refreshError(); }
      }));

    this.errorEl = contentEl.createEl('p', { attr: { style: 'color: var(--text-error); min-height: 1.2em;' } });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(this.editingId ? '💾 保存' : '💾 追加').setCta().onClick(() => this.save()))
      .addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()));
  }

  private refreshError(): void {
    if (!this.errorEl) return;
    const r1 = validateLinkName(this.linkName, this.existing.filter((m) => m.id !== this.editingId));
    if (!r1.ok) { this.errorEl.textContent = `リンク名: ${r1.reason}`; return; }
    const vaultBase = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? '';
    const r2 = validateExternalPath(this.externalPath, vaultBase);
    if (!r2.ok) { this.errorEl.textContent = `外部パス: ${r2.reason}`; return; }
    this.errorEl.textContent = '';
  }

  private save(): void {
    const r1 = validateLinkName(this.linkName, this.existing.filter((m) => m.id !== this.editingId));
    if (!r1.ok) { new Notice(`リンク名エラー: ${r1.reason}`); return; }
    const vaultBase = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? '';
    const r2 = validateExternalPath(this.externalPath, vaultBase);
    if (!r2.ok) { new Notice(`外部パスエラー: ${r2.reason}`); return; }

    // 仕様 §7.3 ロールバック: 先に FS 反映を試行し、成功時のみ data.json に保存
    const fs = require('fs') as import('../features/folder-mapping/types').FolderMappingFs;
    const fm = new FolderMappingManager({
      vaultBasePath: vaultBase,
      fs,
      notice: (m) => new Notice(m),
    });

    const latest = this.store.load();
    const now = Date.now();
    const newId = crypto.randomUUID();
    let target: FolderMapping;
    let updatedList: FolderMapping[];

    if (this.editingId) {
      target = {
        ...latest.general.folderMappings.find((m) => m.id === this.editingId)!,
        linkName: this.linkName,
        externalPath: this.externalPath,
        updatedAt: now,
      };
      updatedList = latest.general.folderMappings.map((m) =>
        m.id === this.editingId ? target : m,
      );
      // 編集: linkName / externalPath 変更時は junction 削除→再作成（Windows junction は atomic 変更不可）
      // apply() は enabled=true なら既存なら linked、無ければ created を返す
      const oldTarget = latest.general.folderMappings.find((m) => m.id === this.editingId)!;
      if (oldTarget.linkName !== this.linkName || oldTarget.externalPath !== this.externalPath) {
        fm.apply({ ...oldTarget, enabled: false }); // 旧 junction 削除（失敗時は Notice のみ・続行）
      }
    } else {
      target = {
        id: newId,
        linkName: this.linkName,
        externalPath: this.externalPath,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [...latest.general.folderMappings, target];
    }

    const state = fm.apply(target);
    if (state === 'error' || state === 'external_missing' || state === 'circular' || state === 'forbidden_path' || state === 'vault_exists') {
      // 仕様 §7.3: FS 失敗時は data.json に保存しない（ロールバック）
      new Notice(`フォルダマッピングの作成に失敗しました: ${state}`);
      return;
    }

    this.store.save({ ...latest, general: { ...latest.general, folderMappings: updatedList } });
    this.close();
    this.onSaved();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck
```

Expected: exit 0

- [ ] **Step 3: Run all manager tests to ensure no regression**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/settings/FolderMappingModal.ts && git commit -m "feat(settings-ui): F-049 FolderMappingModal (add/edit)"
```

---

## Task 10: main.ts integration - applyAllMappings on startup

**Files:**
- Modify: `main.ts` (in `onload()`)

- [ ] **Step 1: Read `main.ts` `onload()` method**

(Use Grep/Read to locate `onload` and the existing initialization of `OutputsMirrorManager`.)

- [ ] **Step 2: Add `applyAllMappings` call after the existing `OutputsMirrorManager.apply`**

```typescript
// F-049: フォルダマッピング起動時適用
import { FolderMappingManager } from './features/folder-mapping/manager';
// ...existing imports

// in onload():
const folderMappingsManager = new FolderMappingManager({
  vaultBasePath: getVaultBasePath(this.app),
  fs: require('fs'),
  notice: (m) => new Notice(m),
});
folderMappingsManager.applyAll(this.settings.general.folderMappings);
```

Where `getVaultBasePath` is the same helper used in SettingTabWhitelist (extract to a shared util if not yet present — e.g., `src/core/plugin-dir.ts`).

- [ ] **Step 3: Run all tests**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npx vitest run
```

Expected: All 1366+ tests pass (1348 existing + 18 new).

- [ ] **Step 4: Run typecheck and build**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npm run build
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add main.ts && git commit -m "feat(plugin): F-049 起動時 applyAllMappings 呼び出し"
```

---

## Task 11: CHANGELOG + version bumps + verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `src/manifest.json`
- Modify: `Plugin/manifest.json`

- [ ] **Step 1: Add v0.50.0 entry to `CHANGELOG.md` (prepend at top, after the frontmatter)**

```markdown
## [0.50.0] - 2026-09-16 — フォルダマッピング機能 (F-049)

設定画面で複数の任意外部フォルダを `Vault/@10_Input/{linkName}` として双方向リンクできる新機能を追加。既存 Outputs ミラーリング機能の多フォルダ拡張版で、Windows ジャンクションを使用。双方向（読み込み・書き出し）両用途をサポート。既存ユーザーへの影響ゼロ（デフォルト空配列）。

- feat(folder-mapping): FolderMappingManager — apply/applyAll/status/openExternal with 9-state machine
- feat(folder-mapping): validation module — linkName regex (u-flag) + forbidden path blacklist
- feat(settings): general.folderMappings schema + normalize fallback to []
- feat(i18n): 8 keys × 3 locales (ja/en/zh)
- feat(settings-ui): "フォルダマッピング" section + FolderMappingModal (add/edit/remove/toggle)
- feat(plugin): applyAllMappings on plugin onload()
- tests: +18 cases (1348 → 1366 total)

既存 Outputs ミラーリング機能は完全無変更・並走。
```

- [ ] **Step 2: Bump version in `package.json`** (find `"version"` field, change `0.49.1` → `0.50.0`)

- [ ] **Step 3: Bump version in `src/manifest.json`** (find `"version"` field)

- [ ] **Step 4: Bump version in `Plugin/manifest.json`** (find `"version"` field)

- [ ] **Step 5: Run full verification**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add CHANGELOG.md package.json src/manifest.json Plugin/manifest.json && git commit -m "chore(release): v0.50.0 F-049 フォルダマッピング"
```

- [ ] **Step 7: Push branch and open PR**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git push -u origin feat/v0.50.0-folder-mapping
```

Then open a PR via `gh pr create`.

---

## Self-Review Checklist (run before declaring done)

- [ ] All R1〜R11 requirements have a corresponding task
- [ ] No "TBD" / "TODO" placeholders remain
- [ ] Test counts: validation 14 + manager 15 + settings 3 + (i18n/UI/manager tests in real implementation) ≈ 18+ new tests
- [ ] All tasks reference real file paths that exist in `D:\AI-Agent\ClaudianBridge\`
- [ ] Existing 1348 tests remain green (no edits to `OutputsMirrorManager`, `general.outputsMirror*`)
- [ ] Default `folderMappings = []` ensures zero impact on existing users
- [ ] Branch policy `feat/v0.50.0-folder-mapping` followed

---

*📚 Plan v1.0 · ClaudianBridge F-049 · 2026-09-16*
