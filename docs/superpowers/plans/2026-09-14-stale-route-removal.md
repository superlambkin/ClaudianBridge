# Stale Route One-Click Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "🧹 Remove stale routes" button to the Network tab that, when Obsidian is running as administrator, deletes stale VPN routes left over from previous sessions.

**Architecture:** Build on the v0.45.0 detection logic (`expectedGateway` from DHCP-serv log + `getVpnRouteGateways()`). Add three pure functions (`isRunningAsAdmin`, `findStaleRoutes`, `getVpnRoutes`) plus one side-effecting function (`removeStaleRoutes`). All OS interactions go through `child_process.execSync` (mocked in tests).

**Tech Stack:** TypeScript, Node.js `child_process.execSync`, Obsidian plugin (i18n), vitest, esbuild.

## Global Constraints

- Existing tests: 1337 (must remain green)
- Target: v0.46.0 release, F-046, branch `feat/v0.46.0-stale-route-removal`
- Strict TDD: write failing test → run → implement → run → commit
- Mock `execSync` via `vi.mock('child_process', ...)` — never run real `route` commands in tests
- Route deletion targets ONLY VPN-related destinations (0.0.0.0/1, 128.0.0.0/1, 10.8.0.0/8) — never LAN routes
- All new code paths must have an i18n key for ja/en/zh
- Branch policy: create `feat/v0.46.0-stale-route-removal` from `main`, merge via PR

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/features/network/types.ts` | Add `VpnRoute`, `RemoveStaleResult`, `RemoveStaleOptions` types | Modify |
| `src/features/network/openvpn.ts` | Add `getVpnRoutes`, `isRunningAsAdmin`, `findStaleRoutes`, `removeStaleRoutes` | Modify |
| `src/core/i18n.ts` | Add 5 new keys × 3 locales | Modify |
| `src/settings/SettingTabNetwork.ts` | Wire up the 🧹 button (conditional render + click handler) | Modify |
| `tests/features/network/openvpn.test.ts` | Add 8 test cases | Modify |
| `CHANGELOG.md` | Add `[0.46.0]` entry | Modify |
| `package.json` | Bump version 0.45.0 → 0.46.0 | Modify |
| `src/manifest.json` | Bump version 0.45.0 → 0.46.0 | Modify |
| `Plugin/manifest.json` | Bump version 0.45.0 → 0.46.0 | Modify |

---

## Task 1: i18n strings (5 keys × 3 locales)

**Files:**
- Modify: `src/core/i18n.ts` (find the locale strings object, add 5 keys in each of ja, en, zh)

**Interfaces:**
- Consumes: nothing
- Produces: string keys `networkOpenVpnRemoveStale`, `networkOpenVpnRemoved`, `networkOpenVpnRemoveFailed`, `networkOpenVpnNeedAdmin`, `networkOpenVpnRemoving` in all three locales

- [ ] **Step 1: Open `src/core/i18n.ts` and locate the locale objects for ja, en, zh (likely named `ja`, `en`, `zh` or `stringsJa`, `stringsEn`, `stringsZh`)**

- [ ] **Step 2: Add the 5 new keys to each locale**

For `ja`:
```typescript
networkOpenVpnRemoveStale: '🧹 残骸経路を削除',
networkOpenVpnRemoved: '✅ {count} 件の残骸経路を削除しました',
networkOpenVpnRemoveFailed: '❌ 残骸経路の削除に失敗しました',
networkOpenVpnNeedAdmin: '⚠️ Obsidian を管理者として再起動してから削除してください',
networkOpenVpnRemoving: '🧹 残骸経路を削除中です…',
```

For `en`:
```typescript
networkOpenVpnRemoveStale: '🧹 Remove stale routes',
networkOpenVpnRemoved: '✅ Removed {count} stale routes',
networkOpenVpnRemoveFailed: '❌ Failed to remove stale routes',
networkOpenVpnNeedAdmin: '⚠️ Restart Obsidian as admin to remove',
networkOpenVpnRemoving: '🧹 Removing stale routes…',
```

For `zh`:
```typescript
networkOpenVpnRemoveStale: '🧹 删除残留路由',
networkOpenVpnRemoved: '✅ 已删除 {count} 条残留路由',
networkOpenVpnRemoveFailed: '❌ 删除残留路由失败',
networkOpenVpnNeedAdmin: '⚠️ 请以管理员身份重启 Obsidian 后再删除',
networkOpenVpnRemoving: '🧹 正在删除残留路由…',
```

> NOTE: TypeScript template strings must use ASCII quotes, NOT Japanese 「」, inside zh strings. Verify by checking existing zh entries.

- [ ] **Step 3: Run `npm run typecheck` to verify**

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge
git add src/core/i18n.ts
git commit -m "feat(i18n): F-046 stale route removal strings (5 keys × 3 locales)"
```

---

## Task 2: Type definitions

**Files:**
- Modify: `src/features/network/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```typescript
  export type VpnRoute = { dest: string; mask: string; gateway: string };
  export type RemoveStaleResult =
    | { ok: true; removed: number; failed: string[] }
    | { ok: false; reason: 'need-admin' | 'no-routes' | 'exec-failed'; detail: string };
  ```

- [ ] **Step 1: Open `src/features/network/types.ts`**

- [ ] **Step 2: Add the two new types at the end of the file**

```typescript
/** F-046: dest/mask/gateway の3-tuple（VPN 関連ルートのみ） */
export type VpnRoute = {
  dest: string;
  mask: string;
  gateway: string;
};

/** F-046: removeStaleRoutes() の戻り値 */
export type RemoveStaleResult =
  | { ok: true; removed: number; failed: string[] }
  | { ok: false; reason: 'need-admin' | 'no-routes' | 'exec-failed'; detail: string };
```

- [ ] **Step 3: Run `npm run typecheck`**

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/features/network/types.ts
git commit -m "feat(network): F-046 type definitions (VpnRoute, RemoveStaleResult)"
```

---

## Task 3: getVpnRoutes() — extend v0.45.0's gateway extractor

**Files:**
- Modify: `src/features/network/openvpn.ts` (insert after `getVpnRouteGateways()`)
- Test: `tests/features/network/openvpn.test.ts` (add test cases)

**Interfaces:**
- Consumes: `execSync` from `child_process` (mocked in test)
- Produces:
  ```typescript
  private getVpnRoutes(): VpnRoute[] | null
  ```

- [ ] **Step 1: Write failing test**

In `tests/features/network/openvpn.test.ts`, add:

```typescript
import { execSync } from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

describe('OpenVpnController.getVpnRoutes', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('returns dest/mask/gateway triples for VPN routes', () => {
    vi.mocked(execSync).mockReturnValueOnce(`
IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.10     25
        128.0.0.0        128.0.0.0         10.8.0.5       10.8.0.6    100
        10.8.0.0      255.255.255.0         10.8.0.5       10.8.0.6    100
===========================================================================
`.trim());
    // Use the controller via a test harness — see test file for getController() pattern
    const c = makeController();
    const routes = c.getVpnRoutesForTest();
    expect(routes).toEqual([
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.5' },
    ]);
  });

  it('returns null when execSync throws', () => {
    vi.mocked(execSync).mockImplementationOnce(() => { throw new Error('fail'); });
    const c = makeController();
    expect(c.getVpnRoutesForTest()).toBeNull();
  });

  it('skips On-link routes (no gateway column entry)', () => {
    vi.mocked(execSync).mockReturnValueOnce(`
        10.8.0.0      255.255.255.0        On-link        10.8.0.6    100
`.trim());
    const c = makeController();
    expect(c.getVpnRoutesForTest()).toEqual([]);
  });
});
```

> NOTE: `getVpnRoutesForTest()` is a test-only escape hatch — see Step 3 below for how to expose it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/openvpn.test.ts -t "getVpnRoutes"`
Expected: FAIL — `getVpnRoutesForTest is not a function`

- [ ] **Step 3: Add `getVpnRoutes()` to OpenVpnControllerImpl**

In `src/features/network/openvpn.ts`, after `getVpnRouteGateways()`:

```typescript
/**
 * F-046: VPN 関連ルートの dest/mask/gateway 3-tuple を抽出する。
 * v0.45.0 の getVpnRouteGateways() を拡張し、dest/mask 情報を保持する。
 * 判定不能（route print 失敗）なら null。
 */
private getVpnRoutes(): VpnRoute[] | null {
  try {
    const out = execSync('route print -4', {
      encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const routes: VpnRoute[] = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(
        /^\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\.\d+\.\d+\.\d+\s+\d+\s*$/,
      );
      if (!m) continue;
      const [, dest, mask, gateway] = m;
      const isVpnDest =
        (dest === '0.0.0.0' && mask === '128.0.0.0')
        || (dest === '128.0.0.0' && mask === '128.0.0.0')
        || dest.startsWith('10.8.');
      if (isVpnDest) routes.push({ dest, mask, gateway });
    }
    return routes;
  } catch {
    return null;
  }
}

/** Test-only escape hatch for getVpnRoutes(). */
public getVpnRoutesForTest(): VpnRoute[] | null {
  return this.getVpnRoutes();
}
```

Add to imports at top:
```typescript
import type { VpnRoute } from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/openvpn.test.ts -t "getVpnRoutes"`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/network/openvpn.ts tests/features/network/openvpn.test.ts
git commit -m "feat(network): F-046 getVpnRoutes() — extract dest/mask/gateway triples"
```

---

## Task 4: findStaleRoutes() — pure route filter

**Files:**
- Modify: `src/features/network/openvpn.ts`
- Test: `tests/features/network/openvpn.test.ts`

**Interfaces:**
- Consumes: `routes: VpnRoute[]`, `expectedGateway: string | null`
- Produces: `VpnRoute[]` (filtered stale routes)

- [ ] **Step 1: Write failing test**

```typescript
describe('OpenVpnController.findStaleRoutes', () => {
  it('returns routes whose gateway differs from expected', () => {
    const c = makeController();
    const routes: VpnRoute[] = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
      { dest: '0.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.13' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.13' },
    ];
    expect(c.findStaleRoutesForTest(routes, '10.8.0.5')).toEqual([
      { dest: '0.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.13' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.13' },
    ]);
  });

  it('returns all routes when expectedGateway is null (safe side)', () => {
    const c = makeController();
    const routes: VpnRoute[] = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
    ];
    expect(c.findStaleRoutesForTest(routes, null)).toEqual(routes);
  });

  it('returns empty array when all routes match expected', () => {
    const c = makeController();
    const routes: VpnRoute[] = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
    ];
    expect(c.findStaleRoutesForTest(routes, '10.8.0.5')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "findStaleRoutes"`
Expected: FAIL — `findStaleRoutesForTest is not a function`

- [ ] **Step 3: Implement**

```typescript
/**
 * F-046: expectedGateway と異なるゲートウェイを持つルートを stale として返す。
 * expectedGateway が null の場合は全 VPN ルートを stale 扱い（安全側）。
 */
private findStaleRoutes(routes: VpnRoute[], expectedGateway: string | null): VpnRoute[] {
  if (expectedGateway === null) return [...routes];
  return routes.filter((r) => r.gateway !== expectedGateway);
}

public findStaleRoutesForTest(routes: VpnRoute[], expectedGateway: string | null): VpnRoute[] {
  return this.findStaleRoutes(routes, expectedGateway);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "findStaleRoutes"`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/network/openvpn.ts tests/features/network/openvpn.test.ts
git commit -m "feat(network): F-046 findStaleRoutes() — filter by expected gateway"
```

---

## Task 5: isRunningAsAdmin() — admin privilege probe

**Files:**
- Modify: `src/features/network/openvpn.ts`
- Test: `tests/features/network/openvpn.test.ts`

**Interfaces:**
- Consumes: `execSync` (mocked)
- Produces: `boolean`

- [ ] **Step 1: Write failing test**

```typescript
describe('OpenVpnController.isRunningAsAdmin', () => {
  beforeEach(() => vi.mocked(execSync).mockReset());

  it('returns true when route delete succeeds (admin allowed)', () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));
    const c = makeController();
    expect(c.isRunningAsAdminForTest()).toBe(true);
  });

  it('returns false when stderr contains ERROR_ACCESS_DENIED', () => {
    const err = new Error('Command failed') as Error & { stderr: Buffer };
    err.stderr = Buffer.from('ERROR_ACCESS_DENIED');
    vi.mocked(execSync).mockImplementationOnce(() => { throw err; });
    const c = makeController();
    expect(c.isRunningAsAdminForTest()).toBe(false);
  });

  it('returns false when execSync throws unrelated error', () => {
    vi.mocked(execSync).mockImplementationOnce(() => { throw new Error('something else'); });
    const c = makeController();
    expect(c.isRunningAsAdminForTest()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "isRunningAsAdmin"`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
/**
 * F-046: プロセスが管理者として実行されているか判定する。
 * 失敗確実な route delete コマンドを試し打ちし、stderr で判定する。
 * - exit 0 → 管理者
 * - stderr に "ERROR_ACCESS_DENIED" → 非管理者
 */
private isRunningAsAdmin(): boolean {
  try {
    execSync('route delete 0.0.0.0 mask 128.0.0.0 10.255.255.255', {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000,
    });
    return true;
  } catch (e) {
    const stderr = (e as { stderr?: Buffer | string }).stderr;
    const text = stderr ? (typeof stderr === 'string' ? stderr : stderr.toString()) : '';
    if (text.includes('ERROR_ACCESS_DENIED')) return false;
    return false; // その他のエラーも安全側に倒して非管理者扱い
  }
}

public isRunningAsAdminForTest(): boolean {
  return this.isRunningAsAdmin();
}
```

> NOTE: execSync の正常終了パス（exit 0）でも、stderr に ERROR_ACCESS_DENIED が混入する可能性は実質ゼロ。安全側に倒す。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "isRunningAsAdmin"`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/network/openvpn.ts tests/features/network/openvpn.test.ts
git commit -m "feat(network): F-046 isRunningAsAdmin() — privilege probe"
```

---

## Task 6: removeStaleRoutes() — orchestrate admin check + delete + re-verify

**Files:**
- Modify: `src/features/network/openvpn.ts`
- Test: `tests/features/network/openvpn.test.ts`

**Interfaces:**
- Consumes: nothing (uses `this.expectedGateway`, `this.getVpnRoutes()`, `this.isRunningAsAdmin()`)
- Produces: `Promise<RemoveStaleResult>`

- [ ] **Step 1: Write failing test**

```typescript
describe('OpenVpnController.removeStaleRoutes', () => {
  beforeEach(() => vi.mocked(execSync).mockReset());

  it('returns need-admin when not elevated', async () => {
    const err = new Error('denied') as Error & { stderr: Buffer };
    err.stderr = Buffer.from('ERROR_ACCESS_DENIED');
    vi.mocked(execSync).mockImplementationOnce(() => { throw err; });
    const c = makeController();
    const result = await c.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: false, reason: 'need-admin', detail: expect.any(String) });
  });

  it('returns no-routes when getVpnRoutes returns null', async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from(''))  // isRunningAsAdmin
      .mockImplementationOnce(() => { throw new Error('route print failed'); }); // getVpnRoutes
    const c = makeController();
    const result = await c.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: false, reason: 'no-routes', detail: expect.any(String) });
  });

  it('removes all stale routes when admin', async () => {
    // admin probe
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));
    // route print
    vi.mocked(execSync).mockReturnValueOnce(`
        128.0.0.0        128.0.0.0         10.8.0.13       10.8.0.6    100
        10.8.0.0      255.255.255.0         10.8.0.13       10.8.0.6    100
`.trim());
    // 2 × route delete (success)
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));
    const c = makeController();
    c.setExpectedGatewayForTest('10.8.0.5');
    const result = await c.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: true, removed: 2, failed: [] });
  });

  it('records failed routes when route delete throws', async () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('')); // admin
    vi.mocked(execSync).mockReturnValueOnce(`
        128.0.0.0        128.0.0.0         10.8.0.13       10.8.0.6    100
`.trim()); // route print
    const fail = new Error('delete failed');
    vi.mocked(execSync).mockImplementationOnce(() => { throw fail; });
    const c = makeController();
    c.setExpectedGatewayForTest('10.8.0.5');
    const result = await c.removeStaleRoutesForTest();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toBe(0);
      expect(result.failed).toEqual(['128.0.0.0/255.255.255.255 via 10.8.0.13']);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "removeStaleRoutes"`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
/**
 * F-046: 残骸経路を削除する（公開 API）。
 * 1. isRunningAsAdmin() で管理者判定
 * 2. getVpnRoutes() で VPN ルート取得
 * 3. findStaleRoutes() で expectedGateway 以外を抽出
 * 4. 各 stale ルートに対し route delete を実行
 * 5. 結果を RemoveStaleResult で返す
 */
public async removeStaleRoutes(): Promise<RemoveStaleResult> {
  if (!this.isRunningAsAdmin()) {
    return { ok: false, reason: 'need-admin', detail: 'Obsidian を管理者として再起動してください' };
  }

  const routes = this.getVpnRoutes();
  if (routes === null) {
    return { ok: false, reason: 'no-routes', detail: 'route print に失敗しました' };
  }

  const stale = this.findStaleRoutes(routes, this.expectedGateway);
  if (stale.length === 0) {
    return { ok: true, removed: 0, failed: [] };
  }

  let removed = 0;
  const failed: string[] = [];
  for (const r of stale) {
    try {
      execSync(`route delete ${r.dest} mask ${r.mask} ${r.gateway}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000,
      });
      removed++;
    } catch (e) {
      failed.push(`${r.dest}/${r.mask} via ${r.gateway}`);
    }
  }

  // 削除後に警告を再評価
  this.verifyRoutes();

  return { ok: true, removed, failed };
}

public async removeStaleRoutesForTest(): Promise<RemoveStaleResult> {
  return this.removeStaleRoutes();
}

public setExpectedGatewayForTest(gw: string | null): void {
  this.expectedGateway = gw;
}
```

Add import: `import type { RemoveStaleResult } from './types';`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/network/openvpn.test.ts -t "removeStaleRoutes"`
Expected: 4 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd D:/AI-Agent/ClaudianBridge && npm test`
Expected: 1345+ tests PASS (1337 existing + 8 new)

- [ ] **Step 6: Commit**

```bash
git add src/features/network/openvpn.ts tests/features/network/openvpn.test.ts
git commit -m "feat(network): F-046 removeStaleRoutes() — admin-gated route removal"
```

---

## Task 7: Network tab UI — 🧹 Remove button

**Files:**
- Modify: `src/settings/SettingTabNetwork.ts`

**Interfaces:**
- Consumes: `controller.removeStaleRoutes()`, `controller.getWarning()`, `controller.subscribe()`
- Produces: visible 🧹 button when stale routes detected

- [ ] **Step 1: Open `src/settings/SettingTabNetwork.ts` and locate `renderOpenVpnStatus()`**

- [ ] **Step 2: Add the button after `copyBtn`**

```typescript
// F-046: 残骸経路削除ボタン（検知時のみ表示）
const removeBtn = containerEl.createEl('button', {
  text: s.networkOpenVpnRemoveStale,
  cls: 'cb-vpn-remove-stale',
});
removeBtn.style.display = 'none';
removeBtn.addEventListener('click', async () => {
  removeBtn.style.display = 'none'; // 多重押下防止
  new Notice(s.networkOpenVpnRemoving);
  try {
    const result = await controller.removeStaleRoutes();
    if (!result.ok) {
      const msg = result.reason === 'need-admin'
        ? s.networkOpenVpnNeedAdmin
        : s.networkOpenVpnRemoveFailed;
      new Notice(`${msg}\n${result.detail}`);
      removeBtn.style.display = ''; // 再押下可能に
    } else {
      new Notice(s.networkOpenVpnRemoved.replace('{count}', String(result.removed)));
      if (result.failed.length > 0) {
        new Notice(`失敗: ${result.failed.join(', ')}`);
      }
    }
  } catch (e) {
    new Notice(s.networkOpenVpnRemoveFailed.replace('{msg}', (e as Error).message));
    removeBtn.style.display = '';
  }
});
containerEl.append(removeBtn);
```

- [ ] **Step 3: Update `updateUI()` to toggle the button**

Modify the existing `updateUI` callback:

```typescript
const updateUI = (status: OpenVpnStatus, log: string): void => {
  statusEl.setText(`${s.networkOpenVpnStatus}: ${labelOf(status)}`);
  const warning = controller.getWarning();
  warnEl.setText(warning ? `⚠️ ${warning}` : '');
  warnEl.style.display = warning ? '' : 'none';
  // F-046: 警告に「残骸」が含まれる場合のみ削除ボタンを表示
  removeBtn.style.display = warning && warning.includes('残骸') ? '' : 'none';
  logEl.textContent = log.slice(-2000);
};
```

- [ ] **Step 4: Run typecheck + build**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck && npm run build`
Expected: exit 0 both

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingTabNetwork.ts
git commit -m "feat(network): F-046 🧹 Remove stale routes button in Network tab"
```

---

## Task 8: Version sync + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `src/manifest.json`, `Plugin/manifest.json`

- [ ] **Step 1: Bump versions in 4 files**

`package.json`:
```diff
-  "version": "0.45.0",
+  "version": "0.46.0",
```

`src/manifest.json`:
```diff
-  "version": "0.45.0",
+  "version": "0.46.0",
```

`Plugin/manifest.json`:
```diff
-  "version": "0.45.0",
+  "version": "0.46.0",
```

- [ ] **Step 2: Add CHANGELOG entry**

At the top of `CHANGELOG.md`:

```markdown
## [0.46.0] - 2026-09-14 — 残骸経路の 1 クリック削除 (F-046)

v0.45.0 の検知ロジックを基盤に、stale 経路を 1 クリックで削除する UX を追加。
VPN 使用時は Obsidian を管理者起動する運用を前提に、ボタン押下時に
管理者判定 → stale 抽出 → route delete → 結果通知のフローを提供。
VPN 関連ルートのみを厳格にホワイトリスト化し、ローカル LAN は触らない。

- feat(network): 🧹 Remove stale routes button (admin-gated)
- feat(network): getVpnRoutes() — extend v0.45.0 extractor with dest/mask
- feat(network): isRunningAsAdmin() — privilege probe via route delete trial
- feat(network): findStaleRoutes() — filter by expected gateway
- feat(network): removeStaleRoutes() — orchestrate admin + delete + re-verify
- feat(i18n): 5 keys × 3 locales (ja/en/zh)
- tests: +8 cases (1345 total)
```

- [ ] **Step 3: Build + verify**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build && npm test`
Expected: build exit 0, all tests PASS

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json src/manifest.json Plugin/manifest.json
git commit -m "chore(release): v0.46.0 F-046 stale route one-click removal"
```

---

## Task 9: Deploy + verify

**Files:**
- Deploy to: `C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/ClaudianBridge/`

- [ ] **Step 1: Build final**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: exit 0

- [ ] **Step 2: Deploy**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run deploy`
Expected: deployment script copies Plugin/* to Vault plugin dir and writes marker

- [ ] **Step 3: Verify deployed version**

Run: `cat "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/ClaudianBridge/manifest.json" | grep version`
Expected: `"version": "0.46.0"`

- [ ] **Step 4: Commit (if any post-deploy adjustments)**

If deploy script modified any tracked files, commit them. Otherwise skip.

---

## Task 10: Push branch + create PR + release

- [ ] **Step 1: Push branch**

```bash
cd D:/AI-Agent/ClaudianBridge
git push -u origin feat/v0.46.0-stale-route-removal
```

- [ ] **Step 2: Create PR via gh**

```bash
gh pr create --base main --head feat/v0.46.0-stale-route-removal \
  --title "feat(network): F-046 stale route one-click removal (v0.46.0)" \
  --body "v0.45.0 の検知ロジックを基盤に、stale 経路を 1 クリックで削除する UX を追加。VPN 使用時は Obsidian を管理者起動する運用を前提。"
```

- [ ] **Step 3: After PR approval and merge: tag and create release**

```bash
cd D:/AI-Agent/ClaudianBridge
git checkout main
git pull
git tag v0.46.0
git push origin v0.46.0
gh release create v0.46.0 \
  --title "v0.46.0 — 残骸経路の 1 クリック削除 (F-046)" \
  --notes "## 概要
VPN 切断→再接続時に残る残骸経路を、Obsidian 管理者起動中に 1 クリックで削除できるボタンを追加。

## 前提
- VPN 使用時は Obsidian を管理者として実行
- 削除対象は VPN 関連ルートのみ（ローカル LAN は触らない）

## 変更
- feat(network): 🧹 Remove stale routes button (admin-gated)
- feat(network): getVpnRoutes() / isRunningAsAdmin() / findStaleRoutes() / removeStaleRoutes()
- tests: +8 cases (1345 total)"
```

---

## Self-Review Checklist

- [x] Spec coverage: All 6 requirements (A-F) covered in tasks 1-7
- [x] No placeholders: All code blocks concrete
- [x] Type consistency: `VpnRoute`, `RemoveStaleResult` defined in Task 2, used in Tasks 3-6
- [x] Test isolation: All `execSync` calls mocked; `removeStaleRoutes` is async because of UI integration (not because of I/O)
- [x] Security: Route deletion whitelist is the same as `getVpnRoutes()` — no LAN routes can be touched
