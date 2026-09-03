# 自己更新機能（更新ボタン + GitHub Releases）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定画面の「更新を確認」ボタンで GitHub Releases の最新版をダウンロードし、プラグインを自動リロードできるようにする。

**Architecture:** `src/features/self-update/` に UpdateChecker / BackupManager / UpdateDownloader / Reloader の 4 コンポーネントを新設。ビルド成果物を Git tracked の `Plugin/` 3 ファイルに集約し、手動 `gh release create` で配布する。HTTP は既存 `src/features/quota/http.ts` の `httpGet` パターンを踏襲（Obsidian `requestUrl` / fetch フォールバック）。

**Tech Stack:** TypeScript / esbuild / vitest / Obsidian API (`requestUrl`, `app.plugins`, `app.vault.adapter`)

**Spec:** `docs/superpowers/specs/2026-09-03-self-update-design.md`（D1 ロールバック手順はスキップ済み・v0.32.9 ベースで実施）

## Global Constraints

- 対象バージョン: v0.32.9 → v0.32.10 でリリース
- `Plugin/` 配下は `main.js` / `manifest.json` / `styles.css` の 3 ファイルのみ（Git tracked）
- バージョン SSOT: `src/manifest.json`（`PLUGIN_VERSION` はこれを参照）
- 更新検知は semver 厳密比較（`v` プレフィックス除去・Major.Minor.Patch のみ・prerelease 対象外）
- HTTP は `src/features/quota/http.ts` の `httpGet` を再利用（新規 HTTP クライアントを作らない）
- バックアップ先: `<pluginDir>/.backup/<UTC-ISO>/`（秒精度・衝突時は `-001` 連番）
- リロードは `app.plugins.disablePlugin(id)` → `enablePlugin(id)`
- GitHub API: `https://api.github.com/repos/superlambkin/ClaudianBridge/releases/latest`（認証不要・`Accept: application/vnd.github+json`）
- i18n 文字列は `src/core/i18n.ts` の `LocaleStrings` に日本語 + 英語の両ロケールで追加
- テストは vitest・`vi.mock('obsidian', ...)` パターン（既存 `tests/features/quick-reply/core.test.ts` に準拠）
- 全テスト合格（現行 830+）を維持すること

---

### Task 1: ビルドパイプライン修正（Plugin/ 新設）

**Files:**
- Create: `Plugin/main.js`（ビルドで生成）
- Create: `Plugin/manifest.json`（src/manifest.json のコピー）
- Create: `Plugin/styles.css`（ルート styles.css のコピー）
- Modify: `esbuild.config.mjs:37`（outfile）
- Modify: `scripts/deploy.mjs`（Plugin/ からコピーするよう改修）
- Modify: `.gitignore`（`!/Plugin/` 追加）

**Interfaces:**
- Consumes: なし（既存ビルドの改修）
- Produces: `Plugin/` 配下に 3 ファイル。`npm run build` で必ず最新化される。Task 8（Release アップロード）と Task 7（UpdateDownloader の配布元）がこれに依存

- [ ] **Step 1: esbuild.config.mjs の outfile を変更**

```js
// 変更前
  outfile: 'main.js',
// 変更後
  outfile: 'Plugin/main.js',
```

- [ ] **Step 2: .gitignore に Plugin/ の例外を追加**

末尾に追記（`Plugin/` 配下のみ tracked・中間生成物を除外しないため明示）:

```gitignore

# build artifacts published to GitHub Releases (Git tracked intentionally)
!Plugin/
```

- [ ] **Step 3: scripts/deploy.mjs を Plugin/ コピー方式に改修**

共有スクリプト `obsidian-deploy.mjs` はルート `main.js` を要求するため、3 ファイルのコピーを repo 側で実施するよう `spawnSync` 呼び出し（17-21 行目）と `dest` 定義（47 行目）の間を差し替える:

```js
// --- Plugin 3 ファイル: Plugin/ (SSOT) から Vault へコピー ---
const pluginDir = join(process.cwd(), "Plugin");
const dest = join(resolveVaultPath(), ".obsidian", "plugins", "ClaudianBridge");
mkdirSync(dest, { recursive: true });
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
let pluginOk = true;
for (const f of PLUGIN_FILES) {
  const src = join(pluginDir, f);
  if (!existsSync(src)) {
    console.error(`❌ Plugin file missing: ${src} (run: npm run build)`);
    pluginOk = false;
    continue;
  }
  const target = join(dest, f);
  copyFileSync(src, target);
  console.log(`✅ Plugin/${f} -> ${target}`);
}
// マーカー検証（旧共有スクリプトの代替）
const deployedMain = join(dest, "main.js");
if (pluginOk && existsSync(deployedMain)) {
  const content = readFileSync(deployedMain, "utf-8");
  const missing = ["Claudian Bridge", "ClaudianBridge"].filter((m) => !content.includes(m));
  if (missing.length > 0) {
    console.error(`❌ Deploy FAILED: markers not found in deployed main.js: ${missing.join(", ")}`);
    pluginOk = false;
  } else {
    console.log("🔍 Markers verified: Claudian Bridge, ClaudianBridge");
  }
}
```

- 併せて `const shared = ...` と `spawnSync(...)` のブロック（16-22 行目）と、旧 `const dest = ...`（47 行目）を削除
- ファイル末尾の `process.exit(result.status === 0 && pyOk ? 0 : 1);` を `process.exit(pluginOk && pyOk ? 0 : 1);` に変更

- [ ] **Step 4: ビルドして検証**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run build`
Expected: `Plugin/main.js` が生成され、`✅ Plugin/main.js -> ...` ログと `🔍 Markers verified` が出る。エラー 0

- [ ] **Step 5: Commit**

```bash
git add .gitignore esbuild.config.mjs scripts/deploy.mjs Plugin/manifest.json Plugin/styles.css
git add Plugin/main.js
git commit -m "build(v0.32.10): Plugin/ ディレクトリ新設・デプロイ SSOT 化（自己更新機能 前提タスク）"
```

---

### Task 2: UpdateChecker（GitHub Releases 検知 + semver 比較）

**Files:**
- Create: `src/features/self-update/types.ts`
- Create: `src/features/self-update/update-checker.ts`
- Create: `src/features/self-update/index.ts`（barrel・後続タスクで export 追加）
- Test: `tests/features/self-update/update-checker.test.ts`

**Interfaces:**
- Consumes: `httpGet` from `../../quota/http`（`httpGet(url, headers): Promise<{ status, ok, json(): Promise<unknown> }>`）
- Produces:
  - `types.ts`: `interface ReleaseAsset { name: string; browser_download_url: string }` / `interface UpdateCheckResult { updateAvailable: boolean; tagName: string; assets: ReleaseAsset[] }`
  - `update-checker.ts`: `export const RELEASES_LATEST_URL: string` / `export function compareSemver(a: string, b: string): number`（a<b で負・a>b で正・同等で 0）/ `export function stripVPrefix(tag: string): string` / `export async function checkForUpdate(localVersion: string): Promise<UpdateCheckResult>`

- [ ] **Step 1: 型定義を作成**

`src/features/self-update/types.ts`:

```ts
/** GitHub Release のアセット（配布ファイル） */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/** 更新チェック結果 */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  tagName: string;
  assets: ReleaseAsset[];
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/features/self-update/update-checker.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { compareSemver, stripVPrefix, checkForUpdate } from '../../../src/features/self-update/update-checker';

// httpGet をモック（quota/http の fetch フォールバックに依存しない）
const httpGetMock = vi.fn();
vi.mock('../../../src/features/quota/http', () => ({
  httpGet: (...args: unknown[]) => httpGetMock(...args),
}));

afterEach(() => httpGetMock.mockReset());

describe('compareSemver', () => {
  it.each([
    ['0.32.9', '0.32.10', -1],
    ['0.32.10', '0.32.9', 1],
    ['0.32.9', '0.32.9', 0],
    ['1.0.0', '0.9.9', 1],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
  });
});

describe('stripVPrefix', () => {
  it('v プレフィックスを除去する', () => {
    expect(stripVPrefix('v0.32.10')).toBe('0.32.10');
    expect(stripVPrefix('0.32.10')).toBe('0.32.10');
  });
});

describe('checkForUpdate', () => {
  const apiResponse = {
    tag_name: 'v0.32.10',
    assets: [
      { name: 'main.js', browser_download_url: 'https://example.com/main.js' },
      { name: 'manifest.json', browser_download_url: 'https://example.com/manifest.json' },
      { name: 'styles.css', browser_download_url: 'https://example.com/styles.css' },
    ],
  };

  it('リモートが新しければ updateAvailable=true', async () => {
    httpGetMock.mockResolvedValue({ status: 200, ok: true, json: async () => apiResponse });
    const r = await checkForUpdate('0.32.9');
    expect(r).toEqual({ updateAvailable: true, tagName: 'v0.32.10', assets: apiResponse.assets });
  });

  it('リモートが同じか古ければ updateAvailable=false', async () => {
    httpGetMock.mockResolvedValue({ status: 200, ok: true, json: async () => apiResponse });
    expect((await checkForUpdate('0.32.10')).updateAvailable).toBe(false);
    expect((await checkForUpdate('1.0.0')).updateAvailable).toBe(false);
  });

  it('404 で例外を投げる', async () => {
    httpGetMock.mockResolvedValue({ status: 404, ok: false, json: async () => ({}) });
    await expect(checkForUpdate('0.32.9')).rejects.toThrow(/404/);
  });

  it('403（レート制限）で例外を投げる', async () => {
    httpGetMock.mockResolvedValue({ status: 403, ok: false, json: async () => ({}) });
    await expect(checkForUpdate('0.32.9')).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/self-update/update-checker.test.ts`
Expected: FAIL（`update-checker` モジュールが存在しない）

- [ ] **Step 4: UpdateChecker を実装**

`src/features/self-update/update-checker.ts`:

```ts
/**
 * GitHub Releases の最新版を取得し、ローカルバージョンと比較する。
 * Spec: docs/superpowers/specs/2026-09-03-self-update-design.md (D4, D5)
 */
import { httpGet } from '../quota/http';
import type { ReleaseAsset, UpdateCheckResult } from './types';

export const RELEASES_LATEST_URL =
  'https://api.github.com/repos/superlambkin/ClaudianBridge/releases/latest';

const GH_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ClaudianBridge-Plugin',
};

/** タグの `v` プレフィックスを除去（D5） */
export function stripVPrefix(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

/** semver 厳密比較（a<b:負 / a>b:正 / 同等:0）。Major.Minor.Patch のみ */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface GithubLatestRelease {
  tag_name?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

/** 最新 Release を取得してローカルバージョンと比較する */
export async function checkForUpdate(localVersion: string): Promise<UpdateCheckResult> {
  const res = await httpGet(RELEASES_LATEST_URL, GH_HEADERS);
  if (res.status === 404) throw new Error(`GitHub API 404: Release が見つかりません (${RELEASES_LATEST_URL})`);
  if (res.status === 403) throw new Error('GitHub API 403: レート制限です。1 時間後に再試行してください');
  if (!res.ok) throw new Error(`GitHub API error: HTTP ${res.status}`);
  const body = (await res.json()) as GithubLatestRelease;
  const tagName = body.tag_name ?? '';
  const assets: ReleaseAsset[] = (body.assets ?? [])
    .filter((a): a is { name: string; browser_download_url: string } =>
      typeof a.name === 'string' && typeof a.browser_download_url === 'string')
    .map((a) => ({ name: a.name, browser_download_url: a.browser_download_url }));
  return {
    updateAvailable: compareSemver(stripVPrefix(tagName), localVersion) > 0,
    tagName,
    assets,
  };
}
```

`src/features/self-update/index.ts`:

```ts
export * from './types';
export * from './update-checker';
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run tests/features/self-update/update-checker.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 6: Commit**

```bash
git add src/features/self-update tests/features/self-update
git commit -m "feat(v0.32.10): UpdateChecker（GitHub Releases 検知 + semver 比較）"
```

---

### Task 3: BackupManager（.backup 退避）

**Files:**
- Create: `src/features/self-update/backup-manager.ts`
- Modify: `src/features/self-update/index.ts`（export 追加）
- Test: `tests/features/self-update/backup-manager.test.ts`

**Interfaces:**
- Consumes: Obsidian `DataAdapter`（`exists`, `mkdir`, `list`, `readBinary`, `writeBinary`）。テストでは in-memory モックを使用
- Produces:
  - `BACKUP_TARGET_FILES: readonly string[]`（`['main.js', 'manifest.json', 'styles.css']`）
  - `backupPluginFiles(pluginDir: string, adapter: DataAdapter, now?: Date): Promise<string>` — 退避先ディレクトリパスを返す

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/self-update/backup-manager.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { backupPluginFiles, BACKUP_TARGET_FILES } from '../../../src/features/self-update/backup-manager';

/** in-memory DataAdapter モック */
function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    put(name: string, content: string) {
      files.set(name, new TextEncoder().encode(content).buffer as ArrayBuffer);
    },
    async exists(p: string) { return files.has(p); },
    async mkdir(p: string) { /* no-op */ },
    async list(_p: string) { return { files: [...files.keys()], folders: [] }; },
    async readBinary(p: string) {
      const b = files.get(p);
      if (!b) throw new Error(`not found: ${p}`);
      return b;
    },
    async writeBinary(p: string, data: ArrayBuffer) { files.set(p, data); },
  };
}

const FIXED_DATE = new Date('2026-09-04T12:34:56Z');

describe('backupPluginFiles', () => {
  it('対象は 3 ファイル', () => {
    expect(BACKUP_TARGET_FILES).toEqual(['main.js', 'manifest.json', 'styles.css']);
  });

  it('3 ファイルを .backup/<UTC-ISO>/ へ退避する', async () => {
    const ad = makeAdapter();
    ad.put('plugin/main.js', 'OLD');
    ad.put('plugin/manifest.json', '{}');
    ad.put('plugin/styles.css', 'body{}');
    const backupPath = await backupPluginFiles('plugin', ad, FIXED_DATE);
    expect(backupPath).toBe('plugin/.backup/2026-09-04T12-34-56Z');
    expect(await ad.exists('plugin/.backup/2026-09-04T12-34-56Z/main.js')).toBe(true);
    expect(new TextDecoder().decode(await ad.readBinary('plugin/.backup/2026-09-04T12-34-56Z/manifest.json'))).toBe('{}');
  });

  it('同一タイムスタンプで衝突時は -001 連番を採番する', async () => {
    const ad = makeAdapter();
    ad.put('plugin/main.js', 'OLD');
    ad.put('plugin/manifest.json', '{}');
    ad.put('plugin/styles.css', '');
    const first = await backupPluginFiles('plugin', ad, FIXED_DATE);
    const second = await backupPluginFiles('plugin', ad, FIXED_DATE);
    expect(second).toBe('plugin/.backup/2026-09-04T12-34-56Z-001');
    expect(first).toBe('plugin/.backup/2026-09-04T12-34-56Z');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/self-update/backup-manager.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: BackupManager を実装**

`src/features/self-update/backup-manager.ts`:

```ts
/**
 * 更新前のプラグイン 3 ファイルを <pluginDir>/.backup/<UTC-ISO>/ へ退避する。
 * Spec: docs/superpowers/specs/2026-09-03-self-update-design.md (D7)
 */
import type { DataAdapter } from 'obsidian';

export const BACKUP_TARGET_FILES = ['main.js', 'manifest.json', 'styles.css'] as const;

/** Date を UTC-ISO 風のディレクトリ名へ（例: 2026-09-04T12-34-56Z） */
function toUtcDirName(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/** プラグイン 3 ファイルを退避し、退避先パスを返す（衝突時は -001 連番） */
export async function backupPluginFiles(
  pluginDir: string,
  adapter: DataAdapter,
  now: Date = new Date(),
): Promise<string> {
  const base = `${pluginDir}/.backup`;
  let dirName = toUtcDirName(now);
  for (let n = 0; await adapter.exists(`${base}/${dirName}`); n++) {
    dirName = `${toUtcDirName(now)}-${String(n + 1).padStart(3, '0')}`;
  }
  const backupDir = `${base}/${dirName}`;
  await adapter.mkdir(backupDir);
  for (const f of BACKUP_TARGET_FILES) {
    const src = `${pluginDir}/${f}`;
    if (await adapter.exists(src)) {
      await adapter.writeBinary(`${backupDir}/${f}`, await adapter.readBinary(src));
    }
  }
  return backupDir;
}
```

`src/features/self-update/index.ts` に追記:

```ts
export * from './backup-manager';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/self-update/backup-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/self-update tests/features/self-update
git commit -m "feat(v0.32.10): BackupManager（.backup/<UTC-ISO>/ 退避）"
```

---

### Task 4: UpdateDownloader（3 ファイル DL・上書き）

**Files:**
- Create: `src/features/self-update/update-downloader.ts`
- Modify: `src/features/self-update/index.ts`
- Test: `tests/features/self-update/update-downloader.test.ts`

**Interfaces:**
- Consumes: `ReleaseAsset`（Task 2）、生バイナリ取得用の `downloadBinary(url): Promise<ArrayBuffer>`（本タスクで新設・`httpGet` と同じ requestUrl/fetch フォールバック方針。`quota/http.ts` は JSON 前提のため `arrayBuffer` 取得を self-update 側に実装）、Obsidian `DataAdapter`
- Produces: `downloadAssets(assets: ReleaseAsset[], pluginDir: string, adapter: DataAdapter): Promise<void>` / `downloadBinary(url: string): Promise<ArrayBuffer>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/self-update/update-downloader.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadAssets } from '../../../src/features/self-update/update-downloader';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    async mkdir(_p: string) {},
    async writeBinary(p: string, d: ArrayBuffer) { files.set(p, d); },
  };
}

const ASSETS = ['main.js', 'manifest.json', 'styles.css'].map((name) => ({
  name,
  browser_download_url: `https://example.com/${name}`,
}));

describe('downloadAssets', () => {
  it('3 ファイルを pluginDir へ上書きする', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(`NEW:${url}`).buffer as ArrayBuffer,
    }));
    const ad = makeAdapter();
    await downloadAssets(ASSETS, 'plugin', ad);
    expect(ad.files.size).toBe(3);
    const text = new TextDecoder().decode(ad.files.get('plugin/main.js'));
    expect(text).toBe('NEW:https://example.com/main.js');
  });

  it('1 ファイルでも失敗したら throw する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('styles.css')) return { ok: false, status: 500 };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    });
    const ad = makeAdapter();
    await expect(downloadAssets(ASSETS, 'plugin', ad)).rejects.toThrow(/styles\.css/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/self-update/update-downloader.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: UpdateDownloader を実装**

`src/features/self-update/update-downloader.ts`:

```ts
/**
 * GitHub Release アセット（3 ファイル）をダウンロードし Vault プラグインフォルダへ上書きする。
 * Spec: docs/superpowers/specs/2026-09-03-self-update-design.md (D6)
 */
import type { DataAdapter } from 'obsidian';
import type { ReleaseAsset } from './types';

/** バイナリ 1 件をダウンロード（Obsidian requestUrl / fetch フォールバック） */
export async function downloadBinary(url: string): Promise<ArrayBuffer> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const obs = require('obsidian') as { requestUrl?: (o: { url: string; method: string }) => Promise<{ status: number; arrayBuffer?: ArrayBuffer }> };
    if (typeof obs.requestUrl === 'function') {
      const res = await obs.requestUrl({ url, method: 'GET' });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}: ${url}`);
      return res.arrayBuffer ?? new ArrayBuffer(0);
    }
  } catch (e) {
    if (e instanceof Error && /HTTP \d+/.test(e.message)) throw e;
    /* obsidian 未解決環境は fetch へフォールバック */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.arrayBuffer();
}

/** アセットを順次ダウンロードして pluginDir へ上書き（1 件でも失敗すれば throw・D6） */
export async function downloadAssets(
  assets: ReleaseAsset[],
  pluginDir: string,
  adapter: DataAdapter,
): Promise<void> {
  for (const asset of assets) {
    try {
      const data = await downloadBinary(asset.browser_download_url);
      await adapter.writeBinary(`${pluginDir}/${asset.name}`, data);
    } catch (e) {
      throw new Error(`ダウンロード失敗: ${asset.name} — ${(e as Error).message}`);
    }
  }
}
```

`src/features/self-update/index.ts` に追記:

```ts
export * from './update-downloader';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/self-update/update-downloader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/self-update tests/features/self-update
git commit -m "feat(v0.32.10): UpdateDownloader（3 ファイル DL・上書き）"
```

---

### Task 5: Reloader（disable → enable）

**Files:**
- Create: `src/features/self-update/reloader.ts`
- Modify: `src/features/self-update/index.ts`
- Test: `tests/features/self-update/reloader.test.ts`

**Interfaces:**
- Consumes: Obsidian `App`（`app.plugins.enablePlugin/disablePlugin` — `SettingTabGeneral.ts:35-40` と同パターン）
- Produces: `reloadPlugin(app: App, pluginId: string): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/self-update/reloader.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { reloadPlugin } from '../../../src/features/self-update/reloader';

describe('reloadPlugin', () => {
  it('disablePlugin -> enablePlugin の順で呼ぶ', async () => {
    const calls: string[] = [];
    const app = {
      plugins: {
        disablePlugin: vi.fn(async () => { calls.push('disable'); }),
        enablePlugin: vi.fn(async () => { calls.push('enable'); }),
      },
    } as unknown as import('obsidian').App;
    await reloadPlugin(app, 'ClaudianBridge');
    expect(calls).toEqual(['disable', 'enable']);
  });

  it('enablePlugin が例外を出せば伝播する', async () => {
    const app = {
      plugins: {
        disablePlugin: vi.fn(async () => {}),
        enablePlugin: vi.fn(async () => { throw new Error('boot failed'); }),
      },
    } as unknown as import('obsidian').App;
    await expect(reloadPlugin(app, 'ClaudianBridge')).rejects.toThrow('boot failed');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/self-update/reloader.test.ts`
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: Reloader を実装**

`src/features/self-update/reloader.ts`:

```ts
/**
 * プラグインを disable -> enable で再読込する（D8）。
 * SettingTabGeneral.ts の enablePlugin/disablePlugin パターンを踏襲。
 */
import type { App } from 'obsidian';

export async function reloadPlugin(app: App, pluginId: string): Promise<void> {
  const plugins = (app as unknown as {
    plugins?: {
      enablePlugin?: (id: string) => Promise<void>;
      disablePlugin?: (id: string) => Promise<void>;
    };
  }).plugins;
  await plugins?.disablePlugin?.(pluginId);
  await plugins?.enablePlugin?.(pluginId);
}
```

`src/features/self-update/index.ts` に追記:

```ts
export * from './reloader';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/self-update/reloader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/self-update tests/features/self-update
git commit -m "feat(v0.32.10): Reloader（disable -> enable 再読込）"
```

---

### Task 6: 設定タブ統合（「更新を確認」ボタン + i18n）

**Files:**
- Modify: `src/core/i18n.ts`（LocaleStrings 型 + ja/en 両ロケール）
- Modify: `src/settings/SettingTabGeneral.ts:20-24`（バージョン行右にボタン）
- Modify: `src/features/self-update/index.ts`（`runSelfUpdate` 統合関数を追加）
- Test: `tests/features/self-update/self-update-flow.test.ts`（統合フロー）

**Interfaces:**
- Consumes: Task 2-5 の全コンポーネント、`renderGeneralTab(_app, containerEl, store, resetMigration?, pluginId?)` の既存シグネチャ（`_app` をボタン用に使用）
- Produces: `runSelfUpdate(app: App, pluginId: string, localVersion: string, notice: (msg: string) => void): Promise<void>`（チェック→バックアップ→DL→リロードの全体フロー・UI から呼ぶ唯一の入口）

- [ ] **Step 1: i18n 文字列を追加（D9）**

`src/core/i18n.ts` の `LocaleStrings` インターフェースに追加:

```ts
  updateCheckButton: string;
  updateChecking: string;
  updateUpToDate: string;
  updateSuccess: string;
  updateCheckFailed: string;
  updateBackupFailed: string;
  updateDownloadFailed: string;
  updateReloadFailed: string;
```

ja ロケール（`tabGeneral: '🎛️ 一般'` の近く）:

```ts
    updateCheckButton: '更新を確認',
    updateChecking: '🔄 更新を確認中...',
    updateUpToDate: '✅ 最新版です',
    updateSuccess: '✅ {version} に更新しました',
    updateCheckFailed: '❌ 更新確認に失敗: {msg}',
    updateBackupFailed: '❌ バックアップ作成失敗。中断します: {msg}',
    updateDownloadFailed: '❌ ダウンロード失敗。バックアップから手動復元できます: {msg}',
    updateReloadFailed: '❌ 再起動失敗。手動で復元してください: {msg}',
```

en ロケール:

```ts
    updateCheckButton: 'Check for Updates',
    updateChecking: '🔄 Checking for updates...',
    updateUpToDate: '✅ Up to date',
    updateSuccess: '✅ Updated to {version}',
    updateCheckFailed: '❌ Update check failed: {msg}',
    updateBackupFailed: '❌ Backup failed. Aborting: {msg}',
    updateDownloadFailed: '❌ Download failed. Restore manually from backup: {msg}',
    updateReloadFailed: '❌ Reload failed. Restore manually: {msg}',
```

- [ ] **Step 2: runSelfUpdate を実装（index.ts に追記）**

```ts
/**
 * 更新フロー全体: チェック -> バックアップ -> DL -> リロード（D6-D8）。
 * UI からはこの関数だけを呼ぶ。
 */
import { Notice } from 'obsidian';
import type { App, DataAdapter } from 'obsidian';
import { checkForUpdate } from './update-checker';
import { backupPluginFiles } from './backup-manager';
import { downloadAssets } from './update-downloader';
import { reloadPlugin } from './reloader';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';

export async function runSelfUpdate(
  app: App,
  pluginId: string,
  localVersion: string,
  pluginDir: string,
  adapter: DataAdapter,
  notice: (msg: string) => void = (m) => new Notice(m),
): Promise<void> {
  const s = getLocaleStrings(getUILanguage());
  const fail = (template: string, e: unknown): void => {
    notice(template.replace('{msg}', (e as Error).message));
  };
  try {
    notice(s.updateChecking);
    const result = await checkForUpdate(localVersion);
    if (!result.updateAvailable) {
      notice(s.updateUpToDate);
      return;
    }
    let backupPath: string;
    try {
      backupPath = await backupPluginFiles(pluginDir, adapter);
    } catch (e) {
      return fail(s.updateBackupFailed, e);
    }
    try {
      await downloadAssets(result.assets, pluginDir, adapter);
    } catch (e) {
      return fail(s.updateDownloadFailed.replace('{msg}', `${backupPath} から復元可 — ${(e as Error).message}`), e);
    }
    try {
      await reloadPlugin(app, pluginId);
      notice(s.updateSuccess.replace('{version}', result.tagName));
    } catch (e) {
      return fail(s.updateReloadFailed, e);
    }
  } catch (e) {
    return fail(s.updateCheckFailed, e);
  }
}
```

- [ ] **Step 3: 統合フローのテストを書く**

`tests/features/self-update/self-update-flow.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSelfUpdate } from '../../../src/features/self-update';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// quota/http は obsidian requestUrl 解決に失敗すると fetch へ落ちるため、fetch で API も DL も制御する
function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function makeApp() {
  return {
    plugins: {
      disablePlugin: vi.fn(async () => {}),
      enablePlugin: vi.fn(async () => {}),
    },
  } as unknown as import('obsidian').App;
}

function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  const enc = (t: string) => new TextEncoder().encode(t).buffer as ArrayBuffer;
  files.set('plugin/main.js', enc('OLD'));
  files.set('plugin/manifest.json', enc('{}'));
  files.set('plugin/styles.css', enc(''));
  return {
    files,
    async exists(p: string) { return files.has(p); },
    async mkdir(_p: string) {},
    async readBinary(p: string) {
      const b = files.get(p);
      if (!b) throw new Error(`not found: ${p}`);
      return b;
    },
    async writeBinary(p: string, d: ArrayBuffer) { files.set(p, d); },
  };
}

const RELEASE = {
  tag_name: 'v9.0.0',
  assets: ['main.js', 'manifest.json', 'styles.css'].map((name) => ({
    name,
    browser_download_url: `https://example.com/${name}`,
  })),
};

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('api.github.com')) return jsonResponse(RELEASE);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('NEW').buffer as ArrayBuffer };
  });
});
afterEach(() => fetchMock.mockReset());

describe('runSelfUpdate', () => {
  it('更新あり: バックアップ -> DL -> リロードまで実行される', async () => {
    const ad = makeAdapter();
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '0.32.9', 'plugin', ad, (m) => messages.push(m));
    expect(ad.files.get('plugin/main.js')).toBeTruthy();
    expect(new TextDecoder().decode(ad.files.get('plugin/main.js')!)).toBe('NEW');
    expect(messages.some((m) => m.includes('v9.0.0'))).toBe(true);
  });

  it('最新版なら何もしない', async () => {
    const ad = makeAdapter();
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '9.0.0', 'plugin', ad, (m) => messages.push(m));
    expect(messages).toContain('✅ 最新版です');
    expect(fetchMock).toHaveBeenCalledTimes(1); // DL が走らない
  });

  it('チェック失敗時はエラー Notice で中断する', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const messages: string[] = [];
    await runSelfUpdate(makeApp(), 'ClaudianBridge', '0.32.9', 'plugin', makeAdapter(), (m) => messages.push(m));
    expect(messages.some((m) => m.startsWith('❌'))).toBe(true);
  });
});
```

- [ ] **Step 4: テストが失敗→通ることを確認**

Run: `npx vitest run tests/features/self-update/self-update-flow.test.ts`
Expected: まず `runSelfUpdate` 未実装なら FAIL → Step 2 実装後に PASS

- [ ] **Step 5: SettingTabGeneral にボタンを追加**

`src/settings/SettingTabGeneral.ts` のバージョン行ブロック（21-23 行目）を以下に置換:

```ts
    // バージョン情報 + 更新確認ボタン（v0.32.10 自己更新機能）
    const versionRow = containerEl.createDiv('cb-version-row');
    versionRow.createEl('span', { text: 'Claudian Bridge', cls: 'cb-version-row__name' });
    versionRow.createEl('span', { text: `v${PLUGIN_VERSION}`, cls: 'cb-version-row__version' });
    const updateBtn = versionRow.createEl('button', { text: s.updateCheckButton, cls: 'cb-version-row__update-btn' });
    updateBtn.addEventListener('click', () => {
      void (async () => {
        updateBtn.disabled = true;
        try {
          if (_app && pluginId) {
            const adapter = (_app as unknown as { vault: { adapter: DataAdapterLike } }).vault.adapter;
            const pluginDir = `${(adapter as unknown as { basePath: string }).basePath}/.obsidian/plugins/${pluginId}`;
            await runSelfUpdate(_app, pluginId, PLUGIN_VERSION, pluginDir, adapter as unknown as Parameters<typeof runSelfUpdate>[4]);
          }
        } finally {
          updateBtn.disabled = false;
        }
      })();
    });
```

先頭に import を追加:

```ts
import { runSelfUpdate } from '../features/self-update';
```

補足: `renderGeneralTab` の第 1 引数は現在 `_app`（未使用）だが、本タスクで使用するため `_app` のまま使用可（アンダースコア接頭辞付きでも参照は可能。lint 設定で引数名変更が必要なら `app` に改名し呼び出し側 `src/settings/*.ts` の引数は位置引数なので影響なし）。

- [ ] **Step 6: 全テスト + typecheck 実行**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit`
Expected: 全 PASS（830+ に増加）・typecheck エラー 0

- [ ] **Step 7: Commit**

```bash
git add src/core/i18n.ts src/settings/SettingTabGeneral.ts src/features/self-update tests/features/self-update
git commit -m "feat(v0.32.10): 設定タブに「更新を確認」ボタン追加 + i18n"
```

---

### Task 7: バージョン更新・ビルド・デプロイ・ドキュメント

**Files:**
- Modify: `src/manifest.json`（version を 0.32.10 へ）
- Modify: `package.json`（version を 0.32.10 へ）
- Modify: `CHANGELOG.md`（v0.32.10 エントリ・F-029）
- Modify: `versions.json`

**Interfaces:**
- Consumes: Task 1-6 の全成果物
- Produces: v0.32.10 ビルド済み `Plugin/` 3 ファイル（Task 8 の Release アップロード対象）

- [ ] **Step 1: バージョンを 0.32.10 に更新**

```bash
cd /d/AI-Agent/ClaudianBridge
node -e "const fs=require('fs');const p='src/manifest.json';const j=JSON.parse(fs.readFileSync(p));j.version='0.32.10';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('package.json'));j.version='0.32.10';fs.writeFileSync('package.json',JSON.stringify(j,null,2)+'\n');"
```

`versions.json` に `{"0.32.10": "0.32.9"}` 相当のエントリ（最新キーとその直前バージョン、既存フォーマットに従う）を追加。

- [ ] **Step 2: CHANGELOG.md に v0.32.10 エントリを追加**

既存エントリの形式に従い、先頭に追加:

```markdown
## [0.32.10] - 2026-09-04

### Added
- **F-029 自己更新機能**: 設定画面の「更新を確認」ボタンで GitHub Releases の最新版を DL し、バックアップ → 上書き → disable/enable 自動リロード
- `Plugin/` ディレクトリ新設（main.js / manifest.json / styles.css の Git tracked 配布源）
```

- [ ] **Step 3: ビルド + 全テスト + デプロイ**

Run: `npm test 2>&1 | tail -3 && npm run build`
Expected: テスト全 PASS・`Plugin/main.js` 再生成・Vault へデプロイ完了（Markers verified）

- [ ] **Step 4: Commit**

```bash
git add src/manifest.json package.json versions.json CHANGELOG.md Plugin/
git commit -m "release(v0.32.10): 自己更新機能リリース（F-029）"
```

---

### Task 8: GitHub Release アップロード + 実機 UAT（手動）

**Files:**
- Create: なし（Release 公開・実機確認）

**Interfaces:**
- Consumes: Task 7 の `Plugin/` 3 ファイル
- Produces: GitHub Release `v0.32.10`（公開・3 アセット）

- [ ] **Step 1: Release を作成**

```bash
cd /d/AI-Agent/ClaudianBridge
git push origin hotfix/v0.32.1
gh release create v0.32.10 Plugin/main.js Plugin/manifest.json Plugin/styles.css --generate-notes
```

- [ ] **Step 2: 実機 UAT**

1. Vault の `.obsidian/plugins/ClaudianBridge/manifest.json` の version を一時的に `0.32.9` に書き換え、Obsidian でプラグインをリロード（古いバージョンを装う）
2. 設定 → Claudian Bridge → 「更新を確認」クリック
3. Expected: 「🔄 更新を確認中...」→「✅ v0.32.10 に更新しました」が表示され、プラグインが再読込される
4. `.obsidian/plugins/ClaudianBridge/.backup/<UTC>/` に 3 ファイルのバックアップがあることを確認
5. 再度クリック → 「✅ 最新版です」を確認
6. manifest.json の version を `0.32.10` に戻す（UAT 用改変の解消）

- [ ] **Step 3: Vault 文書反映（リリースノート等）**

`80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` に v0.32.10 エントリを追加。

- [ ] **Step 4: 完了報告**

タスク終了報告テンプレートに従い報告する。
