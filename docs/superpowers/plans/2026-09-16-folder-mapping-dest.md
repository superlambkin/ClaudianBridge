# Folder Mapping Destination (F-050) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose the in-vault destination for each folder mapping (e.g. `C:/OCR` → `10_Input/OCR`), migrating away from the hard-coded `@10_Input` subpath.

**Architecture:** Add `vaultSubpath: string` to `FolderMapping`. `resolveLinkPath` becomes `join(vault, vaultSubpath, linkName)`. Migration is 2-layered: normalize injects `'10_Input'` into legacy records; `applyAll` removes legacy `@10_Input/{linkName}` junctions so the normal apply re-creates them at the new path. Modal gains a "マッピング先（Vault 内パス）" field with real-time validation.

**Tech Stack:** TypeScript, Node.js `path`/`fs` (DI-injected), vitest.

## Global Constraints

- Existing tests: 1399 passed + 1 skipped (must remain green)
- Target: v0.51.0 release, F-050, branch `feat/v0.51.0-folder-mapping-dest`
- Strict TDD: write failing test → run → implement → run → commit
- All FS ops go through DI-injected `fs` interface (no `vi.mock('fs')`)
- 既存 `OutputsMirrorManager` には**一切触らない**
- F-049 の状態マシン（9 states）・Notice 文言・§7.3 ロールバックは無変更
- デフォルト vaultSubpath = `'10_Input'`（旧レコードの normalize 注入値と同じ）
- Legacy subpath constant: `'@10_Input'`
- Validation rejections: `..` 含む / 絶対パス / `.` 開始階層 / `@` 開始階層 / 不正文字
- All new code paths must have an i18n key for ja/en/zh
- Branch policy: create `feat/v0.51.0-folder-mapping-dest` from `main`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/features/folder-mapping/types.ts` | Add `vaultSubpath` to `FolderMapping` | Modify |
| `src/features/folder-mapping/validation.ts` | Add `validateVaultSubpath` | Modify |
| `src/features/folder-mapping/validation.test.ts` | +7 tests | Modify |
| `src/features/folder-mapping/manager.ts` | `resolveLinkPath` uses `vaultSubpath`; legacy junction cleanup in `applyAll`; export `LEGACY_SUBPATH` | Modify |
| `src/features/folder-mapping/manager.test.ts` | Update `makeMapping` (+vaultSubpath), +3 tests (resolveLinkPath, legacy ×2) | Modify |
| `src/core/settings.ts` | normalize injects `vaultSubpath: '10_Input'` into legacy records | Modify |
| `src/core/settings.test.ts` | +2 migration tests | Modify |
| `src/core/i18n.ts` | +2 keys × 3 locales | Modify |
| `src/settings/FolderMappingModal.ts` | Add vaultSubpath field + validation + edit handling | Modify |
| `src/settings/SettingTabWhitelist.ts` | Row label `🔗 {vaultSubpath}/{linkName}` | Modify |
| `CHANGELOG.md` | `[0.51.0]` entry | Modify |
| `package.json` / `src/manifest.json` / `Plugin/manifest.json` | 0.50.0 → 0.51.0 | Modify |

---

## Task 1: `validateVaultSubpath` + tests

**Files:**
- Modify: `src/features/folder-mapping/validation.ts`
- Modify: `src/features/folder-mapping/validation.test.ts`

**Interfaces:**
- Consumes: `nodePath.normalize`
- Produces:
  ```typescript
  export function validateVaultSubpath(
    subpath: string,
  ): { ok: true; normalized: string }
    | { ok: false; reason: 'empty' | 'not_relative' | 'dot_folder' | 'forbidden_prefix' | 'invalid_segment' };
  ```

- [ ] **Step 1: Append failing tests to `validation.test.ts`**

```typescript
describe('validateVaultSubpath', () => {
  it('accepts 10_Input and normalizes backslashes', () => {
    expect(validateVaultSubpath('10_Input')).toEqual({ ok: true, normalized: '10_Input' });
  });
  it('accepts nested a\\b\\c', () => {
    expect(validateVaultSubpath('a\\b\\c')).toEqual({ ok: true, normalized: nodePath.normalize('a/b/c').replace(/\//g, nodePath.sep) === 'a\\b\\c' ? 'a\\b\\c' : 'a/b/c' });
  });
  it('rejects empty', () => {
    expect(validateVaultSubpath('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateVaultSubpath('/')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects .. traversal', () => {
    expect(validateVaultSubpath('a/../b')).toEqual({ ok: false, reason: 'not_relative' });
  });
  it('rejects absolute path', () => {
    expect(validateVaultSubpath('C:\\Temp')).toEqual({ ok: false, reason: 'not_relative' });
    expect(validateVaultSubpath('/tmp')).toEqual({ ok: false, reason: 'not_relative' });
  });
  it('rejects dot folder', () => {
    expect(validateVaultSubpath('.obsidian')).toEqual({ ok: false, reason: 'dot_folder' });
  });
  it('rejects @ prefix', () => {
    expect(validateVaultSubpath('@10_Input')).toEqual({ ok: false, reason: 'forbidden_prefix' });
  });
  it('rejects invalid segment chars', () => {
    expect(validateVaultSubpath('a:b')).toEqual({ ok: false, reason: 'invalid_segment' });
  });
});
```

(Note: import `validateVaultSubpath` in the existing import statement. Simplify the nested-path assertion to a single concrete expectation: `{ ok: true, normalized: 'a\\b\\c' }` on Windows test runs.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/validation.test.ts`
Expected: FAIL — `validateVaultSubpath` is not exported.

- [ ] **Step 3: Implement in `validation.ts`**

```typescript
const SEGMENT_FORBIDDEN = /[<>:"|?*\u0000-\u001f]/;
const MAX_SEGMENT_LEN = 64;

export function validateVaultSubpath(
  subpath: string,
): { ok: true; normalized: string } | { ok: false; reason: 'empty' | 'not_relative' | 'dot_folder' | 'forbidden_prefix' | 'invalid_segment' } {
  const trimmed = (subpath ?? '').trim();
  if (!trimmed || /^[\\/]+$/.test(trimmed)) return { ok: false, reason: 'empty' };
  if (nodePath.isAbsolute(trimmed)) return { ok: false, reason: 'not_relative' };
  const normalized = nodePath.normalize(trimmed).replace(/\\/g, '/');
  if (normalized.split('/').some((seg) => seg === '..')) return { ok: false, reason: 'not_relative' };
  for (const seg of normalized.split('/')) {
    if (seg.startsWith('.')) return { ok: false, reason: 'dot_folder' };
    if (seg.startsWith('@')) return { ok: false, reason: 'forbidden_prefix' };
    if (SEGMENT_FORBIDDEN.test(seg) || seg.length > MAX_SEGMENT_LEN) return { ok: false, reason: 'invalid_segment' };
  }
  return { ok: true, normalized: normalized };
}
```

(The `normalized` return uses forward slashes; the consumer passes it to `nodePath.join` which handles both separators on Windows.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/validation.test.ts`
Expected: PASS — all (18 + 7) green.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/validation.ts src/features/folder-mapping/validation.test.ts && git commit -m "feat(folder-mapping): F-050 validateVaultSubpath バリデーション追加"
```

---

## Task 2: `vaultSubpath` type field + `resolveLinkPath` + test updates

**Files:**
- Modify: `src/features/folder-mapping/types.ts`
- Modify: `src/features/folder-mapping/manager.ts` (resolveLinkPath only)
- Modify: `src/features/folder-mapping/manager.test.ts` (makeMapping + 1 test)

**Interfaces:**
- Consumes: nothing new
- Produces: `FolderMapping.vaultSubpath: string` (required field); `resolveLinkPath` = `join(vault, vaultSubpath, linkName)`

- [ ] **Step 1: Update `manager.test.ts` `makeMapping` to include the new field + failing test**

```typescript
function makeMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    id: 'm1',
    linkName: 'ExternalDocs',
    vaultSubpath: '10_Input',
    externalPath: 'D:\\projects\\docs',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// inside describe('FolderMappingManager - basic apply'):
it('resolveLinkPath uses vaultSubpath', () => {
  const p = mgr.resolveLinkPath(makeMapping({ vaultSubpath: '10_Input', linkName: 'Foo' }));
  expect(p).toBe('C:\\Users\\me\\Vault\\10_Input\\Foo');
});
```

Also update the existing first test (`resolveLinkPath returns vaultBasePath + @10_Input/ + linkName`) to expect `'C:\\Users\\me\\Vault\\10_Input\\Foo'` for the default makeMapping.

- [ ] **Step 2: Run tests — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts`
Expected: FAIL — type error (`vaultSubpath` missing on FolderMapping) and path assertions fail.

- [ ] **Step 3: Implement**

`types.ts` — add the field after `linkName`:

```typescript
/** Vault 内マッピング先（Vault 相対パス・例: "10_Input"）。
 *  旧レコードは normalize で '10_Input' が注入される */
vaultSubpath: string;
```

`manager.ts` — replace `resolveLinkPath`:

```typescript
resolveLinkPath(mapping: FolderMapping): string {
  return nodePath.join(this.deps.vaultBasePath, mapping.vaultSubpath, mapping.linkName);
}
```

Remove the now-unused `VAULT_SUBPATH = '@10_Input'` constant (replaced by Task 4's `LEGACY_SUBPATH` — do NOT add LEGACY_SUBPATH yet; Task 4 owns it. In this task the constant is simply deleted).

- [ ] **Step 4: Run tests — GREEN**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/`
Expected: PASS — manager 16, validation 25.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/types.ts src/features/folder-mapping/manager.ts src/features/folder-mapping/manager.test.ts && git commit -m "feat(folder-mapping): F-050 vaultSubpath 型追加 + resolveLinkPath 変更"
```

---

## Task 3: normalize migration (`10_Input` injection) + tests

**Files:**
- Modify: `src/core/settings.ts` (normalize function, around line 876)
- Modify: `src/core/settings.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: normalize fills `vaultSubpath: '10_Input'` on records missing it; preserves existing values.

- [ ] **Step 1: Write failing tests in `settings.test.ts`**

```typescript
describe('F-050: vaultSubpath migration', () => {
  const mapping = (overrides: Record<string, unknown> = {}) => ({
    id: 'x', linkName: 'OCR', externalPath: 'C:\\OCR', enabled: true, createdAt: 0, updatedAt: 0,
    ...overrides,
  });

  it('injects vaultSubpath=10_Input into legacy record', () => {
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: [mapping()] },
    } as any);
    expect(out.general.folderMappings[0].vaultSubpath).toBe('10_Input');
  });

  it('preserves existing vaultSubpath', () => {
    const out = normalizeClaudianBridgeSettings({
      general: { folderMappings: [mapping({ vaultSubpath: '60_Tech_Research' })] },
    } as any);
    expect(out.general.folderMappings[0].vaultSubpath).toBe('60_Tech_Research');
  });
});
```

- [ ] **Step 2: Run — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/core/settings.test.ts`
Expected: FAIL — `vaultSubpath` is undefined.

- [ ] **Step 3: Implement in `normalizeClaudianBridgeSettings`**

Replace the existing folderMappings normalize block:

```typescript
folderMappings: (Array.isArray(r.general?.folderMappings) ? r.general!.folderMappings : []).map((m) => ({
  ...m,
  vaultSubpath:
    (m as { vaultSubpath?: string }).vaultSubpath?.trim() || '10_Input',
})),
```

- [ ] **Step 4: Run — GREEN + full suite**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run`
Expected: PASS — no regressions (TS may require casting in map; use `as FolderMapping[]` on the result if needed).

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/settings.ts src/core/settings.test.ts && git commit -m "feat(settings): F-050 旧レコードへの vaultSubpath 注入 (normalize)"
```

---

## Task 4: Legacy junction migration in `applyAll` + tests

**Files:**
- Modify: `src/features/folder-mapping/manager.ts`
- Modify: `src/features/folder-mapping/manager.test.ts`

**Interfaces:**
- Consumes: `FolderMappingFs` (existsSync/lstatSync/isSymbolicLink/rmdirSync)
- Produces: `export const LEGACY_SUBPATH = '@10_Input';` and `applyAll` behavior: before applying each mapping, if `join(vault, LEGACY_SUBPATH, linkName)` is an existing symlink and `mapping.vaultSubpath !== LEGACY_SUBPATH`, rmdir it and `notice('旧 @10_Input/{linkName} のリンクを {vaultSubpath}/{linkName} へ移行しました')`.

- [ ] **Step 1: Append failing tests to `manager.test.ts`**

```typescript
describe('FolderMappingManager - legacy junction migration', () => {
  it('removes legacy @10_Input junction and recreates at new subpath', () => {
    const fs = makeFs();
    const notices: string[] = [];
    const mgr = new FolderMappingManager(makeDeps({ fs, notice: (m) => notices.push(m) }));
    const m = makeMapping({ linkName: 'OCR', vaultSubpath: '10_Input', externalPath: 'C:\\OCR' });
    fs.files.set('C:\\OCR', 'dir');
    // legacy junction already present at @10_Input/OCR
    fs.files.set('C:\\Users\\me\\Vault\\@10_Input\\OCR', { symTarget: 'C:\\OCR' });
    fs.files.set('C:\\Users\\me\\Vault\\@10_Input', 'dir');

    const r = mgr.applyAll([m]);

    expect(fs.files.has('C:\\Users\\me\\Vault\\@10_Input\\OCR')).toBe(false);
    expect(fs.files.get('C:\\Users\\me\\Vault\\10_Input\\OCR')).toEqual({ symTarget: 'C:\\OCR' });
    expect(r.totalCreated).toBe(1);
    expect(notices.some((n) => n.includes('移行しました'))).toBe(true);
  });

  it('does nothing when no legacy junction exists', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    const m = makeMapping({ linkName: 'OCR', vaultSubpath: '10_Input', externalPath: 'C:\\OCR' });
    fs.files.set('C:\\OCR', 'dir');
    mgr.applyAll([m]);
    expect(fs.files.has('C:\\Users\\me\\Vault\\@10_Input\\OCR')).toBe(false);
    expect(r_totalCreated_is(mgr)).toBe(1);
  });
});
```

(Note: the second test's helper `r_totalCreated_is` is pseudo — inline `const r = mgr.applyAll([m]); expect(r.totalCreated).toBe(1);` instead.)

- [ ] **Step 2: Run — RED**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run src/features/folder-mapping/manager.test.ts -t "legacy"`
Expected: FAIL — legacy junction not removed.

- [ ] **Step 3: Implement in `manager.ts`**

```typescript
/** F-050: v0.50.x までの固定サブパス（起動時の自動貼り直し対象） */
export const LEGACY_SUBPATH = '@10_Input';

// inside applyAll(), before the per-mapping apply loop:
for (const m of mappings) {
  if (m.vaultSubpath !== LEGACY_SUBPATH) {
    const legacyPath = nodePath.join(this.deps.vaultBasePath, LEGACY_SUBPATH, m.linkName);
    try {
      if (
        this.deps.fs.existsSync(legacyPath) &&
        this.deps.fs.lstatSync(legacyPath).isSymbolicLink()
      ) {
        this.deps.fs.rmdirSync(legacyPath);
        this.deps.notice(`旧 @10_Input/${m.linkName} のリンクを ${m.vaultSubpath}/${m.linkName} へ移行しました`);
      }
    } catch {
      // 旧 junction の削除に失敗しても続行（新パスの apply は独立）
    }
  }
  const state = this.apply(m);
  // ... existing aggregation code unchanged
}
```

- [ ] **Step 4: Run — GREEN + full suite**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npx vitest run`
Expected: PASS — manager 18, no regressions.

- [ ] **Step 5: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/features/folder-mapping/manager.ts src/features/folder-mapping/manager.test.ts && git commit -m "feat(folder-mapping): F-050 旧 @10_Input junction の自動貼り直し (applyAll)"
```

---

## Task 5: i18n keys (2 keys × 3 locales)

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Produces: `folderMappingVaultSubpath`, `folderMappingVaultSubpathDesc` in `LocaleStrings` + ja/en/zh objects

- [ ] **Step 1: Add to `LocaleStrings` interface** (in the F-049 block):

```typescript
folderMappingVaultSubpath: string;
folderMappingVaultSubpathDesc: string;
```

- [ ] **Step 2: Add values**

`ja`:
```typescript
folderMappingVaultSubpath: 'マッピング先（Vault 内パス）',
folderMappingVaultSubpathDesc: '例: 10_Input を指定するとリンク名と合わせて 10_Input/OCR に表示されます',
```

`en`:
```typescript
folderMappingVaultSubpath: 'Destination (in-vault path)',
folderMappingVaultSubpathDesc: 'e.g. 10_Input + link name OCR is shown as 10_Input/OCR',
```

`zh`:
```typescript
folderMappingVaultSubpath: '映射目标（Vault 内路径）',
folderMappingVaultSubpathDesc: '例: 指定 10_Input 后与链接名称组合显示为 10_Input/OCR',
```

- [ ] **Step 3: Run typecheck**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/core/i18n.ts && git commit -m "feat(i18n): F-050 vaultSubpath strings (2 keys × 3 locales)"
```

---

## Task 6: Modal field + list label

**Files:**
- Modify: `src/settings/FolderMappingModal.ts`
- Modify: `src/settings/SettingTabWhitelist.ts`

**Interfaces:**
- Consumes: `validateVaultSubpath` (Task 1), `s.folderMappingVaultSubpath` (Task 5), `FolderMapping.vaultSubpath`
- Produces: modal with 3 fields; save() builds target with `vaultSubpath: normalized`; row label shows `🔗 {vaultSubpath}/{linkName}`

- [ ] **Step 1: Update `FolderMappingModal.ts`**

Add field + import:

```typescript
import { validateLinkName, validateExternalPath, validateVaultSubpath } from '../features/folder-mapping/validation';
// class member:
private vaultSubpath = '10_Input';
```

In constructor: `this.vaultSubpath = opts?.editing?.vaultSubpath ?? this.vaultSubpath;`

In `onOpen()` — insert a new Setting AFTER the linkName field:

```typescript
new Setting(contentEl)
  .setName(s.folderMappingVaultSubpath)
  .setDesc(s.folderMappingVaultSubpathDesc)
  .addText((t) => t.setValue(this.vaultSubpath).onChange((v) => { this.vaultSubpath = v; this.refreshError(); }));
```

In `refreshError()` and `save()` — after the externalPath check, add:

```typescript
const r3 = validateVaultSubpath(this.vaultSubpath);
if (!r3.ok) { this.errorEl.textContent = `マッピング先: ${r3.reason}`; return; }
// in save(): (mirror of refreshError, with Notice instead)
```

In `save()` target construction (both branches): use `vaultSubpath: validateVaultSubpath(this.vaultSubpath).ok ? validateVaultSubpath(this.vaultSubpath).normalized : this.vaultSubpath` — better: compute once before the branches:

```typescript
const sub = validateVaultSubpath(this.vaultSubpath);
if (!sub.ok) { new Notice(`マッピング先エラー: ${sub.reason}`); return; }
// then use vaultSubpath: sub.normalized in target objects
```

In the edit-mode change detection, extend the condition:

```typescript
if (oldTarget.linkName !== this.linkName || oldTarget.externalPath !== this.externalPath || oldTarget.vaultSubpath !== sub.normalized) {
```

- [ ] **Step 2: Update `SettingTabWhitelist.ts` row label**

Change the row's first span:

```typescript
row.createEl('span', { text: `🔗 ${m.vaultSubpath}/${m.linkName}` });
```

- [ ] **Step 3: Run typecheck + full suite**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npx vitest run`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add src/settings/FolderMappingModal.ts src/settings/SettingTabWhitelist.ts && git commit -m "feat(settings-ui): F-050 マッピング先入力欄 + 一覧表示変更"
```

---

## Task 7: CHANGELOG + version bump + verification

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `src/manifest.json`, `Plugin/manifest.json`

- [ ] **Step 1: Prepend CHANGELOG entry**

```markdown
## [0.51.0] - 2026-09-16 — フォルダマッピング先の設定可能化 (F-050)

フォルダマッピングの Vault 内リンク先を `@10_Input` 固定から自由に指定できるように拡張
（例: `C:/OCR` → Vault 内 `10_Input/OCR` に表示）。既存レコードは `10_Input` へ自動移行、
旧 `@10_Input` の junction は起動時に自動で貼り直し。

- feat(folder-mapping): FolderMapping.vaultSubpath フィールド + validateVaultSubpath
- feat(folder-mapping): resolveLinkPath が vaultSubpath を使用 / 旧 @10_Input junction の自動貼り直し
- feat(settings): normalize が旧レコードへ vaultSubpath='10_Input' を注入
- feat(i18n): 2 keys × 3 locales
- feat(settings-ui): モーダルに「マッピング先（Vault 内パス）」欄追加・一覧表示を {vaultSubpath}/{linkName} に変更
- tests: +12 cases

制限事項: Obsidian はネットワークドライブ(NAS)をターゲットにした junction の中身を
インデックスしないため、Obsidian 表示はローカルドライブのフォルダのみ有効。
NAS mount 対応は Folder Bridge 系アプローチで別途検討。
```

- [ ] **Step 2: Bump versions 0.50.0 → 0.51.0** in all 3 files.

- [ ] **Step 3: Full verification**

Run: `cd "D:/AI-Agent/ClaudianBridge" && npm run typecheck && npx vitest run && npm run build`
Expected: all green (~1411+ tests).

- [ ] **Step 4: Commit (do NOT push / do NOT open PR — controller handles)**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add CHANGELOG.md package.json src/manifest.json Plugin/manifest.json && git commit -m "chore(release): v0.51.0 F-050 フォルダマッピング先設定可能化"
```

---

## Self-Review Checklist

- [ ] R1〜R8 all covered (R1/R2→Task 6, R3→Task 3, R4→Task 4, R5→Task 1, R6→Task 2, R7→Task 7, R8→Tasks 2-4 minimal diff)
- [ ] No placeholders / TBD
- [ ] `vaultSubpath` naming consistent across all tasks
- [ ] Legacy constant `LEGACY_SUBPATH` defined once (Task 4)
- [ ] Existing 1399 tests remain green

---

*📚 Plan v1.0 · ClaudianBridge F-050 · 2026-09-16*
