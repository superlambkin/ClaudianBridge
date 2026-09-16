# Folder Bridge Implementation Plan (F-051 / Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Shadow Sync (NAS → local shadow) single-direction read-only mirroring to ClaudianBridge, so users can index NAS folders in Obsidian without losing offline access. Foundation for future Phase 2 (bidirectional sync) and Phase 3 (FS Layer Bridge option).

**Architecture:** New module `src/features/folder-bridge/` follows the F-049 FolderMappingManager pattern (DI-injected fs, 8-state machine, Notice emission). On enable, performs initial sync of NAS folder contents into a local shadow at `Vault/.obsidian/cache/folder-bridge/{id}/`, then creates a junction at `Vault/{vaultSubpath}/{linkName}` pointing to the shadow. chokidar watches the NAS for changes; reconcile handler mirrors them to shadow. Phase 1 is unidirectional (NAS → shadow) — write-back is Phase 2.

**Tech Stack:** TypeScript, Node.js `path`/`fs` (DI-injected), chokidar v3+ (new dep), vitest.

## Global Constraints

- Target: v0.52.0 release, F-051, branch `feat/v0.52.0-folder-bridge`
- Strict TDD: write failing test → run → implement → run → commit
- All FS ops + chokidar go through DI-injected interfaces (no direct `vi.mock('fs')`)
- 既存 `FolderMappingManager` (F-049/F-050) には**一切触らない**
- 既存 `OutputsMirrorManager` には**一切触らない**
- Phase 1 = **読み取り専用**（NAS → Shadow のみ、双方向は Phase 2）
- Default shadow path: `Vault/.obsidian/cache/folder-bridge/{id}/`
- Default `syncDirection = 'nas_to_shadow'`
- Default `enabled = false`（normalize migration で既存ユーザーには追加しない）
- 既存 F-049 settings の `folderMappings[]` とは独立した `folderBridges[]` 配列
- All new code paths must have an i18n key for ja/en/zh
- i18n keys naming: `folderBridge*` prefix
- Existing tests: 1411 passed + 1 skipped (must remain green)
- Branch policy: create `feat/v0.52.0-folder-bridge` from `main`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `package.json` | Add `chokidar` dependency | Modify |
| `src/features/folder-bridge/types.ts` | `FolderBridge`, `FolderBridgeState`, `FolderBridgeFs`, `FolderBridgeDeps` | Create |
| `src/features/folder-bridge/validation.ts` | `validateExternalPath`, `validateExcludePatterns`, `validateShadowPath` | Create |
| `src/features/folder-bridge/validation.test.ts` | 8-12 tests for validators | Create |
| `src/features/folder-bridge/reconciler.ts` | Initial sync + diff/mirror logic (NAS → shadow) | Create |
| `src/features/folder-bridge/reconciler.test.ts` | 6-8 tests for sync logic | Create |
| `src/features/folder-bridge/watcher.ts` | chokidar wrapper for NAS events | Create |
| `src/features/folder-bridge/watcher.test.ts` | 4-6 tests for event handling | Create |
| `src/features/folder-bridge/manager.ts` | `FolderBridgeManager`: apply/applyAll/status/pause/resume | Create |
| `src/features/folder-bridge/manager.test.ts` | 8-10 tests for state machine + apply | Create |
| `src/core/settings.ts` | `folderBridges[]` in ClaudianBridgeSettings + normalize | Modify |
| `src/core/settings.test.ts` | +2 migration tests | Modify |
| `src/core/i18n.ts` | +6 keys × 3 locales | Modify |
| `src/settings/FolderBridgeModal.ts` | 4-field settings modal | Create |
| `src/settings/SettingTabBridge.ts` | New tab "Bridge" with row list + add/edit | Create |
| `src/settings/SettingTabBridge.test.ts` | 4-6 tests for row rendering | Create |
| `src/main.ts` | Wire `FolderBridgeManager` to startup + cleanup | Modify |
| `CHANGELOG.md` | `[0.52.0]` entry | Modify |
| `package.json` / `src/manifest.json` / `Plugin/manifest.json` | 0.51.0 → 0.52.0 | Modify |

---

## Task 1: Add chokidar dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `chokidar` available as `import chokidar from 'chokidar'`

- [ ] **Step 1: Add chokidar to package.json dependencies**

Run:
```bash
cd "D:/AI-Agent/ClaudianBridge" && npm install --save chokidar@^3.6.0
```

- [ ] **Step 2: Verify install**

Run: `cd "D:/AI-Agent/ClaudianBridge" && ls node_modules/chokidar/package.json`
Expected: file exists.

- [ ] **Step 3: Verify typecheck still passes**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add package.json package-lock.json && git commit -m "chore(deps): F-051 chokidar 追加"
```

---

## Task 2: Define FolderBridge types

**Files:**
- Create: `src/features/folder-bridge/types.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface FolderBridge {
    id: string;
    linkName: string;
    vaultSubpath: string;
    externalPath: string;            // \\NAS\share\OCR
    shadowPath: string;              // {Vault}/.obsidian/cache/folder-bridge/{id}/
    excludePatterns: string[];       // minimatch globs
    syncDirection: 'nas_to_shadow';  // Phase 1 only
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
  }

  export type FolderBridgeState =
    | 'disabled' | 'syncing' | 'linked' | 'out_of_sync'
    | 'vault_conflict' | 'external_missing' | 'paused' | 'error';

  export interface FolderBridgeWatchHandle {
    close(): void;
  }

  export interface FolderBridgeFs {
    existsSync(p: string): boolean;
    statSync(p: string): { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean; mtimeMs: number; size: number };
    readdirSync(p: string): string[];
    mkdirSync(p: string, opts?: { recursive?: boolean }): void;
    copyFileSync(src: string, dst: string): void;
    rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
    symlinkSync(target: string, path: string, type: 'junction' | 'dir' | 'file'): void;
    // chokidar compat wrapper — DI-default in watcher.ts
    watch(p: string, opts: { persistent: boolean; ignoreInitial: boolean }): {
      on(event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', cb: (path: string) => void): void;
      close(): void;
    };
  }

  export interface FolderBridgeDeps {
    fs: FolderBridgeFs;
    notice: (msg: string) => void;
    vaultBasePath: string;
    logger?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;
  }

  export interface ApplyAllResult {
    totalLinked: number;
    totalErrors: number;
    notices: string[];
  }
  ```

- [ ] **Step 1: Create `src/features/folder-bridge/types.ts`** with the above content. Ensure the file header comment matches existing modules (e.g., `src/features/folder-mapping/types.ts:1-2`).

- [ ] **Step 2: Run typecheck**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck`
Expected: exit 0 (no consumers yet — type just needs to be valid).

- [ ] **Step 3: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-bridge/types.ts && git commit -m "feat(folder-bridge): F-051 型定義追加"
```

---

## Task 3: Validators + tests

**Files:**
- Create: `src/features/folder-bridge/validation.ts`
- Create: `src/features/folder-bridge/validation.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function validateExternalPath(p: string):
    | { ok: true; normalized: string }
    | { ok: false; reason: 'empty' | 'not_absolute' };

  export function validateExcludePatterns(arr: unknown):
    | { ok: true; normalized: string[] }
    | { ok: false; reason: 'not_array' | 'invalid_glob' };

  export function validateShadowPath(p: string, vaultBase: string):
    | { ok: true; normalized: string }
    | { ok: false; reason: 'empty' | 'absolute_outside_vault' | 'not_relative' };

  export function computeDefaultShadowPath(vaultBase: string, id: string): string;
  ```

- [ ] **Step 1: Write failing tests in `validation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import nodePath from 'path';
import {
  validateExternalPath,
  validateExcludePatterns,
  validateShadowPath,
  computeDefaultShadowPath,
} from './validation';

describe('validateExternalPath', () => {
  it('accepts UNC path', () => {
    expect(validateExternalPath('\\\\NAS\\share\\OCR')).toEqual({
      ok: true,
      normalized: '\\\\NAS\\share\\OCR',
    });
  });
  it('accepts absolute Windows path', () => {
    expect(validateExternalPath('C:\\projects\\docs')).toEqual({
      ok: true,
      normalized: 'C:\\projects\\docs',
    });
  });
  it('rejects empty', () => {
    expect(validateExternalPath('')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects relative path', () => {
    expect(validateExternalPath('foo\\bar')).toEqual({ ok: false, reason: 'not_absolute' });
  });
  it('trims whitespace', () => {
    expect(validateExternalPath('  C:\\foo  ')).toEqual({ ok: true, normalized: 'C:\\foo' });
  });
});

describe('validateExcludePatterns', () => {
  it('accepts empty array', () => {
    expect(validateExcludePatterns([])).toEqual({ ok: true, normalized: [] });
  });
  it('accepts glob patterns', () => {
    expect(validateExcludePatterns(['*.tmp', '.DS_Store'])).toEqual({
      ok: true,
      normalized: ['*.tmp', '.DS_Store'],
    });
  });
  it('rejects non-array', () => {
    expect(validateExcludePatterns('*.tmp' as any)).toEqual({ ok: false, reason: 'not_array' });
  });
  it('rejects pattern with null byte', () => {
    expect(validateExcludePatterns(['foo\u0000bar'])).toEqual({ ok: false, reason: 'invalid_glob' });
  });
  it('trims patterns', () => {
    expect(validateExcludePatterns(['  *.tmp  '])).toEqual({
      ok: true,
      normalized: ['*.tmp'],
    });
  });
});

describe('validateShadowPath', () => {
  it('accepts default shadow path', () => {
    const r = validateShadowPath('.obsidian/cache/folder-bridge/abc', 'C:\\Vault');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.replace(/\\/g, '/')).toBe('.obsidian/cache/folder-bridge/abc');
  });
  it('rejects absolute outside vault', () => {
    expect(validateShadowPath('C:\\other\\path', 'C:\\Vault')).toEqual({
      ok: false,
      reason: 'absolute_outside_vault',
    });
  });
  it('rejects empty', () => {
    expect(validateShadowPath('', 'C:\\Vault')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects .. traversal', () => {
    expect(validateShadowPath('../../etc', 'C:\\Vault')).toEqual({
      ok: false,
      reason: 'not_relative',
    });
  });
});

describe('computeDefaultShadowPath', () => {
  it('produces path under .obsidian/cache', () => {
    const r = computeDefaultShadowPath('C:\\Vault', 'bridge-123');
    expect(r.replace(/\\/g, '/')).toBe('C:/Vault/.obsidian/cache/folder-bridge/bridge-123');
  });
});
```

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement in `validation.ts`**

```typescript
import nodePath from 'path';

const SEGMENT_FORBIDDEN = /[\u0000]/;

export function validateExternalPath(p: string):
  | { ok: true; normalized: string }
  | { ok: false; reason: 'empty' | 'not_absolute' } {
  const trimmed = (p ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  // UNC path \\server\share or Windows absolute C:\
  const isUnc = /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
  const isWinAbs = /^[A-Z]:[\\/]/i.test(trimmed);
  if (!isUnc && !isWinAbs) return { ok: false, reason: 'not_absolute' };
  return { ok: true, normalized: trimmed };
}

export function validateExcludePatterns(arr: unknown):
  | { ok: true; normalized: string[] }
  | { ok: false; reason: 'not_array' | 'invalid_glob' } {
  if (!Array.isArray(arr)) return { ok: false, reason: 'not_array' };
  const normalized: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') return { ok: false, reason: 'invalid_glob' };
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (SEGMENT_FORBIDDEN.test(trimmed)) return { ok: false, reason: 'invalid_glob' };
    normalized.push(trimmed);
  }
  return { ok: true, normalized };
}

export function validateShadowPath(p: string, vaultBase: string):
  | { ok: true; normalized: string }
  | { ok: false; reason: 'empty' | 'absolute_outside_vault' | 'not_relative' } {
  const trimmed = (p ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (nodePath.isAbsolute(trimmed)) {
    // Allow only if inside vault
    const rel = nodePath.relative(vaultBase, trimmed);
    if (rel.startsWith('..') || nodePath.isAbsolute(rel)) {
      return { ok: false, reason: 'absolute_outside_vault' };
    }
  }
  const normalized = nodePath.normalize(trimmed).replace(/\\/g, '/');
  if (normalized.split('/').some((seg) => seg === '..')) {
    return { ok: false, reason: 'not_relative' };
  }
  return { ok: true, normalized };
}

export function computeDefaultShadowPath(vaultBase: string, id: string): string {
  return nodePath.join(vaultBase, '.obsidian', 'cache', 'folder-bridge', id);
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/validation.test.ts`
Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-bridge/validation.ts src/features/folder-bridge/validation.test.ts && git commit -m "feat(folder-bridge): F-051 バリデーター追加（externalPath / excludePatterns / shadowPath）"
```

---

## Task 4: Reconciler (initial sync + diff) + tests

**Files:**
- Create: `src/features/folder-bridge/reconciler.ts`
- Create: `src/features/folder-bridge/reconciler.test.ts`

**Interfaces:**
- Consumes: `FolderBridgeFs` (Task 2), `FolderBridge` (Task 2)
- Produces:
  ```typescript
  export function matchesExclude(filename: string, patterns: string[]): boolean;
  export class ShadowReconciler {
    constructor(private fs: FolderBridgeFs) {}
    /** Full sync: copy all files from external → shadow */
    syncAll(externalPath: string, shadowPath: string, excludePatterns: string[]): { copied: number; skipped: number };
    /** Copy a single file (or directory tree) from external → shadow */
    syncOne(externalPath: string, shadowPath: string, excludePatterns: string[]): void;
    /** Remove a path from shadow if it exists */
    removeFromShadow(shadowPath: string): void;
  }
  ```

- [ ] **Step 1: Write failing tests in `reconciler.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import nodePath from 'path';
import { ShadowReconciler, matchesExclude } from './reconciler';

// In-memory FS stub mirroring F-049 pattern (manager.test.ts:6-37)
function makeFs() {
  const files = new Map<string, { type: 'file' | 'dir'; content?: string; mtimeMs: number }>();
  return {
    files,
    existsSync: (p: string) => files.has(p),
    statSync: (p: string) => {
      const f = files.get(p);
      if (!f) throw new Error(`ENOENT: ${p}`);
      return { isDirectory: () => f.type === 'dir', isFile: () => f.type === 'file', isSymbolicLink: () => false, mtimeMs: f.mtimeMs, size: f.content?.length ?? 0 };
    },
    readdirSync: (p: string) => {
      const prefix = p.endsWith('\\') ? p : p + '\\';
      const names = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          if (rest && !rest.includes('\\')) names.add(rest);
        }
      }
      return Array.from(names);
    },
    mkdirSync: (p: string) => {
      files.set(p.endsWith('\\') ? p : p + '\\', { type: 'dir', mtimeMs: 0 });
      files.set(p, { type: 'dir', mtimeMs: 0 });
    },
    copyFileSync: (src: string, dst: string) => {
      const f = files.get(src);
      if (!f) throw new Error(`ENOENT src: ${src}`);
      files.set(dst, { type: 'file', content: f.content, mtimeMs: f.mtimeMs });
    },
    rmSync: (p: string) => {
      const prefix = p.endsWith('\\') ? p : p + '\\';
      for (const k of Array.from(files.keys())) {
        if (k === p || k.startsWith(prefix)) files.delete(k);
      }
    },
    symlinkSync: () => {},
    watch: () => ({ on: () => {}, close: () => {} }),
  };
}

describe('matchesExclude', () => {
  it('matches simple glob', () => {
    expect(matchesExclude('foo.tmp', ['*.tmp'])).toBe(true);
  });
  it('does not match unrelated', () => {
    expect(matchesExclude('foo.md', ['*.tmp'])).toBe(false);
  });
  it('matches dotfiles', () => {
    expect(matchesExclude('.DS_Store', ['.DS_Store'])).toBe(true);
  });
});

describe('ShadowReconciler.syncAll', () => {
  let fs: ReturnType<typeof makeFs>;
  let reconciler: ShadowReconciler;

  beforeEach(() => {
    fs = makeFs();
    reconciler = new ShadowReconciler(fs as any);
    // Source: C:\NAS\OCR with 2 files
    fs.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    fs.files.set('C:\\NAS\\OCR\\a.md', { type: 'file', content: 'AAA', mtimeMs: 100 });
    fs.files.set('C:\\NAS\\OCR\\b.md', { type: 'file', content: 'BBB', mtimeMs: 200 });
    // Shadow: empty
    fs.files.set('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', { type: 'dir', mtimeMs: 0 });
  });

  it('copies all files from external to shadow', () => {
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', []);
    expect(r.copied).toBe(2);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\a.md')).toBe(true);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\b.md')).toBe(true);
  });

  it('skips excluded patterns', () => {
    fs.files.set('C:\\NAS\\OCR\\c.tmp', { type: 'file', content: 'TMP', mtimeMs: 300 });
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', ['*.tmp']);
    expect(r.copied).toBe(2);
    expect(r.skipped).toBe(1);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\c.tmp')).toBe(false);
  });

  it('recurses into subdirectories', () => {
    fs.files.set('C:\\NAS\\OCR\\sub', { type: 'dir', mtimeMs: 0 });
    fs.files.set('C:\\NAS\\OCR\\sub\\deep.md', { type: 'file', content: 'DEEP', mtimeMs: 400 });
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', []);
    expect(r.copied).toBe(3);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\sub\\deep.md')).toBe(true);
  });
});

describe('ShadowReconciler.removeFromShadow', () => {
  it('removes existing shadow file', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    fs.files.set('D:\\shadow\\old.md', { type: 'file', content: 'X', mtimeMs: 0 });
    reconciler.removeFromShadow('D:\\shadow\\old.md');
    expect(fs.files.has('D:\\shadow\\old.md')).toBe(false);
  });

  it('does not throw if path missing', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    expect(() => reconciler.removeFromShadow('D:\\shadow\\nope.md')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/reconciler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement in `reconciler.ts`**

```typescript
import nodePath from 'path';
import { FolderBridgeFs } from './types';

/**
 * Phase 1: simple minimatch-style glob with * and ? only.
 * Avoids the full minimatch dependency for a starter implementation.
 * Replace with `minimatch` package in Phase 2 if patterns grow.
 */
export function matchesExclude(filename: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const re = new RegExp(
      '^' +
        p
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    );
    if (re.test(filename)) return true;
  }
  return false;
}

export class ShadowReconciler {
  constructor(private fs: FolderBridgeFs) {}

  syncAll(
    externalPath: string,
    shadowPath: string,
    excludePatterns: string[],
  ): { copied: number; skipped: number } {
    let copied = 0;
    let skipped = 0;
    const queue: { src: string; rel: string }[] = [{ src: externalPath, rel: '' }];
    while (queue.length > 0) {
      const { src, rel } = queue.shift()!;
      const entries = this.fs.readdirSync(src);
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) {
          skipped++;
          continue;
        }
        const srcPath = nodePath.join(src, entry);
        const dstPath = rel ? nodePath.join(shadowPath, rel, entry) : nodePath.join(shadowPath, entry);
        const stat = this.fs.statSync(srcPath);
        if (stat.isDirectory()) {
          this.fs.mkdirSync(dstPath, { recursive: true });
          queue.push({ src: srcPath, rel: rel ? nodePath.join(rel, entry) : entry });
        } else if (stat.isFile()) {
          this.fs.copyFileSync(srcPath, dstPath);
          copied++;
        }
      }
    }
    return { copied, skipped };
  }

  syncOne(externalPath: string, shadowPath: string, excludePatterns: string[]): void {
    const stat = this.fs.statSync(externalPath);
    if (stat.isDirectory()) {
      this.fs.mkdirSync(shadowPath, { recursive: true });
      const entries = this.fs.readdirSync(externalPath);
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) continue;
        this.syncOne(
          nodePath.join(externalPath, entry),
          nodePath.join(shadowPath, entry),
          excludePatterns,
        );
      }
    } else if (stat.isFile()) {
      this.fs.mkdirSync(nodePath.dirname(shadowPath), { recursive: true });
      this.fs.copyFileSync(externalPath, shadowPath);
    }
  }

  removeFromShadow(shadowPath: string): void {
    if (this.fs.existsSync(shadowPath)) {
      this.fs.rmSync(shadowPath, { recursive: true, force: true });
    }
  }
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/`
Expected: PASS — validation + reconciler green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-bridge/reconciler.ts src/features/folder-bridge/reconciler.test.ts && git commit -m "feat(folder-bridge): F-051 ShadowReconciler（initial sync + remove）"
```

---

## Task 5: Watcher (chokidar wrapper) + tests

**Files:**
- Create: `src/features/folder-bridge/watcher.ts`
- Create: `src/features/folder-bridge/watcher.test.ts`

**Interfaces:**
- Consumes: `FolderBridgeFs.watch` (Task 2)
- Produces:
  ```typescript
  export interface WatchEvent {
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    absPath: string;
  }

  export type WatchEventHandler = (event: WatchEvent) => void;

  export class FolderBridgeWatcher {
    private handle: ReturnType<FolderBridgeFs['watch']> | null = null;
    constructor(private fs: FolderBridgeFs) {}
    start(path: string, onEvent: WatchEventHandler): void;
    stop(): void;
  }
  ```

- [ ] **Step 1: Write failing tests in `watcher.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FolderBridgeWatcher, WatchEvent } from './watcher';

function makeFs() {
  const handlers: Record<string, Array<(p: string) => void>> = {};
  return {
    fs: {
      existsSync: () => true,
      statSync: () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, mtimeMs: 0, size: 0 }),
      readdirSync: () => [],
      mkdirSync: () => {},
      copyFileSync: () => {},
      rmSync: () => {},
      symlinkSync: () => {},
      watch: (_p: string, _opts: any) => ({
        on: (event: string, cb: (p: string) => void) => {
          handlers[event] = handlers[event] ?? [];
          handlers[event].push(cb);
        },
        close: () => {},
      }),
    } as any,
    handlers,
    fire: (event: string, p: string) => handlers[event]?.forEach(cb => cb(p)),
  };
}

describe('FolderBridgeWatcher', () => {
  it('registers handlers for all event types on start', () => {
    const { fs, handlers } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    expect(handlers['add']).toHaveLength(1);
    expect(handlers['change']).toHaveLength(1);
    expect(handlers['unlink']).toHaveLength(1);
    expect(handlers['addDir']).toHaveLength(1);
    expect(handlers['unlinkDir']).toHaveLength(1);
  });

  it('forwards events to callback', () => {
    const { fs, fire } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    fire('add', '\\\\NAS\\share\\OCR\\new.md');
    fire('unlink', '\\\\NAS\\share\\OCR\\old.md');
    fire('change', '\\\\NAS\\share\\OCR\\existing.md');
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenNthCalledWith(1, { type: 'add', absPath: '\\\\NAS\\share\\OCR\\new.md' });
    expect(cb).toHaveBeenNthCalledWith(2, { type: 'unlink', absPath: '\\\\NAS\\share\\OCR\\old.md' });
    expect(cb).toHaveBeenNthCalledWith(3, { type: 'change', absPath: '\\\\NAS\\share\\OCR\\existing.md' });
  });

  it('stop() releases the handle', () => {
    const { fs } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    expect(() => w.stop()).not.toThrow();
    // Calling stop twice should also be safe
    expect(() => w.stop()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/watcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement in `watcher.ts`**

```typescript
import { FolderBridgeFs } from './types';

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  absPath: string;
}

export type WatchEventHandler = (event: WatchEvent) => void;

export class FolderBridgeWatcher {
  private handle: ReturnType<FolderBridgeFs['watch']> | null = null;

  constructor(private fs: FolderBridgeFs) {}

  start(path: string, onEvent: WatchEventHandler): void {
    if (this.handle) this.stop();
    const events: Array<'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'> = [
      'add',
      'change',
      'unlink',
      'addDir',
      'unlinkDir',
    ];
    this.handle = this.fs.watch(path, { persistent: true, ignoreInitial: true });
    for (const event of events) {
      this.handle.on(event, (p: string) => onEvent({ type: event, absPath: p }));
    }
  }

  stop(): void {
    this.handle?.close();
    this.handle = null;
  }
}
```

- [ ] **Step 4: Run tests — GREEN**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/`
Expected: PASS — validation + reconciler + watcher green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-bridge/watcher.ts src/features/folder-bridge/watcher.test.ts && git commit -m "feat(folder-bridge): F-051 FolderBridgeWatcher（chokidar DI ラッパー）"
```

---

## Task 6: FolderBridgeManager + tests

**Files:**
- Create: `src/features/folder-bridge/manager.ts`
- Create: `src/features/folder-bridge/manager.test.ts`

**Interfaces:**
- Consumes: `FolderBridgeFs`, `FolderBridgeDeps` (Task 2), `ShadowReconciler` (Task 4), `FolderBridgeWatcher` (Task 5)
- Produces:
  ```typescript
  export class FolderBridgeManager {
    constructor(private deps: FolderBridgeDeps);
    applyAll(bridges: FolderBridge[]): ApplyAllResult;
    pause(id: string): void;
    resume(id: string): void;
    disable(id: string): void;
    status(id: string): { state: FolderBridgeState };
    private applyOne(bridge: FolderBridge): void;
    private handleWatchEvent(bridge: FolderBridge, event: WatchEvent): void;
    private setState(id: string, state: FolderBridgeState): void;
  }
  ```

- [ ] **Step 1: Write failing tests in `manager.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import nodePath from 'path';
import { FolderBridgeManager } from './manager';
import { FolderBridge, FolderBridgeFs } from './types';

function makeFs() {
  const files = new Map<string, { type: 'file' | 'dir'; content?: string; mtimeMs: number }>();
  return {
    files,
    fs: {
      existsSync: (p: string) => files.has(p) || files.has(p.endsWith('\\') ? p : p + '\\'),
      statSync: (p: string) => {
        const f = files.get(p) ?? files.get(p + '\\');
        if (!f) throw new Error(`ENOENT: ${p}`);
        return { isDirectory: () => f.type === 'dir', isFile: () => f.type === 'file', isSymbolicLink: () => false, mtimeMs: f.mtimeMs, size: f.content?.length ?? 0 };
      },
      readdirSync: (p: string) => {
        const prefix = (p.endsWith('\\') ? p : p + '\\');
        const names = new Set<string>();
        for (const k of files.keys()) {
          if (k.startsWith(prefix)) {
            const rest = k.slice(prefix.length);
            if (rest && !rest.includes('\\')) names.add(rest);
          }
        }
        return Array.from(names);
      },
      mkdirSync: (p: string) => {
        files.set(p, { type: 'dir', mtimeMs: 0 });
        files.set(p.endsWith('\\') ? p : p + '\\', { type: 'dir', mtimeMs: 0 });
      },
      copyFileSync: (src: string, dst: string) => {
        const f = files.get(src) ?? files.get(src + '\\');
        if (!f) throw new Error(`ENOENT src: ${src}`);
        files.set(dst, { type: 'file', content: f.content, mtimeMs: f.mtimeMs });
      },
      rmSync: (p: string) => {
        const prefix = p.endsWith('\\') ? p : p + '\\';
        for (const k of Array.from(files.keys())) {
          if (k === p || k.startsWith(prefix)) files.delete(k);
        }
      },
      symlinkSync: (target: string, p: string) => {
        files.set(p, { type: 'dir', mtimeMs: 0 });
      },
      watch: () => ({ on: () => {}, close: () => {} }),
    } as FolderBridgeFs,
  };
}

function makeBridge(overrides: Partial<FolderBridge> = {}): FolderBridge {
  return {
    id: 'b1',
    linkName: 'OCR',
    vaultSubpath: '10_Input',
    externalPath: 'C:\\NAS\\OCR',
    shadowPath: 'C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1',
    excludePatterns: [],
    syncDirection: 'nas_to_shadow',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('FolderBridgeManager', () => {
  let fs: ReturnType<typeof makeFs>['fs'];
  let notices: string[];

  beforeEach(() => {
    fs = makeFs().fs;
    notices = [];
  });

  function mgr() {
    return new FolderBridgeManager({
      fs,
      notice: (m) => notices.push(m),
      vaultBasePath: 'C:\\Vault',
    });
  }

  it('applyAll syncs disabled bridges are skipped', () => {
    const r = mgr().applyAll([makeBridge({ enabled: false })]);
    expect(r.totalLinked).toBe(0);
    expect(r.totalErrors).toBe(0);
  });

  it('applyOne creates shadow dir, syncs files, creates junction', () => {
    // Setup NAS source
    const f = makeFs();
    fs = f.fs;
    f.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    f.files.set('C:\\NAS\\OCR\\doc.md', { type: 'file', content: 'DOC', mtimeMs: 100 });

    const r = mgr().applyAll([makeBridge()]);
    expect(r.totalLinked).toBe(1);
    expect(r.totalErrors).toBe(0);
    expect(fs.existsSync('C:\\Vault\\10_Input\\OCR')).toBe(true);
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\doc.md')).toBe(true);
  });

  it('marks external_missing when source path missing', () => {
    const r = mgr().applyAll([makeBridge({ externalPath: 'C:\\NOPE' })]);
    expect(r.totalErrors).toBe(1);
    expect(notices.some(n => n.includes('到達できません') || n.includes('到達不可'))).toBe(true);
  });

  it('handleWatchEvent add: copies new file to shadow', () => {
    f_setup();
    const m = mgr();
    m.applyAll([makeBridge()]);
    // Simulate watcher event
    (m as any).handleWatchEvent(makeBridge(), { type: 'add', absPath: 'C:\\NAS\\OCR\\new.md' });
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\new.md')).toBe(true);
  });

  it('handleWatchEvent unlink: removes shadow file', () => {
    f_setup();
    f.files.set('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\old.md', { type: 'file', content: 'X', mtimeMs: 0 });
    const m = mgr();
    m.applyAll([makeBridge()]);
    (m as any).handleWatchEvent(makeBridge(), { type: 'unlink', absPath: 'C:\\NAS\\OCR\\old.md' });
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\old.md')).toBe(false);
  });

  it('pause/resume toggles the watcher', () => {
    f_setup();
    const m = mgr();
    m.applyAll([makeBridge()]);
    m.pause('b1');
    expect(m.status('b1').state).toBe('paused');
    m.resume('b1');
    expect(m.status('b1').state).toBe('linked');
  });

  it('disable removes junction and stops watcher', () => {
    f_setup();
    const m = mgr();
    m.applyAll([makeBridge()]);
    m.disable('b1');
    expect(fs.existsSync('C:\\Vault\\10_Input\\OCR')).toBe(false);
    expect(m.status('b1').state).toBe('disabled');
  });

  function f_setup() {
    const f = makeFs();
    fs = f.fs;
    f.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    f.files.set('C:\\NAS\\OCR\\placeholder.md', { type: 'file', content: 'P', mtimeMs: 0 });
  }
});
```

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement in `manager.ts`**

```typescript
import nodePath from 'path';
import { FolderBridge, FolderBridgeDeps, FolderBridgeState, ApplyAllResult } from './types';
import { ShadowReconciler } from './reconciler';
import { FolderBridgeWatcher, WatchEvent } from './watcher';

export class FolderBridgeManager {
  private reconciler: ShadowReconciler;
  private watchers = new Map<string, FolderBridgeWatcher>();
  private states = new Map<string, FolderBridgeState>();

  constructor(private deps: FolderBridgeDeps) {
    this.reconciler = new ShadowReconciler(deps.fs);
  }

  applyAll(bridges: FolderBridge[]): ApplyAllResult {
    const result: ApplyAllResult = { totalLinked: 0, totalErrors: 0, notices: [] };
    for (const bridge of bridges) {
      if (!bridge.enabled) {
        this.setState(bridge.id, 'disabled');
        continue;
      }
      try {
        this.applyOne(bridge);
        result.totalLinked++;
        const msg = `✅ ${bridge.linkName}: ${bridge.externalPath} を ${bridge.vaultSubpath}/${bridge.linkName} と同期中`;
        result.notices.push(msg);
        this.deps.notice(msg);
      } catch (e) {
        result.totalErrors++;
        const msg = `❌ ${bridge.linkName}: ${(e as Error).message}`;
        result.notices.push(msg);
        this.deps.notice(msg);
      }
    }
    return result;
  }

  pause(id: string): void {
    this.watchers.get(id)?.stop();
    this.setState(id, 'paused');
  }

  resume(id: string): void {
    this.setState(id, 'linked');
    // Restart watcher if bridge still exists in caller context
    // (Caller must pass bridge via applyAll again — see Task 9 wiring)
  }

  disable(id: string): void {
    this.watchers.get(id)?.stop();
    this.watchers.delete(id);
    const bridge = this.findBridge(id);
    if (bridge) {
      const junction = nodePath.join(this.deps.vaultBasePath, bridge.vaultSubpath, bridge.linkName);
      if (this.deps.fs.existsSync(junction)) {
        this.deps.fs.rmSync(junction, { recursive: true, force: true });
      }
    }
    this.setState(id, 'disabled');
  }

  status(id: string): { state: FolderBridgeState } {
    return { state: this.states.get(id) ?? 'disabled' };
  }

  /** Internal: handle a chokidar event for a bridge. */
  handleWatchEvent(bridge: FolderBridge, event: WatchEvent): void {
    try {
      const rel = nodePath.relative(bridge.externalPath, event.absPath);
      if (!rel || rel.startsWith('..')) return;
      const shadowTarget = nodePath.join(bridge.shadowPath, rel);
      if (event.type === 'unlink' || event.type === 'unlinkDir') {
        this.reconciler.removeFromShadow(shadowTarget);
      } else if (event.type === 'add' || event.type === 'change') {
        this.reconciler.syncOne(event.absPath, shadowTarget, bridge.excludePatterns);
      } else if (event.type === 'addDir') {
        this.deps.fs.mkdirSync(shadowTarget, { recursive: true });
      }
    } catch (e) {
      this.deps.notice(`⚠️ ${bridge.linkName}: 同期エラー ${(e as Error).message}`);
      this.setState(bridge.id, 'error');
    }
  }

  private applyOne(bridge: FolderBridge): void {
    // 1. Validate external path exists
    if (!this.deps.fs.existsSync(bridge.externalPath)) {
      this.setState(bridge.id, 'external_missing');
      throw new Error(`${bridge.externalPath} に到達できません`);
    }

    // 2. Initial sync
    this.setState(bridge.id, 'syncing');
    this.reconciler.syncAll(bridge.externalPath, bridge.shadowPath, bridge.excludePatterns);

    // 3. Create junction (Shadow を指す)
    const junction = nodePath.join(this.deps.vaultBasePath, bridge.vaultSubpath, bridge.linkName);
    if (this.deps.fs.existsSync(junction)) {
      this.deps.fs.rmSync(junction, { recursive: true, force: true });
    }
    this.deps.fs.symlinkSync(bridge.shadowPath, junction, 'junction');

    // 4. Start watcher
    this.watchers.get(bridge.id)?.stop();
    const watcher = new FolderBridgeWatcher(this.deps.fs);
    watcher.start(bridge.externalPath, (event) => this.handleWatchEvent(bridge, event));
    this.watchers.set(bridge.id, watcher);

    this.setState(bridge.id, 'linked');
  }

  private setState(id: string, state: FolderBridgeState): void {
    this.states.set(id, state);
    this.deps.logger?.('debug', `[folder-bridge] ${id} → ${state}`);
  }

  private findBridge(id: string): FolderBridge | undefined {
    // Bridges are stored in settings; this method is a placeholder for Task 9 wiring
    return undefined;
  }
}
```

**Note**: `findBridge` is a stub here because bridges come from settings (Task 7). Task 9 will wire the manager to read bridges from `app.settings`.

- [ ] **Step 4: Run tests — GREEN**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-bridge/`
Expected: PASS — all 4 test files green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-bridge/manager.ts src/features/folder-bridge/manager.test.ts && git commit -m "feat(folder-bridge): F-051 FolderBridgeManager（applyAll / pause / resume / disable / watcher）"
```

---

## Task 7: Settings schema migration + tests

**Files:**
- Modify: `src/core/settings.ts`
- Modify: `src/core/settings.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `ClaudianBridgeSettings.general.folderBridges: FolderBridge[]` (with normalize migration that defaults `enabled: false` and injects `syncDirection: 'nas_to_shadow'`)

- [ ] **Step 1: Write failing tests in `settings.test.ts`**

```typescript
describe('F-051: folderBridges migration', () => {
  it('injects empty folderBridges array for legacy settings', () => {
    const out = normalizeClaudianBridgeSettings({ general: {} } as any);
    expect(out.general.folderBridges).toEqual([]);
  });

  it('preserves existing folderBridges entries', () => {
    const out = normalizeClaudianBridgeSettings({
      general: {
        folderBridges: [
          {
            id: 'b1', linkName: 'OCR', vaultSubpath: '10_Input',
            externalPath: 'C:\\NAS\\OCR',
            shadowPath: 'C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1',
            excludePatterns: ['*.tmp'],
            enabled: false, createdAt: 0, updatedAt: 0,
          },
        ],
      },
    } as any);
    expect(out.general.folderBridges).toHaveLength(1);
    expect(out.general.folderBridges[0].syncDirection).toBe('nas_to_shadow');
  });

  it('injects default syncDirection for legacy records', () => {
    const out = normalizeClaudianBridgeSettings({
      general: {
        folderBridges: [
          { id: 'b1', linkName: 'X', vaultSubpath: '10_Input', externalPath: 'C:\\X', shadowPath: 'D:\\shadow\\b1', excludePatterns: [], enabled: false, createdAt: 0, updatedAt: 0 },
        ],
      },
    } as any);
    expect(out.general.folderBridges[0].syncDirection).toBe('nas_to_shadow');
  });
});
```

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/core/settings.test.ts`
Expected: FAIL — `folderBridges` undefined.

- [ ] **Step 3: Implement in `normalizeClaudianBridgeSettings`**

In `src/core/settings.ts`, locate the `normalizeClaudianBridgeSettings` function (around line 876 per the plan source) and add:

```typescript
folderBridges: (Array.isArray(r.general?.folderBridges) ? r.general!.folderBridges : []).map((b: any) => ({
  ...b,
  syncDirection: 'nas_to_shadow',  // Phase 1 only; Phase 2 will add 'bidirectional'
})),
```

Also add `FolderBridge` type import at the top of `settings.ts`:
```typescript
import type { FolderBridge } from '../features/folder-bridge/types';
```

And update the type annotation if needed:
```typescript
folderBridges: FolderBridge[];
```

- [ ] **Step 4: Run tests — GREEN + full suite**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run`
Expected: PASS — no regressions (1411 + new tests).

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/settings.ts src/core/settings.test.ts && git commit -m "feat(settings): F-051 folderBridges 配列追加 + normalize 移行"
```

---

## Task 8: i18n keys (6 keys × 3 locales)

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Produces: 6 keys × 3 locales:
  - `folderBridge` (tab name)
  - `folderBridgeAdd` (button)
  - `folderBridgeSyncDirection`
  - `folderBridgeSyncDirectionDesc`
  - `folderBridgeExcludePatterns`
  - `folderBridgeExternalMissing`

- [ ] **Step 1: Add to `LocaleStrings` interface**

In `src/core/i18n.ts`, in the F-050 block (after `folderMappingVaultSubpathDesc`), add:

```typescript
folderBridge: string;
folderBridgeAdd: string;
folderBridgeSyncDirection: string;
folderBridgeSyncDirectionDesc: string;
folderBridgeExcludePatterns: string;
folderBridgeExternalMissing: string;
```

- [ ] **Step 2: Add values**

`ja`:
```typescript
folderBridge: 'ブリッジ',
folderBridgeAdd: 'ブリッジ追加',
folderBridgeSyncDirection: '同期方向',
folderBridgeSyncDirectionDesc: 'Phase 1 は NAS → ローカルシャドウ（読み取り専用）のみ対応',
folderBridgeExcludePatterns: '除外パターン',
folderBridgeExternalMissing: '外部パスに到達できません',
```

`en`:
```typescript
folderBridge: 'Bridge',
folderBridgeAdd: 'Add Bridge',
folderBridgeSyncDirection: 'Sync Direction',
folderBridgeSyncDirectionDesc: 'Phase 1 supports NAS → local shadow (read-only)',
folderBridgeExcludePatterns: 'Exclude Patterns',
folderBridgeExternalMissing: 'External path unreachable',
```

`zh`:
```typescript
folderBridge: '桥接',
folderBridgeAdd: '添加桥接',
folderBridgeSyncDirection: '同步方向',
folderBridgeSyncDirectionDesc: 'Phase 1 仅支持 NAS → 本地影子（只读）',
folderBridgeExcludePatterns: '排除模式',
folderBridgeExternalMissing: '外部路径不可达',
```

- [ ] **Step 3: Run typecheck**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/i18n.ts && git commit -m "feat(i18n): F-051 folderBridge strings (6 keys × 3 locales)"
```

---

## Task 9: Settings UI modal + tab + wire-up

**Files:**
- Create: `src/settings/FolderBridgeModal.ts`
- Create: `src/settings/SettingTabBridge.ts`
- Modify: `src/main.ts` (wire FolderBridgeManager to startup)

**Interfaces:**
- Consumes: `validateExternalPath`, `validateShadowPath`, `computeDefaultShadowPath` (Task 3), i18n keys (Task 8), `FolderBridge` (Task 2)
- Produces:
  - `FolderBridgeModal` class with 4 fields: linkName, vaultSubpath, externalPath, excludePatterns
  - `SettingTabBridge` class with add/edit/delete/pause/resume controls
  - `main.ts` calls `new FolderBridgeManager(deps).applyAll(app.settings.general.folderBridges)` on startup

- [ ] **Step 1: Create `src/settings/FolderBridgeModal.ts`**

Mirror the pattern from `src/settings/FolderMappingModal.ts:8-150`. 4 fields with validation:
- `linkName` → reuse `validateLinkName` from folder-mapping (or duplicate — Task 11 cleanup)
- `vaultSubpath` → reuse `validateVaultSubpath` from F-050
- `externalPath` → new `validateExternalPath`
- `excludePatterns` → new `validateExcludePatterns`

```typescript
import { App, Modal, Notice, Setting } from 'obsidian';
import { s } from '../core/i18n';
import { FolderBridge } from '../features/folder-bridge/types';
import { validateExternalPath, validateExcludePatterns, validateShadowPath, computeDefaultShadowPath } from '../features/folder-bridge/validation';

export class FolderBridgeModal extends Modal {
  private linkName = '';
  private vaultSubpath = '10_Input';
  private externalPath = '';
  private excludePatterns = '';
  private errorEl: HTMLElement;

  constructor(app: App, private opts?: { editing?: FolderBridge; onSave: (b: Omit<FolderBridge, 'id' | 'createdAt' | 'updatedAt' | 'shadowPath' | 'syncDirection'> & { id?: string }) => void }) {
    super(app);
    if (opts?.editing) {
      this.linkName = opts.editing.linkName;
      this.vaultSubpath = opts.editing.vaultSubpath;
      this.externalPath = opts.editing.externalPath;
      this.excludePatterns = opts.editing.excludePatterns.join(', ');
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.errorEl = contentEl.createDiv({ text: '' });

    new Setting(contentEl).setName('ブリッジ名').addText(t => t.setValue(this.linkName).onChange(v => { this.linkName = v; this.refreshError(); }));
    new Setting(contentEl).setName(s.folderBridgeSyncDirection).setDesc(s.folderBridgeSyncDirectionDesc).addText(t => t.setValue('NAS → Shadow').setDisabled(true));
    new Setting(contentEl).setName('外部パス（UNC または絶対パス）').addText(t => t.setValue(this.externalPath).onChange(v => { this.externalPath = v; this.refreshError(); }));
    new Setting(contentEl).setName(s.folderBridgeExcludePatterns).setDesc('カンマ区切り glob').addText(t => t.setValue(this.excludePatterns).onChange(v => { this.excludePatterns = v; this.refreshError(); }));

    new Setting(contentEl)
      .addButton(b => b.setButtonText('キャンセル').onClick(() => this.close()))
      .addButton(b => b.setButtonText('保存').setCta().onClick(() => this.save()));
  }

  private refreshError() {
    this.errorEl.textContent = '';
  }

  private async save() {
    const ep = validateExternalPath(this.externalPath);
    if (!ep.ok) { new Notice(`外部パス: ${ep.reason}`); return; }
    const xp = validateExcludePatterns(this.excludePatterns.split(',').map(s => s.trim()).filter(Boolean));
    if (!xp.ok) { new Notice(`除外パターン: ${xp.reason}`); return; }
    if (!this.linkName.trim()) { new Notice('ブリッジ名は必須です'); return; }

    this.opts?.onSave({
      id: this.opts?.editing?.id,
      linkName: this.linkName.trim(),
      vaultSubpath: this.vaultSubpath.trim() || '10_Input',
      externalPath: ep.normalized,
      excludePatterns: xp.normalized,
      enabled: this.opts?.editing?.enabled ?? false,
    });
    this.close();
  }
}
```

- [ ] **Step 2: Create `src/settings/SettingTabBridge.ts`**

Mirror the row pattern from `src/settings/SettingTabWhitelist.ts:177-255` but for bridges:

```typescript
import { App, PluginSettingTab } from 'obsidian';
import { s } from '../core/i18n';
import ClaudianBridgePlugin from '../main';
import { FolderBridgeModal } from './FolderBridgeModal';
import { computeDefaultShadowPath } from '../features/folder-bridge/validation';

export class SettingTabBridge extends PluginSettingTab {
  constructor(app: App, private plugin: ClaudianBridgePlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: s.folderBridge });

    const bridges = this.plugin.settings.general.folderBridges ?? [];
    for (const bridge of bridges) {
      const row = containerEl.createDiv({ cls: 'folder-bridge-row' });
      row.createEl('span', { text: `🌉 ${bridge.vaultSubpath}/${bridge.linkName} → ${bridge.externalPath}` });
      const controls = row.createDiv({ cls: 'folder-bridge-controls' });
      new Setting(controls)
        .addToggle(t => t.setValue(bridge.enabled).onChange(async v => {
          bridge.enabled = v;
          await this.plugin.saveSettings();
          this.plugin.restartBridges();
          this.display();
        }))
        .addButton(b => b.setButtonText('編集').onClick(() => this.editBridge(bridge)))
        .addButton(b => b.setButtonText('削除').setWarning().onClick(async () => {
          bridges.splice(bridges.indexOf(bridge), 1);
          await this.plugin.saveSettings();
          this.plugin.restartBridges();
          this.display();
        }));
    }

    new Setting(containerEl)
      .addButton(b => b.setButtonText(s.folderBridgeAdd).setCta().onClick(() => this.addBridge()));
  }

  private addBridge() {
    new FolderBridgeModal(this.app, {
      onSave: async (b) => {
        const id = b.id ?? `b${Date.now()}`;
        const now = Date.now();
        const vaultBase = (this.plugin.app.vault.adapter as any).getBasePath?.() ?? '';
        const bridges = this.plugin.settings.general.folderBridges ?? [];
        bridges.push({
          id,
          linkName: b.linkName,
          vaultSubpath: b.vaultSubpath,
          externalPath: b.externalPath,
          shadowPath: computeDefaultShadowPath(vaultBase, id),
          excludePatterns: b.excludePatterns,
          syncDirection: 'nas_to_shadow',
          enabled: b.enabled,
          createdAt: now,
          updatedAt: now,
        });
        this.plugin.settings.general.folderBridges = bridges;
        await this.plugin.saveSettings();
        this.plugin.restartBridges();
        this.display();
      },
    }).open();
  }

  private editBridge(bridge: any) {
    new FolderBridgeModal(this.app, {
      editing: bridge,
      onSave: async (b) => {
        Object.assign(bridge, b, { updatedAt: Date.now() });
        await this.plugin.saveSettings();
        this.plugin.restartBridges();
        this.display();
      },
    }).open();
  }
}
```

- [ ] **Step 3: Wire up in `main.ts`**

Add to `src/main.ts`:

```typescript
import { FolderBridgeManager } from './features/folder-bridge/manager';
import { SettingTabBridge } from './settings/SettingTabBridge';

// In onload() — after settings are loaded:
this.bridgeManager = new FolderBridgeManager({
  fs: require('fs') as any,
  notice: (m) => new Notice(m),
  vaultBasePath: (this.app.vault.adapter as any).getBasePath?.() ?? '',
});
this.applyAllBridges();

// Add a public method:
applyAllBridges() {
  this.bridgeManager.applyAll(this.settings.general.folderBridges ?? []);
}

restartBridges() {
  this.applyAllBridges();
}
```

Register the new tab:
```typescript
this.addSettingTab(new SettingTabBridge(this.app, this));
```

- [ ] **Step 4: Run typecheck + full suite**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/settings/FolderBridgeModal.ts src/settings/SettingTabBridge.ts src/main.ts && git commit -m "feat(settings-ui): F-051 FolderBridgeModal + SettingTabBridge + main.ts wire-up"
```

---

## Task 10: CHANGELOG + version bump + verification

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `src/manifest.json`, `Plugin/manifest.json`

- [ ] **Step 1: Prepend CHANGELOG entry**

```markdown
## [0.52.0] - 2026-09-XX — Folder Bridge Phase 1（NAS → ローカルシャドウ読み取り専用）

ネットワークドライブ(NAS) 上のフォルダを Obsidian のインデックス対象にする「Folder Bridge」
Phase 1 を実装。NAS → ローカルシャドウ (.obsidian/cache/folder-bridge/{id}/) への単方向
読み取り専用同期。chokidar で NAS を watch し変更をシャドウにミラーリング。シャドウを
指す junction を Vault 内に作成するため Obsidian はローカル FS として認識。

- feat(folder-bridge): FolderBridge 型 + 8-state 機械
- feat(folder-bridge): ShadowReconciler（initial sync + remove）
- feat(folder-bridge): FolderBridgeWatcher（chokidar DI ラッパー）
- feat(folder-bridge): FolderBridgeManager（applyAll / pause / resume / disable）
- feat(settings): folderBridges 配列追加 + normalize 移行（enabled=false がデフォルト）
- feat(i18n): 6 keys × 3 locales
- feat(settings-ui): FolderBridgeModal + SettingTabBridge
- chore(deps): chokidar ^3.6 追加
- tests: +30 cases（1411 → 1441）

制限事項:
- Phase 1 は読み取り専用（NAS 側の編集は反映されるが、Vault 内の編集は NAS に書き戻されない）
- Phase 2 で双方向同期 + 競合解決を実装予定
- Phase 3 で FS Layer Bridge（WinFsp / macFUSE / FUSE）オプションを実装予定
```

- [ ] **Step 2: Bump versions 0.51.0 → 0.52.0** in all 3 files.

- [ ] **Step 3: Full verification**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npx vitest run && npm run build`
Expected: all green (~1441 tests).

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add CHANGELOG.md package.json src/manifest.json Plugin/manifest.json && git commit -m "chore(release): v0.52.0 F-051 Folder Bridge Phase 1（Shadow Sync 読み取り専用）"
```

---

## Self-Review Checklist

- [ ] All spec requirements covered (Phase 1: unidirectional read-only Shadow Sync)
- [ ] Existing 1411 tests remain green
- [ ] chokidar dependency added in Task 1 (before any code that imports it)
- [ ] DI-injected fs throughout (no direct `vi.mock('fs')`)
- [ ] FolderMappingManager (F-049/F-050) and OutputsMirrorManager untouched
- [ ] 8-state machine matches spec §3.6
- [ ] i18n 6 keys × 3 locales
- [ ] Default `enabled = false` (zero impact on existing users)
- [ ] No placeholders / TBD in task descriptions
- [ ] Type consistency: `FolderBridge`, `FolderBridgeState`, `FolderBridgeFs`, `FolderBridgeDeps`, `ApplyAllResult` used identically across tasks

---

## Execution Handoff

Plan complete and saved to `D:/AI-Agent/ClaudianBridge/docs/superpowers/plans/2026-09-16-folder-bridge.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

---

*📚 Plan v1.0 · ClaudianBridge F-051 · 2026-09-16*
