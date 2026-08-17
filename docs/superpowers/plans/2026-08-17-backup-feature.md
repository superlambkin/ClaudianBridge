# バックアップ機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian Bridge v0.21.0 で、ファイルツリーのフォルダ/ファイルを右クリック→「💾 バックアップ」→保存先選択→タイムスタンプ付きで再帰コピーを実装する。

**Architecture:** 既存の `OfficeMenuRegistrar` パターン（`workspace.on('file-menu')`）を踏襲し、新機能 `BackupMenuRegistrar` を `src/features/backup/` に新設。OS ネイティブダイアログは Obsidian 公式 API `app.openFolderDialog()` を使用、進捗表示は既存 `ProgressModal` を再利用、コピー処理は Node.js 標準 `fs.promises.cp(src, dest, {recursive: true})` で実装。設定マスタースイッチは `ClaudianBridgeSettings.general.backupEnabled`（既定 `true`）。

**Tech Stack:** TypeScript (ES2022), Obsidian Plugin API, Vitest, esbuild, Node.js fs/promises

## Global Constraints

- TypeScript strict mode（既存プロジェクト設定 `tsconfig.json` 準拠）
- 既存パターン遵守: `OfficeMenuRegistrar.registerFileMenu`（`src/features/office/menu.ts:87`）に做う
- i18n: ja/zh/en 3 言語すべてに追加必須（欠落禁止）
- 後方互換性: 既存ユーザーの `data.json` を破壊しない（`backupEnabled` 未設定時は `true` フォールバック）
- バージョン: `src/manifest.json` を `0.20.0` → `0.21.0` に更新
- コミット粒度: タスクごとに 1 コミット
- 既存テスト: 226 件すべてパス状態を維持

---

## File Structure

### 新規ファイル

| ファイル | 責務 |
|---------|------|
| `src/features/backup/menu.ts` | `BackupMenuRegistrar` クラス。`workspace.on('file-menu')` で右クリックメニュー登録。`backupEnabled` フラグと TFile/TFolder 型ガード |
| `src/features/backup/backup-runner.ts` | `runBackup()` 関数。`app.openFolderDialog` → `ProgressModal` → `fs.promises.cp` の実行パイプライン |
| `tests/features/backup/menu.test.ts` | `BackupMenuRegistrar.register()` のテスト |
| `tests/features/backup/backup-runner.test.ts` | `buildTimestamp()` / `resolveDestName()` の単体テスト |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/settings.ts` | `general.backupEnabled: boolean` 追加（型 / default / normalize / validate） |
| `src/core/i18n.ts` | `LocaleStrings` に 2 フィールド追加（ja/zh/en 値） |
| `src/settings/SettingTabGeneral.ts` | トグル UI 追加（`codeCopyFence` 直後） |
| `src/main.ts` | `BackupMenuRegistrar.register()` 呼び出し追加 |
| `src/manifest.json` | version `0.21.0` |
| `tests/core/settings.test.ts` | 既存 `validateClaudianBridgeSettings` テストに `backupEnabled` ケース追加 |
| `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` | v0.21.0 エントリ追加 |

---

## Task 1: 設定モデル追加 (`general.backupEnabled`)

**Files:**
- Modify: `src/core/settings.ts` (interface, default, normalize, validate)
- Modify: `tests/core/settings.test.ts` (テストケース追加)

**Interfaces:**
- Consumes: なし
- Produces:
  - `ClaudianBridgeSettings.general.backupEnabled: boolean`（既定 `true`）

- [ ] **Step 1: テストを書く** — `tests/core/settings.test.ts` の既存 `validateClaudianBridgeSettings` describe ブロック内に以下を追加:

```typescript
it('validateClaudianBridgeSettings: general.backupEnabled が boolean であること', () => {
  const valid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupEnabled: true } };
  expect(validateClaudianBridgeSettings(valid)).toBeNull();

  const invalid = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general, backupEnabled: 'yes' as unknown as boolean } };
  expect(validateClaudianBridgeSettings(invalid)).toMatch(/general\.backupEnabled/);
});
```

加えて `normalizeClaudianBridgeSettings` describe 内に:

```typescript
it('normalizeClaudianBridgeSettings: general.backupEnabled デフォルト true', () => {
  const result = normalizeClaudianBridgeSettings({});
  expect(result.general.backupEnabled).toBe(true);
});

it('normalizeClaudianBridgeSettings: general.backupEnabled=false 明示設定', () => {
  const result = normalizeClaudianBridgeSettings({ general: { backupEnabled: false } });
  expect(result.general.backupEnabled).toBe(false);
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/core/settings.test.ts 2>&1 | tail -30
```

期待: `TypeError: cfg.general.backupEnabled` 関連で 3 件 FAIL

- [ ] **Step 3: `ClaudianBridgeSettings.general` interface を更新** — `src/core/settings.ts:436-445` の `general: { ... }` 内に追加:

```typescript
codeCopyFence: boolean;
// === v0.21.0: バックアップ機能 ===
backupEnabled: boolean;
```

- [ ] **Step 4: `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS` を更新** — `src/core/settings.ts:489` の `general` オブジェクト内に追加:

```typescript
codeCopyFence: true,
// v0.21.0: バックアップ機能（既定 ON）
backupEnabled: true,
```

- [ ] **Step 5: `normalizeClaudianBridgeSettings` を更新** — `src/core/settings.ts:552-566` の `general:` return オブジェクト内に追加:

```typescript
codeCopyFence: typeof r.general?.codeCopyFence === 'boolean' ? r.general.codeCopyFence : true,
// v0.21.0: バックアップ機能
backupEnabled: typeof r.general?.backupEnabled === 'boolean' ? r.general.backupEnabled : true,
```

- [ ] **Step 6: `validateClaudianBridgeSettings` を更新** — `src/core/settings.ts:746-748` の `general.enabled` 検証直後に追加:

```typescript
if (typeof cfg.general.backupEnabled !== 'boolean') return 'general.backupEnabled は boolean である必要があります';
```

- [ ] **Step 7: テスト合格確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/core/settings.test.ts 2>&1 | tail -20
```

期待: 既存 + 新規 3 件すべて PASS

- [ ] **Step 8: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/core/settings.ts tests/core/settings.test.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(settings): add general.backupEnabled (v0.21.0)

ClaudianBridgeSettings.general に backupEnabled: boolean を追加。
既定 true、後方互換性あり（未設定ユーザーは自動的に ON）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: i18n 文字列追加

**Files:**
- Modify: `src/core/i18n.ts` (LocaleStrings interface + ja/zh/en 値)

**Interfaces:**
- Consumes: なし
- Produces:
  - `LocaleStrings.generalBackupEnabled: string`
  - `LocaleStrings.generalBackupEnabledDesc: string`

- [ ] **Step 1: `LocaleStrings` interface を更新** — `src/core/i18n.ts` の `generalCodeCopyFenceDesc` 直後（line 19 付近）に追加:

```typescript
generalCodeCopyFence: string;
generalCodeCopyFenceDesc: string;
// === v0.21.0: バックアップ機能 ===
generalBackupEnabled: string;
generalBackupEnabledDesc: string;
```

- [ ] **Step 2: ja の値を追加** — `STRINGS.ja.generalCodeCopyFenceDesc` の値直後に追加:

```typescript
generalCodeCopyFence: '🔧 コードコピー時にフェンス付与',
generalCodeCopyFenceDesc: 'Claudian チャットのコードブロックをコピーするとき、\`\`\` のコードフェンスを自動で付与します（Mermaid 等の貼り付け崩れを防止）',
// v0.21.0
generalBackupEnabled: '💾 右クリックバックアップ',
generalBackupEnabledDesc: 'ファイル/フォルダ右クリックメニューに「バックアップ」を追加（OFF で非表示）',
```

- [ ] **Step 3: en の値を追加** — `STRINGS.en` の `generalCodeCopyFenceDesc` 直後に追加:

```typescript
generalCodeCopyFence: '🔧 Add fences when copying code',
generalCodeCopyFenceDesc: 'When copying a code block from Claudian chat, automatically wrap it in \`\`\` fences (prevents broken pastes such as Mermaid diagrams).',
// v0.21.0
generalBackupEnabled: '💾 Right-click backup',
generalBackupEnabledDesc: 'Add "Backup" to file/folder right-click menu (hide when OFF)',
```

- [ ] **Step 4: zh の値を追加** — `STRINGS.zh` の `generalCodeCopyFenceDesc` 直後に追加:

```typescript
generalCodeCopyFence: '🔧 复制代码时添加围栏',
generalCodeCopyFenceDesc: '从 Claudian 聊天复制代码块时，自动补全 \`\`\` 代码围栏（防止 Mermaid 等粘贴后无法渲染）',
// v0.21.0
generalBackupEnabled: '💾 右键备份',
generalBackupEnabledDesc: '在文件/文件夹右键菜单中添加"备份"（关闭时不显示）',
```

- [ ] **Step 5: TypeScript 型チェック**

```bash
cd D:/AI-Agent/claudian-bridge && npx tsc --noEmit 2>&1 | tail -20
```

期待: エラーなし（3 言語分のキー不足は型レベルで検出される）

- [ ] **Step 6: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/core/i18n.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(i18n): add generalBackupEnabled strings (ja/en/zh, v0.21.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: バックアップランナー実装（TDD）

**Files:**
- Create: `src/features/backup/backup-runner.ts`
- Create: `tests/features/backup/backup-runner.test.ts`

**Interfaces:**
- Consumes: `App` (Obsidian), `TFile | TFolder` (target)
- Produces:
  - `export function buildTimestamp(): string` → `"YYYYMMDD_HHMMSS"`
  - `export function resolveDestName(srcPath: string, isDir: boolean): string` → `"<name>_<TS>"` or `"<name>_<TS>.<ext>"`
  - `export async function runBackup(app: App, target: TFile | TFolder, pluginDir?: string): Promise<void>`

- [ ] **Step 1: テストを書く** — `tests/features/backup/backup-runner.test.ts` を新規作成:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile, TFolder, Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('obsidian')>('obsidian');
  return {
    ...actual,
    Notice: vi.fn(),
  };
});

import { buildTimestamp, resolveDestName, runBackup } from '../../../src/features/backup/backup-runner';

describe('backup-runner', () => {
  describe('buildTimestamp', () => {
    it('YYYYMMDD_HHMMSS 形式で 14 文字', () => {
      const ts = buildTimestamp();
      expect(ts).toMatch(/^\d{8}_\d{6}$/);
      expect(ts.length).toBe(15);
    });

    it('現在時刻を反映している', () => {
      const before = new Date();
      const ts = buildTimestamp();
      const after = new Date();
      // YYYYMMDD_HHMMSS → Date 復元（タイムゾーンずれは無視して年月日のみ確認）
      const yyyy = parseInt(ts.slice(0, 4), 10);
      const mm = parseInt(ts.slice(4, 6), 10);
      const dd = parseInt(ts.slice(6, 8), 10);
      expect(yyyy).toBe(before.getFullYear());
      expect(mm).toBe(before.getMonth() + 1);
      expect(dd).toBeGreaterThanOrEqual(before.getDate() - 1);
      expect(dd).toBeLessThanOrEqual(after.getDate() + 1);
    });
  });

  describe('resolveDestName', () => {
    it('ファイル: note.md → note_<TS>.md', () => {
      const name = resolveDestName('note.md', false);
      expect(name).toMatch(/^note_\d{8}_\d{6}\.md$/);
    });

    it('ファイル: 拡張子なし → 拡張子なし', () => {
      const name = resolveDestName('README', false);
      expect(name).toMatch(/^README_\d{8}_\d{6}$/);
    });

    it('フォルダ: notes → notes_<TS>', () => {
      const name = resolveDestName('notes', true);
      expect(name).toMatch(/^notes_\d{8}_\d{6}$/);
    });

    it('フォルダ: サブディレクトリ含む path → basename 使用', () => {
      const name = resolveDestName('subdir/notes', true);
      expect(name).toMatch(/^notes_\d{8}_\d{6}$/);
    });

    it('ファイル: サブディレクトリ含む path → basename+拡張子', () => {
      const name = resolveDestName('sub/dir/note.md', false);
      expect(name).toMatch(/^note_\d{8}_\d{6}\.md$/);
    });
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/features/backup/backup-runner.test.ts 2>&1 | tail -20
```

期待: `Failed to resolve import "../../../src/features/backup/backup-runner"` で FAIL

- [ ] **Step 3: バックアップランナーを実装** — `src/features/backup/backup-runner.ts` を新規作成:

```typescript
import { App, TFile, TFolder, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressModal } from '../office/progress-modal';

type BackupTarget = TFile | TFolder;

/**
 * 現在時刻を "YYYYMMDD_HHMMSS" 形式で返す。
 * ファイル名安全（Windows / macOS / Linux 全対応）。
 */
export function buildTimestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * バックアップ名を解決: "<元basename>_<TS>" or "<元basename>_<TS>.<ext>"
 * srcPath: Vault 相対パス
 * isDir: フォルダかどうか
 */
export function resolveDestName(srcPath: string, isDir: boolean): string {
  const base = path.basename(srcPath);
  const ext = path.extname(base);
  const stem = isDir || ext === '' ? base : base.slice(0, -ext.length);
  const ts = buildTimestamp();
  return `${stem}_${ts}${isDir ? '' : ext}`;
}

/**
 * バックアップ実行: ダイアログ → ProgressModal → fs.promises.cp
 */
export async function runBackup(
  app: App,
  target: BackupTarget,
  pluginDir?: string,
): Promise<void> {
  // 1. 保存先ダイアログ（Obsidian 公式 API）
  const openFolderDialog = (app as unknown as {
    openFolderDialog?: (title: string) => Promise<string | null>;
  }).openFolderDialog;
  const destRoot = openFolderDialog
    ? await openFolderDialog.call(app, 'バックアップ保存先を選択')
    : null;
  if (!destRoot) return; // ユーザーキャンセル

  // 2. パス解決
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  const vaultRoot = adapter.getBasePath?.() ?? process.cwd();
  const srcPath = path.join(vaultRoot, target.path);
  const isDir = target instanceof TFolder;
  const destName = resolveDestName(target.path, isDir);
  const destPath = path.join(destRoot, destName);

  // 3. ProgressModal 起動
  const modal = new ProgressModal(app, {
    title: `💾 バックアップ: ${destName}`,
    showSplit: false,
    showRetry: false,
  });
  modal.open();

  // 4. コピー実行（recursive: true でディレクトリを再帰、force は fs.cp デフォルト true で上書き）
  try {
    await fs.promises.cp(srcPath, destPath, { recursive: true });
    modal.appendLog(`✅ 完了: ${destPath}`);
    new Notice(`✅ バックアップ完了: ${destName}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: false, settings: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    modal.appendLog(`[ERROR] ${msg}`);
    new Notice(`⚠️ バックアップ失敗: ${msg}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: false, settings: false });
  }
}
```

- [ ] **Step 4: テスト合格確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/features/backup/backup-runner.test.ts 2>&1 | tail -20
```

期待: 7 件すべて PASS

- [ ] **Step 5: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/features/backup/backup-runner.ts tests/features/backup/backup-runner.test.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(backup): add backup-runner with fs.promises.cp (v0.21.0)

buildTimestamp: YYYYMMDD_HHMMSS 形式のタイムスタンプ生成
resolveDestName: <name>_<TS>[.<ext>] の命名規則でバックアップ名を解決
runBackup: app.openFolderDialog → ProgressModal → fs.cromises.cp
          のパイプライン（既存 ProgressModal を再利用）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: メニュー登録実装（TDD）

**Files:**
- Create: `src/features/backup/menu.ts`
- Create: `tests/features/backup/menu.test.ts`

**Interfaces:**
- Consumes: `ClaudianBridgeSettings.general.backupEnabled`
- Produces:
  - `export class BackupMenuRegistrar { static register(plugin, app, settingsRef, pluginDir?): void }`

- [ ] **Step 1: テストを書く** — `tests/features/backup/menu.test.ts` を新規作成:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { BackupMenuRegistrar } from '../../../src/features/backup/menu';
import type { ClaudianBridgeSettings } from '../../../src/core/settings';

interface MenuItemMock { setTitle: ReturnType<typeof vi.fn>; setIcon: ReturnType<typeof vi.fn>; onClick: ReturnType<typeof vi.fn>; }
interface MenuMock { addItem: ReturnType<typeof vi.fn>; }

function makeItem(): MenuItemMock {
  const item: Partial<MenuItemMock> = {};
  item.setTitle = vi.fn(() => item as MenuItemMock);
  item.setIcon = vi.fn(() => item as MenuItemMock);
  item.onClick = vi.fn(() => item as MenuItemMock);
  return item as MenuItemMock;
}

function makeMenu(): MenuMock {
  return { addItem: vi.fn((cb: (item: MenuItemMock) => MenuItemMock) => cb(makeItem())) };
}

function makeApp() {
  const handlers: Array<(menu: MenuMock, file: unknown) => void> = [];
  return {
    app: {
      workspace: {
        on: (event: string, handler: (menu: MenuMock, file: unknown) => void) => {
          handlers.push(handler);
          return { event, handler };
        },
      },
    },
    handlers,
  };
}

function makePlugin() {
  return { registerEvent: vi.fn() };
}

function makeSettingsRef(enabled: boolean): () => ClaudianBridgeSettings {
  return () => ({ ...({} as ClaudianBridgeSettings), general: { ...({} as ClaudianBridgeSettings.general), backupEnabled: enabled } });
}

function makeFile(): TFile {
  return { path: 'note.md', basename: 'note', extension: 'md' } as unknown as TFile;
}

function makeFolder(): TFolder {
  return { path: 'folder', name: 'folder' } as unknown as TFolder;
}

describe('BackupMenuRegistrar', () => {
  it('register() が workspace.on("file-menu", ...) を呼ぶ', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);

    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    expect(handlers.length).toBe(1);
    expect(plugin.registerEvent).toHaveBeenCalledOnce();
  });

  it('backupEnabled=true かつ TFile → menu.addItem が呼ばれる', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFile());

    expect(menu.addItem).toHaveBeenCalledOnce();
  });

  it('backupEnabled=true かつ TFolder → menu.addItem が呼ばれる', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFolder());

    expect(menu.addItem).toHaveBeenCalledOnce();
  });

  it('backupEnabled=false → menu.addItem が呼ばれない', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(false);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFile());

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('引数が文字列（TFile/TFolder 以外）→ menu.addItem が呼ばれない', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, 'some/string/path.md');

    expect(menu.addItem).not.toHaveBeenCalled();
  });
});
```

注: `App` の import を `from 'obsidian'` に追加すること（テスト冒頭で）。

- [ ] **Step 2: テスト失敗確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/features/backup/menu.test.ts 2>&1 | tail -20
```

期待: `Failed to resolve import "../../../src/features/backup/menu"` で FAIL

- [ ] **Step 3: メニュー登録を実装** — `src/features/backup/menu.ts` を新規作成:

```typescript
import { App, Menu, MenuItem, TFile, TFolder } from 'obsidian';
import type { ClaudianBridgeSettings } from '../../core/settings';
import { runBackup } from './backup-runner';

type PluginHost = { registerEvent(e: unknown): void };
type BackupTarget = TFile | TFolder;

/**
 * ファイル/フォルダ右クリックメニューに「💾 バックアップ」を追加する。
 * 設定 `general.backupEnabled=false` のとき非表示。
 */
export class BackupMenuRegistrar {
  static register(
    plugin: PluginHost,
    app: App,
    settingsRef: () => ClaudianBridgeSettings,
    pluginDir?: string,
  ): void {
    const handler = (menu: Menu, file: unknown): void => {
      if (!settingsRef().general.backupEnabled) return;
      if (!(file instanceof TFile) && !(file instanceof TFolder)) return;

      const target = file as BackupTarget;
      menu.addItem((item: MenuItem) =>
        item.setTitle('💾 バックアップ').setIcon('save').onClick(() => {
          void runBackup(app, target, pluginDir);
        })
      );
    };

    plugin.registerEvent(
      (app.workspace as unknown as {
        on: (event: string, cb: (...a: unknown[]) => void) => unknown;
      }).on('file-menu', handler as unknown as (...a: unknown[]) => void)
    );
  }
}
```

- [ ] **Step 4: テスト合格確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run tests/features/backup/menu.test.ts 2>&1 | tail -30
```

期待: 5 件すべて PASS

- [ ] **Step 5: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/features/backup/menu.ts tests/features/backup/menu.test.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(backup): add BackupMenuRegistrar (v0.21.0)

workspace.on('file-menu') でファイル/フォルダ右クリックメニューに
「💾 バックアップ」を追加。general.backupEnabled=false で非表示。
TFile/TFolder 型ガードで意図しない対象を除外。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 設定画面 UI 追加

**Files:**
- Modify: `src/settings/SettingTabGeneral.ts` (トグル追加)

**Interfaces:**
- Consumes: `s.generalBackupEnabled`, `s.generalBackupEnabledDesc`（Task 2 で追加済み）
- Produces: SettingTabGeneral の UI にトグル追加

- [ ] **Step 1: トグル UI を追加** — `src/settings/SettingTabGeneral.ts` の `codeCopyFence` トグル設定（line 47-60）の直後に追加:

```typescript
// v0.21.0: バックアップ機能（既定 ON）
new Setting(containerEl)
  .setName(s.generalBackupEnabled)
  .setDesc(s.generalBackupEnabledDesc)
  .addToggle((t) => t.setValue(cfg.general.backupEnabled).onChange(async (v) => {
    try {
      const latest = store.load();
      store.save({ ...latest, general: { ...latest.general, backupEnabled: v } });
      new Notice(s.noticeSaved);
    } catch (e) {
      new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
      draw();
    }
  }));
```

- [ ] **Step 2: TypeScript 型チェック**

```bash
cd D:/AI-Agent/claudian-bridge && npx tsc --noEmit 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 3: 既存テスト全件パス確認**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run 2>&1 | tail -10
```

期待: 全テスト PASS（既存 + 新規）

- [ ] **Step 4: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/settings/SettingTabGeneral.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(settings): add backupEnabled toggle UI (v0.21.0)

一般タブに「💾 右クリックバックアップ」トグルを追加。
既定 ON、OFF にすると右クリックメニューからバックアップが消える。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: main.ts 統合

**Files:**
- Modify: `src/main.ts` (BackupMenuRegistrar import + register 呼び出し)

**Interfaces:**
- Consumes: `BackupMenuRegistrar` (Task 4), `pluginDir` (既存)
- Produces: プラグインロード時に BackupMenuRegistrar.register() が呼ばれる

- [ ] **Step 1: import を追加** — `src/main.ts:20`（OfficeMenuRegistrar の import 直後）に追加:

```typescript
import { OfficeMenuRegistrar } from './features/office/menu';
import { BackupMenuRegistrar } from './features/backup/menu';
```

- [ ] **Step 2: register 呼び出しを追加** — `src/main.ts:274-276`（OfficeMenuRegistrar.registerFileMenu の呼び出し直後、`diag('office menu registered')` の直前）に追加:

```typescript
OfficeMenuRegistrar.registerFileMenu(this, this.app, officeSettingsRef, openSettings, pluginDir);
OfficeMenuRegistrar.registerMultiSelect(this, this.app, officeSettingsRef, openSettings, pluginDir);
BackupMenuRegistrar.register(this, this.app, () => this.store.load(), pluginDir);
diag('backup menu registered');
```

- [ ] **Step 3: TypeScript 型チェック + ビルド**

```bash
cd D:/AI-Agent/claudian-bridge && npx tsc --noEmit 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 4: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/main.ts && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "feat(main): wire BackupMenuRegistrar (v0.21.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: バージョン・リリースノート更新

**Files:**
- Modify: `src/manifest.json` (version 0.20.0 → 0.21.0)
- Modify: `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` (v0.21.0 エントリ追加)

**Interfaces:**
- Consumes: なし
- Produces: マニフェストバージョン更新 + リリースノートエントリ

- [ ] **Step 1: manifest.json バージョン更新**

`src/manifest.json:4`:
```json
"version": "0.20.0",
```
を
```json
"version": "0.21.0",
```
に変更。

- [ ] **Step 2: リリースノート更新** — `POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md` の最新版セクション直前に v0.21.0 エントリを追加:

```markdown
## v0.21.0 (2026-08-17)

### 新機能

- 💾 **右クリックバックアップ機能**: ファイルツリーでフォルダまたはファイルを右クリック → 「💾 バックアップ」メニュー → 保存先ダイアログ → タイムスタンプ付きでバックアップ
- 設定画面「一般」タブで ON/OFF 切替可能（既定 ON）

### 互換性

- 既存ユーザーの `data.json` への破壊的変更なし（`backupEnabled` 未設定は自動的に `true`）
```

- [ ] **Step 3: コミット**

```bash
cd D:/AI-Agent/claudian-bridge && git add src/manifest.json "POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md" && git -c user.name="MiuMiu" -c user.email="noreply@anthropic.com" commit -m "chore: bump version to 0.21.0 + release notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: ビルド検証 + デプロイ

**Files:**
- Modify: なし（検証のみ）

**Interfaces:**
- Consumes: 全 Task の成果物
- Produces: ビルド成功 + Obsidian Vault への配置

- [ ] **Step 1: 全テスト実行**

```bash
cd D:/AI-Agent/claudian-bridge && npx vitest run 2>&1 | tail -15
```

期待: 全件 PASS（既存 226 件 + 新規 12 件 = 238 件）

- [ ] **Step 2: TypeScript 型チェック**

```bash
cd D:/AI-Agent/claudian-bridge && npx tsc --noEmit 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 3: ビルド + デプロイ**

```bash
cd D:/AI-Agent/claudian-bridge && npm run build 2>&1 | tail -30
```

期待: esbuild ビルド成功 + `obsidian-deploy.mjs` で `.obsidian/plugins/claudian-bridge/` に配置完了

- [ ] **Step 4: デプロイ成果物確認**

```bash
ls -la "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/claudian-bridge/" 2>&1 | head -10
cat "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/.obsidian/plugins/claudian-bridge/manifest.json" 2>&1 | head -10
```

期待: `manifest.json` のバージョンが `"0.21.0"`

- [ ] **Step 5: Obsidian で動作確認** （手動）

1. Obsidian を再起動（プラグインリロード）
2. 設定 → Claudian Bridge → 一般タブで「💾 右クリックバックアップ」トグルが見える
3. 左ファイルツリーで Markdown ファイルを右クリック → 「💾 バックアップ」メニューが出る
4. メニュー選択 → 保存先ダイアログ → フォルダ選択 → コピーが実行される
5. 左ファイルツリーでフォルダを右クリック → 同様に動作
6. 設定を OFF にして再起動 → メニューから消える

---

## Self-Review

**Spec coverage:**
| Spec Section | Task |
|--------------|------|
| D1 (`app.openFolderDialog`) | Task 3 (backup-runner.ts) |
| D2 (ProgressModal reuse) | Task 3 (backup-runner.ts: import + use) |
| D3 (workspace.on file-menu) | Task 4 (menu.ts) |
| D4 (naming convention) | Task 3 (resolveDestName) |
| D5 (overwrite) | Task 3 (fs.promises.cp default force:true) |
| D6 (no confirmation) | Task 3 (no confirm dialog) |
| D7 (all files) | Task 4 (no extension filter) |
| D8 (general.backupEnabled) | Task 1, 4, 5 |
| Migration (backward compat) | Task 1 (normalize fallback) |
| Test plan | Task 1, 3, 4 |
| Deploy | Task 8 |

✅ 全カバー

**Placeholder scan:** grep で確認（実施済み、TBD/TODO なし）

**Type consistency:**
- `general.backupEnabled` → Task 1 で導入、Task 4/5 で使用（一致）
- `runBackup` signature → Task 3 で定義、Task 4 で呼び出し（一致）
- `BackupMenuRegistrar.register` → Task 4 で定義、Task 6 で呼び出し（一致）
- `buildTimestamp` / `resolveDestName` → Task 3 で定義、Task 3 の test で使用（一致）

✅ 整合性 OK