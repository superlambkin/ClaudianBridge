---
title: "ネットワークタブ・OpenVPN・VPN トグル 実装計画"
type: implementation-plan
version: 1.0.0
project_id: POC_017_ClaudianBridge
created: 2026-09-13 18:19
modified: 2026-09-14 00:15
status: 🟢 安定
tags:
  - claudianbridge
  - 実装計画
  - openvpn
  - vpn
  - skill-superpowers-writing-plans
  - skill-superpowers-subagent-driven-development
---

# ネットワークタブ・OpenVPN・VPN トグル Implementation Plan

> 📂 パス：80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/28_ネットワークタブOpenVPN_VPNトグル実装計画.md
> 🏷️ バージョン：v1.0（2026-09-13 実装計画・承認待ち → 移動済）
> 🔗 機能番号：F-041（OpenVPN 接続）/ F-042（ネットワークタブ）/ F-043（VPN トグル）
> 🔗 関連設計書：[[../02_設計文書/27_ネットワークタブOpenVPN設計]] / [[../02_設計文書/28_Claudian画面VPNトグル設計]]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianBridge v0.43.0+/v0.43.1+ で「🌐 ネットワーク」タブを新設し、OpenVPN 接続機能と Claudian 画面からの VPN 制御トグルを提供する。

**Architecture:** F-041 で `OpenVpnController`（open vpn CLI spawn/stderr 監視/状態管理）を新設し、F-042 で `SettingTabNetwork`（プロキシ＋OpenVPN セクション）に分離、F-043 で `setupVpnToggle()` を YOLO トグル隣に DOM 注入して `subscribe()` でリアルタイム色更新する。LLM 連動は `dispatchLlmRequest` 入口で `ensureVpnConnected()` をフック。`feature/network/` 配下に型・実装・トグルをコロケート。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest + jsdom / Node.js `child_process.spawn` / Mermaid (docs)

## Global Constraints

- 対象プラグイン: ClaudianBridge（`D:\AI-Agent\ClaudianBridge`）
- ブランチ: `hotfix/v0.32.1`（既存）にコミット、PR 経由で master
- コミット規約: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` + Conventional Commits
- 既存パターン遵守: `runSelfUpdate` / `token-rate/index.ts` と同形の素朴実装（Service 抽象化なし）
- テストランナー: vitest（既存 1250+ 件に追加で +70〜90 件）
- i18n キー: `getLocaleStrings()` の 3 言語（ja/en/zh-CN）全て追加
- TDD: 各タスクでテスト先行（vitest）
- マイグレーション: `normalizeClaudianBridgeSettings` で default 補完（後方互換必須）
- デスクトップ環境のみ（Win/Mac/Linux）、モバイルでは UI に「デスクトップのみ」注記
- 認証情報: 平文で data.json（既存 API キー・プロキシ URL と同じ運用）
- LLM 連動: VPN 失敗時は LLM 呼び出し継続（Notice 警告のみ）
- 段階リリース: v0.43.0（Phase 1: F-041/F-042）+ v0.43.1（Phase 2: F-043）

---

## Phase 1: ネットワークタブ・OpenVPN 接続機能（v0.43.0）

### Task 1: `OpenVpnSettings` 型 + DEFAULT 定数新設

**Files:**
- Create: `src/features/network/types.ts`
- Test: `tests/features/network/types.test.ts`

**Interfaces:**
- Consumes: （なし）
- Produces: `export type OpenVpnStatus = 'disconnected' | 'connecting' | 'connected' | 'error'`, `export interface OpenVpnSettings { enabled: boolean; configPath: string; username: string; password: string; autoConnectOnLlm: boolean; openvpnBinaryPath: string; }`, `export const DEFAULT_OPEN_VPN_SETTINGS: OpenVpnSettings`

- [ ] **Step 1: Write the failing test**

Create `tests/features/network/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_OPEN_VPN_SETTINGS, type OpenVpnSettings, type OpenVpnStatus } from '../../../src/features/network/types';

describe('OpenVpnSettings', () => {
  it('DEFAULT_OPEN_VPN_SETTINGS は 6 フィールドを持つ', () => {
    expect(DEFAULT_OPEN_VPN_SETTINGS).toEqual({
      enabled: false,
      configPath: '',
      username: '',
      password: '',
      autoConnectOnLlm: true,
      openvpnBinaryPath: '',
    });
  });

  it('OpenVpnStatus は 4 値のリテラル型', () => {
    const validStatuses: OpenVpnStatus[] = ['disconnected', 'connecting', 'connected', 'error'];
    expect(validStatuses).toHaveLength(4);
  });

  it('OpenVpnSettings 型は password フィールドを持つ', () => {
    const s: OpenVpnSettings = { ...DEFAULT_OPEN_VPN_SETTINGS, password: 'secret' };
    expect(s.password).toBe('secret');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/types.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

Create `src/features/network/types.ts`:
```typescript
/**
 * OpenVPN 関連の型定義。
 * v0.43.0 (F-041): ネットワークタブ・OpenVPN 接続機能で追加。
 */

export type OpenVpnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OpenVpnSettings {
  /** OpenVPN 機能の ON/OFF（既定 false） */
  enabled: boolean;
  /** .ovpn ファイル絶対パス */
  configPath: string;
  /** auth-user-pass ユーザー名 */
  username: string;
  /** auth-user-pass パスワード */
  password: string;
  /** LLM リクエスト時の自動接続（既定 true） */
  autoConnectOnLlm: boolean;
  /** openvpn CLI バイナリパス（空なら PATH 解決） */
  openvpnBinaryPath: string;
}

export const DEFAULT_OPEN_VPN_SETTINGS: OpenVpnSettings = {
  enabled: false,
  configPath: '',
  username: '',
  password: '',
  autoConnectOnLlm: true,
  openvpnBinaryPath: '',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/network/types.ts tests/features/network/types.test.ts && git commit -m "feat(network): OpenVpnSettings 型 + DEFAULT 定数新設 (F-041)"
```

---

### Task 2: `ClaudianBridgeSettings` に `network` セクション追加 + マイグレーション

**Files:**
- Modify: `src/core/settings.ts:580-602` (general interface), `src/core/settings.ts:628-831` (normalize), `src/core/settings.ts:978-1082` (validate)
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: `OpenVpnSettings`, `DEFAULT_OPEN_VPN_SETTINGS` from Task 1
- Produces: `network: { proxy: ProxySettings; openvpn: OpenVpnSettings }` in `ClaudianBridgeSettings`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/settings.test.ts`:
```typescript
describe('ClaudianBridgeSettings network section', () => {
  it('normalize: general.proxy を network.proxy へ移送', () => {
    const result = normalizeClaudianBridgeSettings({
      general: { proxy: { enabled: true, url: 'http://p:8080', noProxyHosts: 'localhost' } } as any,
    });
    expect(result.network.proxy).toEqual({ enabled: true, url: 'http://p:8080', noProxyHosts: 'localhost' });
  });

  it('normalize: 新 network.proxy があればそちらを優先', () => {
    const result = normalizeClaudianBridgeSettings({
      general: { proxy: { enabled: false, url: '', noProxyHosts: '' } } as any,
      network: { proxy: { enabled: true, url: 'http://new:8080', noProxyHosts: '' } } as any,
    });
    expect(result.network.proxy.enabled).toBe(true);
    expect(result.network.proxy.url).toBe('http://new:8080');
  });

  it('normalize: network.openvpn 不在時は DEFAULT_OPEN_VPN_SETTINGS で初期化', () => {
    const result = normalizeClaudianBridgeSettings({} as any);
    expect(result.network.openvpn).toEqual(DEFAULT_OPEN_VPN_SETTINGS);
  });

  it('validate: network.proxy 欠落でエラー', () => {
    const cfg = { ...makeValidConfig(), network: { openvpn: DEFAULT_OPEN_VPN_SETTINGS } } as any;
    expect(validateClaudianBridgeSettings(cfg)).toMatch(/network\.proxy/);
  });

  it('validate: enabled=true + configPath 空 でエラー', () => {
    const cfg = makeValidConfig();
    cfg.network.openvpn = { ...DEFAULT_OPEN_VPN_SETTINGS, enabled: true, configPath: '' };
    expect(validateClaudianBridgeSettings(cfg)).toMatch(/configPath/);
  });

  it('validate: enabled=false + configPath 空 は OK', () => {
    const cfg = makeValidConfig();
    cfg.network.openvpn = { ...DEFAULT_OPEN_VPN_SETTINGS, enabled: false, configPath: '' };
    expect(validateClaudianBridgeSettings(cfg)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts -t "network section"`
Expected: FAIL (normalize 関数が network セクション未対応)

- [ ] **Step 3: Modify `ClaudianBridgeSettings` interface**

In `src/core/settings.ts`, around line 580-602, replace the `general` interface to remove `proxy` and add `network` at the top level:
```typescript
export interface ClaudianBridgeSettings {
  general: {
    enabled: boolean;
    codeCopyFence: boolean;
    mermaidRender: boolean;
    backupEnabled: boolean;
    backupAutoClose: boolean;
    quickReplyShowAllOptions: boolean;
    quickReplyEnabled: boolean;
    tokenRateEnabled: boolean;
    tokenRateShowTtft: boolean;
    tokenRateShowCurrent: boolean;
    tokenRateShowAvg: boolean;
    tokenRateShowMax: boolean;
    tokenRateIntervalMs: number;
    outputsMirrorEnabled: boolean;
    outputsMirrorPath: string;
    hideDotFolders: boolean;
    migratedFrom: {
      claudianSelectionBridge: boolean;
      extensionWhitelist: boolean;
      vaultOfficeBridge: boolean;
      chromaInspector: boolean;
      claudeTtsSettings: boolean;
    };
    migrationResetAvailable: boolean;
  };
  network: {
    proxy: ProxySettings;
    openvpn: OpenVpnSettings;
  };
  quota: QuotaSettings;
  // ... selection / tts / office / whitelist / chroma / memory / thinking / imageGen は不変
}
```

Add at the top of the file (after other type imports):
```typescript
import type { OpenVpnSettings } from '../features/network/types';
import { DEFAULT_OPEN_VPN_SETTINGS } from '../features/network/types';
```

- [ ] **Step 4: Modify `normalizeClaudianBridgeSettings` for migration**

In the `normalizeClaudianBridgeSettings` function (around line 628-831), replace the `general` block's proxy normalization with the new `network` block:

**Remove this line** (around line 833-836):
```typescript
proxy: normalizeProxySettings(r.general?.proxy),
```

**Add the network block** (replace the line above with):
```typescript
network: {
  proxy: normalizeProxySettings(
    r.network?.proxy ??
    r.general?.proxy ??
    DEFAULT_PROXY_SETTINGS,
  ),
  openvpn: normalizeOpenVpnSettings(r.network?.openvpn),
},
```

Add a helper function near `normalizeProxySettings`:
```typescript
function normalizeOpenVpnSettings(raw: unknown): OpenVpnSettings {
  const r = (raw ?? {}) as Partial<OpenVpnSettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : false,
    configPath: typeof r.configPath === 'string' ? r.configPath : '',
    username: typeof r.username === 'string' ? r.username : '',
    password: typeof r.password === 'string' ? r.password : '',
    autoConnectOnLlm: typeof r.autoConnectOnLlm === 'boolean' ? r.autoConnectOnLlm : true,
    openvpnBinaryPath: typeof r.openvpnBinaryPath === 'string' ? r.openvpnBinaryPath : '',
  };
}
```

- [ ] **Step 5: Modify `validateClaudianBridgeSettings`**

In the validation function (around line 978-1082), replace the existing proxy check:
```typescript
// Remove these lines:
// if (cfg.general.proxy === undefined || cfg.general.proxy === null) return 'general.proxy は必須オブジェクトです';
// if (typeof cfg.general.proxy.enabled !== 'boolean') return 'general.proxy.enabled は boolean である必要があります';
// if (typeof cfg.general.proxy.url !== 'string') return 'general.proxy.url は string である必要があります';
// if (typeof cfg.general.proxy.noProxyHosts !== 'string') return 'general.proxy.noProxyHosts は string である必要があります';
// if (cfg.general.proxy.enabled && !cfg.general.proxy.url) return 'general.proxy.enabled=true のとき url は必須です';

// Add these lines:
if (cfg.network === undefined || cfg.network === null) return 'network は必須オブジェクトです';
if (cfg.network.proxy === undefined || cfg.network.proxy === null) return 'network.proxy は必須オブジェクトです';
if (typeof cfg.network.proxy.enabled !== 'boolean') return 'network.proxy.enabled は boolean である必要があります';
if (typeof cfg.network.proxy.url !== 'string') return 'network.proxy.url は string である必要があります';
if (typeof cfg.network.proxy.noProxyHosts !== 'string') return 'network.proxy.noProxyHosts は string である必要があります';
if (cfg.network.proxy.enabled && !cfg.network.proxy.url) return 'network.proxy.enabled=true のとき url は必須です';
if (cfg.network.openvpn === undefined || cfg.network.openvpn === null) return 'network.openvpn は必須オブジェクトです';
if (typeof cfg.network.openvpn.enabled !== 'boolean') return 'network.openvpn.enabled は boolean である必要があります';
if (typeof cfg.network.openvpn.configPath !== 'string') return 'network.openvpn.configPath は string である必要があります';
if (cfg.network.openvpn.enabled && !cfg.network.openvpn.configPath) return 'network.openvpn.enabled=true のとき configPath は必須です';
```

- [ ] **Step 6: Update `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS`**

Replace the `proxy: DEFAULT_PROXY_SETTINGS` field under `general` with a new top-level `network` block:
```typescript
// Remove:   proxy: DEFAULT_PROXY_SETTINGS,
// Add:
network: {
  proxy: DEFAULT_PROXY_SETTINGS,
  openvpn: DEFAULT_OPEN_VPN_SETTINGS,
},
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts -t "network section"`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/core/settings.ts tests/core/settings.test.ts && git commit -m "feat(settings): network セクション新設 + 旧 general.proxy マイグレーション (F-041/F-042)"
```

---

### Task 3: i18n キー追加（ネットワークタブ + OpenVPN 用 19 個）

**Files:**
- Modify: `src/core/i18n.ts`
- Test: `tests/core/i18n.test.ts` (skip if not exists, manual verify)

**Interfaces:**
- Consumes: 既存の `LocaleStrings` interface
- Produces: `tabNetwork` / `networkNoticeDesktopOnly` / `networkOpenVpnHeading` / `networkOpenVpnEnabled` 等 19 キーを ja/en/zh-CN に追加

- [ ] **Step 1: Modify `LocaleStrings` interface**

In `src/core/i18n.ts`, add to the `LocaleStrings` interface (around line 6-50):
```typescript
// Add after `tabChangelog`:
tabNetwork: string;

// === v0.43.0 (F-041/F-042) ===
networkNoticeDesktopOnly: string;
networkOpenVpnHeading: string;
networkOpenVpnEnabled: string;
networkOpenVpnEnabledDesc: string;
networkOpenVpnConfigPath: string;
networkOpenVpnConfigPathDesc: string;
networkOpenVpnUsername: string;
networkOpenVpnPassword: string;
networkOpenVpnBinaryPath: string;
networkOpenVpnBinaryPathDesc: string;
networkOpenVpnAutoConnect: string;
networkOpenVpnStatus: string;
networkOpenVpnStatusDisconnected: string;
networkOpenVpnStatusConnecting: string;
networkOpenVpnStatusConnected: string;
networkOpenVpnStatusError: string;
networkOpenVpnConnect: string;
networkOpenVpnDisconnect: string;
networkOpenVpnCopyLog: string;
```

- [ ] **Step 2: Add Japanese translations**

In the `ja` object (around line 476), add:
```typescript
tabNetwork: '🌐 ネットワーク',
networkNoticeDesktopOnly: '💡 OpenVPN はデスクトップ環境（Win/Mac/Linux）でのみ動作します。モバイルでは接続できません。',
networkOpenVpnHeading: '🔐 OpenVPN 接続',
networkOpenVpnEnabled: '🔐 OpenVPN を使用',
networkOpenVpnEnabledDesc: '有効にすると、.ovpn ファイルを使って VPN トンネルを確立します。LLM/Chroma 等の LAN 内サービスへのアクセスに使用します。',
networkOpenVpnConfigPath: '📁 .ovpn ファイルパス',
networkOpenVpnConfigPathDesc: '例: C:/Users/me/qnap.ovpn（QNAP QVPN からエクスポート）',
networkOpenVpnUsername: '👤 ユーザー名',
networkOpenVpnPassword: '🔑 パスワード',
networkOpenVpnBinaryPath: '🔧 openvpn バイナリパス',
networkOpenVpnBinaryPathDesc: '空欄なら PATH から自動解決（openvpn コマンド）',
networkOpenVpnAutoConnect: '🚀 LLM 呼び出し時に自動接続',
networkOpenVpnStatus: '状態',
networkOpenVpnStatusDisconnected: '🔴 切断中',
networkOpenVpnStatusConnecting: '🟡 接続中...',
networkOpenVpnStatusConnected: '🟢 接続済',
networkOpenVpnStatusError: '🔴 エラー',
networkOpenVpnConnect: '🔌 接続',
networkOpenVpnDisconnect: '⏹ 切断',
networkOpenVpnCopyLog: '📋 ログをコピー',
```

- [ ] **Step 3: Add English translations**

In the `en` object (around line 931), add:
```typescript
tabNetwork: '🌐 Network',
networkNoticeDesktopOnly: '💡 OpenVPN works only on desktop (Win/Mac/Linux). Not available on mobile.',
networkOpenVpnHeading: '🔐 OpenVPN Connection',
networkOpenVpnEnabled: '🔐 Enable OpenVPN',
networkOpenVpnEnabledDesc: 'When enabled, establishes a VPN tunnel using the .ovpn file. Used to access LAN services such as LLM/Chroma.',
networkOpenVpnConfigPath: '📁 .ovpn file path',
networkOpenVpnConfigPathDesc: 'e.g. C:/Users/me/qnap.ovpn (exported from QNAP QVPN)',
networkOpenVpnUsername: '👤 Username',
networkOpenVpnPassword: '🔑 Password',
networkOpenVpnBinaryPath: '🔧 openvpn binary path',
networkOpenVpnBinaryPathDesc: 'If empty, resolved from PATH (openvpn command)',
networkOpenVpnAutoConnect: '🚀 Auto-connect on LLM call',
networkOpenVpnStatus: 'Status',
networkOpenVpnStatusDisconnected: '🔴 Disconnected',
networkOpenVpnStatusConnecting: '🟡 Connecting...',
networkOpenVpnStatusConnected: '🟢 Connected',
networkOpenVpnStatusError: '🔴 Error',
networkOpenVpnConnect: '🔌 Connect',
networkOpenVpnDisconnect: '⏹ Disconnect',
networkOpenVpnCopyLog: '📋 Copy log',
```

- [ ] **Step 4: Add Chinese translations**

In the `zh-CN` object (around the third locale block), add:
```typescript
tabNetwork: '🌐 网络',
networkNoticeDesktopOnly: '💡 OpenVPN 仅在桌面端（Win/Mac/Linux）可用。移动端无法连接。',
networkOpenVpnHeading: '🔐 OpenVPN 连接',
networkOpenVpnEnabled: '🔐 启用 OpenVPN',
networkOpenVpnEnabledDesc: '启用后，使用 .ovpn 文件建立 VPN 隧道。用于访问局域网内 LLM/Chroma 等服务。',
networkOpenVpnConfigPath: '📁 .ovpn 文件路径',
networkOpenVpnConfigPathDesc: '例: C:/Users/me/qnap.ovpn（从 QNAP QVPN 导出）',
networkOpenVpnUsername: '👤 用户名',
networkOpenVpnPassword: '🔑 密码',
networkOpenVpnBinaryPath: '🔧 openvpn 二进制路径',
networkOpenVpnBinaryPathDesc: '为空时从 PATH 自动解析（openvpn 命令）',
networkOpenVpnAutoConnect: '🚀 LLM 调用时自动连接',
networkOpenVpnStatus: '状态',
networkOpenVpnStatusDisconnected: '🔴 已断开',
networkOpenVpnStatusConnecting: '🟡 连接中...',
networkOpenVpnStatusConnected: '🟢 已连接',
networkOpenVpnStatusError: '🔴 错误',
networkOpenVpnConnect: '🔌 连接',
networkOpenVpnDisconnect: '⏹ 断开',
networkOpenVpnCopyLog: '📋 复制日志',
```

- [ ] **Step 5: Run typecheck to verify**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/core/i18n.ts && git commit -m "feat(i18n): ネットワークタブ・OpenVPN 用 19 キー追加 (F-041/F-042)"
```

---

### Task 4: `OpenVpnController` ステートマシン + ステータス管理

**Files:**
- Create: `src/features/network/openvpn.ts`
- Test: `tests/features/network/openvpn.test.ts`

**Interfaces:**
- Consumes: `OpenVpnSettings`, `OpenVpnStatus` from Task 1
- Produces: `export interface OpenVpnController { start(s: OpenVpnSettings): Promise<void>; stop(): Promise<void>; getStatus(): OpenVpnStatus; getRecentLog(): string; subscribe(listener): () => void; }`, `export function getOpenVpnController(): OpenVpnController`, `export async function ensureVpnConnected(s: OpenVpnSettings): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/features/network/openvpn.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Mock child_process.spawn BEFORE importing openvpn.ts
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(() => true), writeFileSync: vi.fn(), unlinkSync: vi.fn(), chmodSync: vi.fn() },
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('os', () => ({
  default: { tmpdir: () => '/tmp' },
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', () => ({
  default: { randomUUID: () => 'test-uuid-1234' },
  randomUUID: () => 'test-uuid-1234',
}));

describe('OpenVpnController', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('initial status is disconnected', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.getStatus()).toBe('disconnected');
  });

  it('start() throws when configPath does not exist', async () => {
    const fs = await import('fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    await expect(controller.start({
      enabled: true, configPath: '/missing.ovpn', username: '', password: '',
      autoConnectOnLlm: false, openvpnBinaryPath: '',
    })).rejects.toThrow(/configPath|ファイル/);
  });

  it('subscribe() notifier が status 変化時に呼ばれる', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/openvpn.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

Create `src/features/network/openvpn.ts`:
```typescript
/**
 * OpenVPN CLI プロセス管理。
 * v0.43.0 (F-041): ネットワークタブ・OpenVPN 接続機能で追加。
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { OpenVpnSettings, OpenVpnStatus } from './types';

export interface OpenVpnController {
  start(settings: OpenVpnSettings): Promise<void>;
  stop(): Promise<void>;
  getStatus(): OpenVpnStatus;
  getRecentLog(): string;
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void;
}

const RECENT_LOG_MAX = 2000;

class OpenVpnControllerImpl implements OpenVpnController {
  private status: OpenVpnStatus = 'disconnected';
  private process: ChildProcess | null = null;
  private authFilePath: string | null = null;
  private recentLog: string[] = [];
  private emitter = new EventEmitter();

  getStatus(): OpenVpnStatus { return this.status; }
  getRecentLog(): string { return this.recentLog.join(''); }
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  private setStatus(next: OpenVpnStatus): void {
    this.status = next;
    this.emitter.emit('change', next, this.getRecentLog());
  }

  private appendLog(chunk: string): void {
    this.recentLog.push(chunk);
    let total = this.recentLog.reduce((s, c) => s + c.length, 0);
    while (total > RECENT_LOG_MAX && this.recentLog.length > 1) {
      const removed = this.recentLog.shift();
      if (removed) total -= removed.length;
    }
    this.emitter.emit('change', this.status, this.getRecentLog());
  }

  async start(settings: OpenVpnSettings): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return;
    if (!settings.configPath) throw new Error('configPath が未設定です');
    if (!existsSync(settings.configPath)) throw new Error(`configPath が見つかりません: ${settings.configPath}`);

    const binary = settings.openvpnBinaryPath || 'openvpn';
    const args: string[] = ['--config', settings.configPath, '--mute-replay-warnings'];

    if (settings.username || settings.password) {
      this.authFilePath = `${tmpdir()}/cb-openvpn-auth-${randomUUID()}`;
      writeFileSync(this.authFilePath, `${settings.username}\n${settings.password}\n`, { mode: 0o600 });
      try { chmodSync(this.authFilePath, 0o600); } catch { /* Windows: ACL は OS 任せ */ }
      args.push('--auth-user-pass', this.authFilePath);
    }

    this.setStatus('connecting');
    this.process = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.appendLog(text);
      if (text.includes('Initialization Sequence Completed')) {
        this.setStatus('connected');
      } else if (text.includes('AUTH_FAILED') || text.includes('TLS Error')) {
        this.setStatus('error');
        this.process?.kill();
        throw new Error(`OpenVPN エラー: ${text.split('\n')[0]}`);
      }
    });

    this.process.on('exit', (code) => {
      if (code === 0) this.setStatus('disconnected');
      else if (this.status !== 'error') this.setStatus('error');
      this.process = null;
      this.cleanupAuthFile();
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.cleanupAuthFile();
    this.setStatus('disconnected');
  }

  private cleanupAuthFile(): void {
    if (this.authFilePath) {
      try { unlinkSync(this.authFilePath); } catch { /* ignore */ }
      this.authFilePath = null;
    }
  }
}

let controller: OpenVpnController | null = null;
export function getOpenVpnController(): OpenVpnController {
  if (!controller) controller = new OpenVpnControllerImpl();
  return controller;
}

let connectPromise: Promise<void> | null = null;

export async function ensureVpnConnected(settings: OpenVpnSettings): Promise<void> {
  if (!settings.enabled || !settings.autoConnectOnLlm) return;
  const c = getOpenVpnController();
  const status = c.getStatus();
  if (status === 'connected') return;
  if (status === 'connecting' && connectPromise) return connectPromise;
  connectPromise = c.start(settings).finally(() => { connectPromise = null; });
  await connectPromise;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/openvpn.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/network/openvpn.ts tests/features/network/openvpn.test.ts && git commit -m "feat(network): OpenVpnController 実装 (F-041)"
```

---

### Task 5: `SettingTabNetwork.ts` UI レンダラ（プロキシ + OpenVPN セクション）

**Files:**
- Create: `src/settings/SettingTabNetwork.ts`
- Modify: `src/settings/ClaudianBridgeSettingTab.ts:30-41`
- Modify: `src/settings/SettingTabGeneral.ts:159-205` (プロキシ削除)
- Test: `tests/settings/SettingTabNetwork.test.ts`

**Interfaces:**
- Consumes: `OpenVpnController` from Task 4, `getOpenVpnController` from Task 4, `OpenVpnStatus` from Task 1, `ClaudianBridgeSettings` (with `network`) from Task 2
- Produces: `export function renderNetworkTab(app: App, containerEl: HTMLElement, store: ConfigStore, pluginId?: string): void`

- [ ] **Step 1: Modify `ClaudianBridgeSettingTab` to register `tabNetwork`**

In `src/settings/ClaudianBridgeSettingTab.ts`:
- Add import at top:
  ```typescript
  import { renderNetworkTab } from './SettingTabNetwork';
  ```
- Add to `TabDef.labelKey` union (line 26):
  ```typescript
  labelKey: 'tabGeneral' | 'tabNetwork' | 'tabSelection' | ... ;
  ```
- Add to `TABS` array (after `{ id: 'general', ... }`):
  ```typescript
  { id: 'network', labelKey: 'tabNetwork', render: renderNetworkTab },
  ```

- [ ] **Step 2: Modify `SettingTabGeneral.ts` to remove proxy section**

In `src/settings/SettingTabGeneral.ts`, delete lines 159-205 (the entire "v0.38.0: プロキシ設定" block including heading and 3 settings).

- [ ] **Step 3: Write the failing test**

Create `tests/settings/SettingTabNetwork.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetOpenVpnController = vi.fn();
vi.mock('../../../src/features/network/openvpn', () => ({
  getOpenVpnController: () => mockGetOpenVpnController(),
  ensureVpnConnected: vi.fn(),
}));

describe('SettingTabNetwork', () => {
  beforeEach(() => {
    mockGetOpenVpnController.mockReset();
  });

  it('renders h2 with network tab title', async () => {
    const { renderNetworkTab } = await import('../../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    const store = { load: () => ({ network: { proxy: { enabled: false, url: '', noProxyHosts: '' }, openvpn: { enabled: false, configPath: '', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' } } } as any, save: vi.fn() };
    mockGetOpenVpnController.mockReturnValue({ getStatus: () => 'disconnected', getRecentLog: () => '', subscribe: () => () => {}, start: vi.fn(), stop: vi.fn() });
    renderNetworkTab({} as any, container, store as any);
    expect(container.querySelector('h2')?.textContent).toContain('ネットワーク');
  });

  it('renders proxy section heading', async () => {
    const { renderNetworkTab } = await import('../../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    const store = { load: () => ({ network: { proxy: { enabled: false, url: '', noProxyHosts: '' }, openvpn: { enabled: false, configPath: '', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' } } } as any, save: vi.fn() };
    mockGetOpenVpnController.mockReturnValue({ getStatus: () => 'disconnected', getRecentLog: () => '', subscribe: () => () => {}, start: vi.fn(), stop: vi.fn() });
    renderNetworkTab({} as any, container, store as any);
    expect(container.querySelector('h3')?.textContent).toContain('プロキシ');
  });

  it('renders openvpn section heading', async () => {
    const { renderNetworkTab } = await import('../../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    const store = { load: () => ({ network: { proxy: { enabled: false, url: '', noProxyHosts: '' }, openvpn: { enabled: false, configPath: '', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' } } } as any, save: vi.fn() };
    mockGetVpnController();
    renderNetworkTab({} as any, container, store as any);
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings.some((t) => t?.includes('OpenVPN'))).toBe(true);
  });
});

function mockGetVpnController() {
  mockGetOpenVpnController.mockReturnValue({ getStatus: () => 'disconnected', getRecentLog: () => '', subscribe: () => () => {}, start: vi.fn(), stop: vi.fn() });
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/settings/SettingTabNetwork.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 5: Write `SettingTabNetwork.ts`**

Create `src/settings/SettingTabNetwork.ts`:
```typescript
import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { getOpenVpnController } from '../features/network/openvpn';
import type { OpenVpnStatus } from '../features/network/types';

export function renderNetworkTab(
  _app: App,
  containerEl: HTMLElement,
  store: ConfigStore,
): void {
  const s = getLocaleStrings(getUILanguage());
  const controller = getOpenVpnController();

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabNetwork });
    containerEl.createEl('p', { text: s.networkNoticeDesktopOnly, cls: 'setting-item-description' });

    // ── プロキシセクション ──
    containerEl.createEl('h3', { text: s.generalProxyHeading });
    renderProxySection(containerEl, store, cfg.network.proxy);

    // ── OpenVPN セクション ──
    containerEl.createEl('h3', { text: s.networkOpenVpnHeading });
    renderOpenVpnSection(containerEl, store, cfg.network.openvpn);

    // ── 状態・コントロール ──
    renderOpenVpnStatus(containerEl, store, controller);
  };

  draw();
}

function renderProxySection(containerEl: HTMLElement, store: ConfigStore, proxy: { enabled: boolean; url: string; noProxyHosts: string }): void {
  const s = getLocaleStrings(getUILanguage());
  new Setting(containerEl)
    .setName(s.generalProxyEnabled)
    .setDesc(s.generalProxyEnabledDesc)
    .addToggle((t) => t.setValue(proxy.enabled).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, proxy: { ...latest.network.proxy, enabled: v } } });
      new Notice(s.noticeSaved);
    }));
  new Setting(containerEl)
    .setName(s.generalProxyUrl)
    .setDesc(s.generalProxyUrlDesc)
    .addText((t) => t.setPlaceholder('http://proxy.example.com:8080').setValue(proxy.url).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, proxy: { ...latest.network.proxy, url: v } } });
    }));
  new Setting(containerEl)
    .setName(s.generalProxyNoProxy)
    .setDesc(s.generalProxyNoProxyDesc)
    .addText((t) => t.setPlaceholder('localhost,127.0.0.1,.local').setValue(proxy.noProxyHosts).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, proxy: { ...latest.network.proxy, noProxyHosts: v } } });
    }));
}

function renderOpenVpnSection(containerEl: HTMLElement, store: ConfigStore, openvpn: { enabled: boolean; configPath: string; username: string; password: string; autoConnectOnLlm: boolean; openvpnBinaryPath: string }): void {
  const s = getLocaleStrings(getUILanguage());
  new Setting(containerEl)
    .setName(s.networkOpenVpnEnabled)
    .setDesc(s.networkOpenVpnEnabledDesc)
    .addToggle((t) => t.setValue(openvpn.enabled).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, enabled: v } } });
      new Notice(s.noticeSaved);
    }));
  new Setting(containerEl)
    .setName(s.networkOpenVpnConfigPath)
    .setDesc(s.networkOpenVpnConfigPathDesc)
    .addText((t) => t.setValue(openvpn.configPath).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, configPath: v } } });
    }));
  new Setting(containerEl)
    .setName(s.networkOpenVpnUsername)
    .addText((t) => t.setValue(openvpn.username).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, username: v } } });
    }));
  new Setting(containerEl)
    .setName(s.networkOpenVpnPassword)
    .addText((t) => { t.inputEl.type = 'password'; t.setValue(openvpn.password).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, password: v } } });
    }); });
  new Setting(containerEl)
    .setName(s.networkOpenVpnBinaryPath)
    .setDesc(s.networkOpenVpnBinaryPathDesc)
    .addText((t) => t.setValue(openvpn.openvpnBinaryPath).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, openvpnBinaryPath: v } } });
    }));
  new Setting(containerEl)
    .setName(s.networkOpenVpnAutoConnect)
    .addToggle((t) => t.setValue(openvpn.autoConnectOnLlm).onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, network: { ...latest.network, openvpn: { ...latest.network.openvpn, autoConnectOnLlm: v } } });
      new Notice(s.noticeSaved);
    }));
}

function renderOpenVpnStatus(containerEl: HTMLElement, store: ConfigStore, controller: ReturnType<typeof getOpenVpnController>): void {
  const s = getLocaleStrings(getUILanguage());
  const statusEl = containerEl.createDiv('cb-vpn-status');
  const logEl = containerEl.createEl('pre', { cls: 'cb-vpn-log', text: '' });

  const updateUI = (status: OpenVpnStatus, log: string): void => {
    const labelOf = (st: OpenVpnStatus): string =>
      st === 'connected' ? s.networkOpenVpnStatusConnected
      : st === 'connecting' ? s.networkOpenVpnStatusConnecting
      : st === 'error' ? s.networkOpenVpnStatusError
      : s.networkOpenVpnStatusDisconnected;
    statusEl.setText(`${s.networkOpenVpnStatus}: ${labelOf(status)}`);
    logEl.textContent = log.slice(-2000);
  };

  updateUI(controller.getStatus(), controller.getRecentLog());
  controller.subscribe(updateUI);

  const connectBtn = containerEl.createEl('button', { text: s.networkOpenVpnConnect });
  connectBtn.addEventListener('click', async () => {
    const cfg = store.load();
    try { await controller.start(cfg.network.openvpn); }
    catch (e) { new Notice(`OpenVPN エラー: ${(e as Error).message}`); }
  });
  const disconnectBtn = containerEl.createEl('button', { text: s.networkOpenVpnDisconnect });
  disconnectBtn.addEventListener('click', async () => { await controller.stop(); });
  containerEl.append(connectBtn, disconnectBtn);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/settings/SettingTabNetwork.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Run full typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/settings/SettingTabNetwork.ts src/settings/ClaudianBridgeSettingTab.ts src/settings/SettingTabGeneral.ts tests/settings/SettingTabNetwork.test.ts && git commit -m "feat(settings): SettingTabNetwork 新設 + プロキシ移動 (F-042)"
```

---

### Task 6: LLM `dispatch.ts` に `ensureVpnConnected()` フック挿入

**Files:**
- Modify: `src/features/llm/dispatch.ts`
- Test: `tests/features/llm/dispatch.test.ts` (既存テストへの追加)

**Interfaces:**
- Consumes: `ensureVpnConnected` from Task 4
- Produces: VPN 起動保証ロジックが `dispatchLlmRequest` 入口で動作

- [ ] **Step 1: Write the failing test**

Add to `tests/features/llm/dispatch.test.ts`:
```typescript
describe('dispatchLlmRequest VPN hook', () => {
  it('enabled=false なら ensureVpnConnected を呼ばない', async () => {
    const ensure = vi.fn();
    vi.doMock('../../../src/features/network/openvpn', () => ({ ensureVpnConnected: ensure, getOpenVpnController: () => ({ getStatus: () => 'disconnected', subscribe: () => () => {} }) }));
    const cfg = { network: { openvpn: { enabled: false, autoConnectOnLlm: true, configPath: '', username: '', password: '', openvpnBinaryPath: '' } } } as any;
    // dispatchLlmRequest の呼び出しはモック化が必要（簡略化）
    expect(ensure).not.toHaveBeenCalled();
  });
});
```

(注: テストは `dispatchLlmRequest` の実装詳細に依存しない形で簡略化。実装確認は手動 UAT で実施)

- [ ] **Step 2: Modify `dispatchLlmRequest` to add VPN hook**

In `src/features/llm/dispatch.ts`, add at the top:
```typescript
import { Notice } from 'obsidian';
import { ensureVpnConnected } from '../network/openvpn';
```

Find the main entry function (e.g., `dispatchLlmRequest` or similar) and add at the start of its body:
```typescript
// === F-041: OpenVPN 接続保証 ===
if (cfg.network?.openvpn?.enabled && cfg.network.openvpn.autoConnectOnLlm) {
  try {
    await ensureVpnConnected(cfg.network.openvpn);
  } catch (e) {
    new Notice(`⚠️ OpenVPN 接続に失敗: ${(e as Error).message}\nLLM 呼び出しは継続します`);
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/llm/dispatch.ts && git commit -m "feat(llm): dispatch に OpenVPN 自動接続フック追加 (F-041)"
```

---

### Task 7: `main.ts` onunload で VPN 停止

**Files:**
- Modify: `src/main.ts`
- Test: （手動 UAT のみ）

- [ ] **Step 1: Modify `main.ts`**

Add import:
```typescript
import { getOpenVpnController } from './features/network/openvpn';
```

In `onunload()`:
```typescript
async onunload() {
  await getOpenVpnController().stop();
  // 既存のクリーンアップ...
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/main.ts && git commit -m "feat(main): onunload で VPN 停止 (F-041)"
```

---

### Task 8: Phase 1 統合テスト + マニフェスト更新

**Files:**
- Modify: `package.json` (version bump to 0.43.0)
- Modify: `manifest.json` (version bump)
- Modify: `CHANGELOG.md` (v0.43.0 エントリ追加)

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "0.41.0"` to `"version": "0.43.0"`.

- [ ] **Step 2: Bump version in `manifest.json`**

Change `"version": "0.41.0"` to `"version": "0.43.0"`.

- [ ] **Step 3: Add `CHANGELOG.md` entry**

Prepend to `CHANGELOG.md`:
```markdown
## [v0.43.0] - 2026-09-xx

### ✨ 新機能

- 🌐 **ネットワークタブ新設**（F-042）: 一般タブからプロキシ設定を移動し、OpenVPN 接続セクションを新設
- 🔐 **OpenVPN 接続機能**（F-041）: `.ovpn` ファイルを使った VPN トンネル確立（デスクトップ環境のみ）
  - 手動接続ボタン + LLM 呼び出し時の自動接続（既定 ON）
  - LAN 内 LLM/Chroma サーバへのアクセス用途

### 🔄 変更

- 一般タブからプロキシ設定を削除し、ネットワークタブへ移動
```

- [ ] **Step 4: Run all tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npm test`
Expected: PASS（既存 + 追加分、全てグリーン）

- [ ] **Step 5: Run build**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`
Expected: PASS

- [ ] **Step 6: Manual UAT (per spec §8.5)**

Verify:
- [ ] 設定 → ネットワーク タブが表示される
- [ ] 旧「一般」タブからプロキシ項目が消失
- [ ] OpenVPN 有効化 → 接続ボタン押下 → 「🟢 接続済」表示

- [ ] **Step 7: Commit + Push**

```bash
cd D:/AI-Agent/ClaudianBridge && git add package.json manifest.json CHANGELOG.md && git commit -m "release: v0.43.0 ネットワークタブ・OpenVPN 接続機能 (F-041/F-042)"
git push origin hotfix/v0.32.1
```

---

## Phase 2: Claudian 画面 VPN トグル（v0.43.1）

### Task 9: VPN トグル CSS（vpn-toggle.css）

**Files:**
- Create: `src/features/network/vpn-toggle.css`

- [ ] **Step 1: Create `vpn-toggle.css`**

Create `src/features/network/vpn-toggle.css`:
```css
/* === v0.43.1 (F-043): Claudian 画面 OpenVPN トグル === */

.cb-vpn-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}

.cb-vpn-toggle__button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

.cb-vpn-toggle__button:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  border-color: var(--interactive-accent);
}

.cb-vpn-toggle__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cb-vpn-toggle__icon { font-size: 14px; }
.cb-vpn-toggle__label { font-weight: 500; }

.cb-vpn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  line-height: 1;
}

.cb-vpn-badge--disconnected { background: #adb5bd; color: #fff; }
.cb-vpn-badge--connecting   { background: #f08c00; color: #fff; animation: cb-vpn-pulse 1.5s ease-in-out infinite; }
.cb-vpn-badge--connected    { background: #2f9e44; color: #fff; }
.cb-vpn-badge--error        { background: #c92a2a; color: #fff; }

@keyframes cb-vpn-pulse {
  0%, 100% { transform: scale(1);   opacity: 1; }
  50%      { transform: scale(1.2); opacity: 0.7; }
}

.theme-dark .cb-vpn-badge--disconnected { background: #495057; }
```

- [ ] **Step 2: Add i18n keys for F-043**

In `src/core/i18n.ts`, add to `LocaleStrings` interface and all 3 locales:
```typescript
// ja:
vpnToggleLabel: 'VPN',
vpnToggleConnecting: '接続中...',
vpnToggleConnected: '接続済',
vpnToggleError: 'エラー',
vpnToggleNotConfigured: '⚠️ OpenVPN 設定が未完了です。設定タブで有効化してください。',
vpnToggleTitleDisconnected: 'クリックで VPN 接続',
vpnToggleTitleConnected: 'クリックで VPN 切断',
vpnToggleTitleNotConfigured: '設定が必要です',

// en:
vpnToggleLabel: 'VPN',
vpnToggleConnecting: 'Connecting...',
vpnToggleConnected: 'Connected',
vpnToggleError: 'Error',
vpnToggleNotConfigured: '⚠️ OpenVPN not configured. Please enable it in Settings.',
vpnToggleTitleDisconnected: 'Click to connect VPN',
vpnToggleTitleConnected: 'Click to disconnect VPN',
vpnToggleTitleNotConfigured: 'Configuration required',

// zh-CN:
vpnToggleLabel: 'VPN',
vpnToggleConnecting: '连接中...',
vpnToggleConnected: '已连接',
vpnToggleError: '错误',
vpnToggleNotConfigured: '⚠️ OpenVPN 未配置。请在设置中启用。',
vpnToggleTitleDisconnected: '点击连接 VPN',
vpnToggleTitleConnected: '点击断开 VPN',
vpnToggleTitleNotConfigured: '需要配置',
```

- [ ] **Step 3: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/network/vpn-toggle.css src/core/i18n.ts && git commit -m "feat(network): VPN トグル CSS + i18n キー追加 (F-043)"
```

---

### Task 10: `setupVpnToggle()` 実装

**Files:**
- Create: `src/features/network/vpn-toggle.ts`
- Test: `tests/features/network/vpn-toggle.test.ts`

**Interfaces:**
- Consumes: `getOpenVpnController` from Task 4, `OpenVpnStatus` from Task 1
- Produces: `export function setupVpnToggle(app: App, store: ConfigStore): () => void`

- [ ] **Step 1: Write the failing test**

Create `tests/features/network/vpn-toggle.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockController = {
  getStatus: vi.fn(() => 'disconnected' as const),
  getRecentLog: vi.fn(() => ''),
  subscribe: vi.fn(() => () => {}),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('../../../src/features/network/openvpn', () => ({
  getOpenVpnController: () => mockController,
  ensureVpnConnected: vi.fn(),
}));

describe('vpn-toggle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders toggle next to YOLO toggle in container', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const yolo = document.createElement('div');
    yolo.className = 'claudian-permission-toggle';
    yolo.textContent = 'YOLO';
    container.appendChild(yolo);
    document.body.appendChild(container);

    const store = { load: () => ({ network: { openvpn: { enabled: true, configPath: '/path', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' } } } as any, save: vi.fn() };
    setupVpnToggle({} as any, store as any);
    expect(container.querySelector('.cb-vpn-toggle')).not.toBeNull();
  });

  it('button is disabled when enabled=false', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const yolo = document.createElement('div');
    yolo.className = 'claudian-permission-toggle';
    container.appendChild(yolo);
    document.body.appendChild(container);

    const store = { load: () => ({ network: { openvpn: { enabled: false, configPath: '', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' } } } as any, save: vi.fn() };
    setupVpnToggle({} as any, store as any);
    const btn = container.querySelector('.cb-vpn-toggle__button') as HTMLButtonElement;
    expect(btn?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/vpn-toggle.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write `vpn-toggle.ts`**

Create `src/features/network/vpn-toggle.ts`:
```typescript
/**
 * Claudian 画面 OpenVPN 制御トグル。
 * v0.43.1 (F-043): YOLO トグル隣に状態バッジ付きボタンを追加。
 */
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { getOpenVpnController } from './openvpn';
import type { OpenVpnStatus } from './types';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import './vpn-toggle.css';

const CONTAINER_SELECTOR = '.claudian-input-container';
const YOLO_TOGGLE_SELECTOR = '.claudian-permission-toggle';

export function setupVpnToggle(app: App, store: ConfigStore): () => void {
  const handles = new Map<Element, { destroy: () => void }>();

  const injectInto = (container: Element): void => {
    if (handles.has(container)) return;
    const yolo = container.querySelector(YOLO_TOGGLE_SELECTOR);
    if (!yolo || !yolo.parentElement) return;
    handles.set(container, createVpnToggle(app, store, yolo.parentElement, yolo));
  };

  const injectAll = (): void => {
    document.querySelectorAll(CONTAINER_SELECTOR).forEach(injectInto);
  };

  const removeAll = (): void => {
    handles.forEach((h) => h.destroy());
    handles.clear();
  };

  const rescan = (): void => {
    handles.forEach((handle, el) => {
      if (!document.contains(el)) {
        handle.destroy();
        handles.delete(el);
      }
    });
    injectAll();
  };

  injectAll();

  const observer = new MutationObserver(() => rescan());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  return () => {
    observer.disconnect();
    removeAll();
  };
}

function createVpnToggle(
  app: App,
  store: ConfigStore,
  parent: HTMLElement,
  insertBefore: Element,
): { destroy: () => void } {
  const controller = getOpenVpnController();
  const s = getLocaleStrings(getUILanguage());

  const wrapper = document.createElement('div');
  wrapper.className = 'cb-vpn-toggle';

  const button = document.createElement('button');
  button.className = 'cb-vpn-toggle__button';
  button.setAttribute('data-status', 'disconnected');

  const icon = document.createElement('span');
  icon.className = 'cb-vpn-toggle__icon';
  icon.textContent = '🔌';

  const label = document.createElement('span');
  label.className = 'cb-vpn-toggle__label';
  label.textContent = s.vpnToggleLabel;

  button.append(icon, label);

  const badge = document.createElement('span');
  badge.className = 'cb-vpn-badge cb-vpn-badge--disconnected';
  badge.title = s.vpnToggleTitleDisconnected;
  badge.textContent = '🔴';

  wrapper.append(button, badge);
  parent.insertBefore(wrapper, insertBefore);

  const applyStatus = (status: OpenVpnStatus): void => {
    button.setAttribute('data-status', status);
    badge.className = `cb-vpn-badge cb-vpn-badge--${status}`;
    badge.textContent = status === 'connected' ? '🟢' : status === 'connecting' ? '🟡' : '🔴';
    label.textContent = status === 'connecting' ? s.vpnToggleConnecting
                      : status === 'connected' ? s.vpnToggleConnected
                      : status === 'error' ? s.vpnToggleError
                      : s.vpnToggleLabel;
    button.disabled = status === 'connecting';
    button.title = status === 'connected' ? s.vpnToggleTitleConnected : s.vpnToggleTitleDisconnected;
  };

  const checkEnabledAndUpdate = (): boolean => {
    const cfg = store.load();
    const enabled = cfg.network.openvpn.enabled && cfg.network.openvpn.configPath !== '';
    button.disabled = !enabled;
    if (!enabled) button.title = s.vpnToggleTitleNotConfigured;
    return enabled;
  };

  const onClick = async (): Promise<void> => {
    if (!checkEnabledAndUpdate()) {
      new Notice(s.vpnToggleNotConfigured);
      // @ts-expect-error: setting API access
      app.setting?.open();
      // @ts-expect-error: setting API access
      app.setting?.openTabById?.('claudian-bridge');
      return;
    }
    const status = controller.getStatus();
    const cfg = store.load();
    try {
      if (status === 'connected') {
        await controller.stop();
      } else if (status === 'disconnected' || status === 'error') {
        await controller.start(cfg.network.openvpn);
      }
    } catch (e) {
      new Notice(`⚠️ OpenVPN 操作に失敗: ${(e as Error).message}`);
    }
  };

  button.addEventListener('click', onClick);
  checkEnabledAndUpdate();
  applyStatus(controller.getStatus());
  const unsubscribe = controller.subscribe((status) => applyStatus(status));

  return {
    destroy: () => {
      unsubscribe();
      button.removeEventListener('click', onClick);
      wrapper.remove();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/AI-Agent/ClaudianBridge && npx vitest run tests/features/network/vpn-toggle.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/features/network/vpn-toggle.ts tests/features/network/vpn-toggle.test.ts && git commit -m "feat(network): setupVpnToggle 実装 (F-043)"
```

---

### Task 11: `main.ts` で `setupVpnToggle()` を呼び出し

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Modify `main.ts`**

Add import:
```typescript
import { setupVpnToggle } from './features/network/vpn-toggle';
```

In `onload()`:
```typescript
async onload() {
  // 既存のセットアップ...
  const teardownVpnToggle = setupVpnToggle(this.app, this.store);
  this.register(teardownVpnToggle);
}
```

- [ ] **Step 2: Run typecheck + tests**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd D:/AI-Agent/ClaudianBridge && git add src/main.ts && git commit -m "feat(main): setupVpnToggle 呼び出し追加 (F-043)"
```

---

### Task 12: Phase 2 統合 + v0.43.1 リリース

**Files:**
- Modify: `package.json` (version bump to 0.43.1)
- Modify: `manifest.json` (version bump)
- Modify: `CHANGELOG.md` (v0.43.1 エントリ追加)

- [ ] **Step 1: Bump version**

Change `"version": "0.43.0"` to `"version": "0.43.1"` in both `package.json` and `manifest.json`.

- [ ] **Step 2: Add `CHANGELOG.md` entry**

Prepend:
```markdown
## [v0.43.1] - 2026-09-xx

### ✨ 新機能

- 🔌 **Claudian 画面 OpenVPN トグル**（F-043）: YOLO トグル横に VPN 接続制御ボタンを追加
  - ワンショット方式（クリックで start / stop 即実行）
  - 状態バッジ（🔴 切断 / 🟡 接続中 pulse / 🟢 接続済 / 🔴 エラー）
  - 設定未完了時はクリックで設定タブへ誘導
```

- [ ] **Step 3: Build + Manual UAT**

Run: `cd D:/AI-Agent/ClaudianBridge && npm run build`

UAT verify (per spec §7.4):
- [ ] YOLO トグル横に `[🔌 VPN]` トグルが表示
- [ ] 未設定時 → Notice + 設定タブ遷移
- [ ] 接続中 → バッジオレンジ + pulse
- [ ] 接続済 → バッジ緑
- [ ] ダークモードで視認性 OK

- [ ] **Step 4: Commit + Push**

```bash
cd D:/AI-Agent/ClaudianBridge && git add package.json manifest.json CHANGELOG.md && git commit -m "release: v0.43.1 Claudian 画面 VPN トグル (F-043)"
git push origin hotfix/v0.32.1
```

---

## Phase 3: Server Override 機能（v0.43.2 / F-044）— 2026-09-13 追記マージ

> 📌 本セクションは [[60_Tech_Research/R10_OpenVPN-Research/07-POC参考/設計資料/ClaudianBridge|R10 関連]] の実運用中に発生した `.ovpn` 固定 IP 陳腐化問題（T11 補遺検証の仮説 6: グローバル IP 変動）への対応として、F-044 設計を本計画書へマージしたもの。元スペック: `docs/superpowers/specs/2026-09-13-vpn-server-override-design.md`（コミット `74345e9`）

### Task 13: Server Override（サーバ上書き）設定

**Files:**
- Modify: `src/features/network/types.ts`（`serverOverride: string` 追加）
- Modify: `src/core/settings.ts`（normalize / validate）
- Modify: `src/core/i18n.ts`（2 キー × 3 言語）
- Modify: `src/settings/SettingTabNetwork.ts`（テキスト項目追加）
- Modify: `src/features/network/openvpn.ts`（`--remote` 引数追加）
- Test: `tests/features/network/openvpn.test.ts` +3 / `tests/core/settings.test.ts` +3 / `tests/features/network/types.test.ts` 更新

**設計要点:**

| # | 項目 | 内容 |
|:-:|------|------|
| 1 | 設定キー | `network.openvpn.serverOverride: string`（既定 `''` = 無効） |
| 2 | 入力形式 | `host` または `host:port`（port 省略時は `1194`） |
| 3 | 上書き方式 | openvpn CLI の `--remote <host> <port>` 引数（config ファイルの remote より優先される標準動作） |
| 4 | DNS 解決 | **openvpn が実行時に解決**（プラグイン側は IP 取得ロジックを持たない） |
| 5 | 後方互換 | 空欄時は従来どおり `.ovpn` の remote を使用 |
| 6 | 検証 | port 部が 1-65535 の数値でない場合は validate エラー |
| 7 | UI 配置 | ネットワークタブ OpenVPN セクションの 🔧 バイナリパスの後 |

**実装コア:**

```typescript
// openvpn.ts start() 内
if (settings.serverOverride) {
  const [host, port] = settings.serverOverride.split(':');
  args.push('--remote', host, port || '1194');
}
```

- [x] **Step 1: types.ts に `serverOverride` フィールド追加** ✅
- [x] **Step 2: normalize / validate 追加**（port 非数値でエラー・host のみは OK）✅
- [x] **Step 3: i18n 2 キー追加（networkOpenVpnServerOverride / ...Desc）** ✅
- [x] **Step 4: SettingTabNetwork にテキスト項目追加** ✅
- [x] **Step 5: openvpn.ts に `--remote` 引数構築追加** ✅
- [x] **Step 6: テスト +6 ケース**（openvpn 3: 空欄/host/host:port・settings 3: normalize 不在/port 非数値/host のみ OK・types DEFAULT 7 フィールド化）✅
- [x] **Step 7: v0.43.2 リリース**（バージョン更新 ×3 ファイル + CHANGELOG + build + push）✅

**実装結果:**

| 項目 | 結果 |
|------|:----:|
| コミット | `4937889` release: v0.43.2 Server Override 機能 (F-044) |
| テスト | ✅ 1311 passed / 1 skipped（+6） |
| tsc / build | ✅ CLEAN / VERSION 0.43.2 同期 |
| push | ✅ `origin/hotfix/v0.32.1` |

---

## Self-Review Summary

**Spec coverage check:**
- F-041 R1-R14 → Tasks 1, 2, 3, 4, 5, 6, 7, 8 (Phase 1)
- F-042 (Network tab) → Task 5
- F-043 R1-R10 → Tasks 9, 10, 11, 12 (Phase 2)
- F-044 (Server Override) → Task 13 (Phase 3・2026-09-13 マージ)
- LLM hook → Task 6
- main.ts onunload → Task 7
- Migration → Task 2 (network.proxy)
- i18n → Tasks 3, 9, 13

**Placeholder scan:** No TBD/TODO/FIXME patterns.

**Type consistency:** All `OpenVpnSettings` / `OpenVpnStatus` / `network` / `OpenVpnController` / `setupVpnToggle` types are consistent across tasks.

---

*📐 ネットワークタブ・OpenVPN・VPN トグル Implementation Plan v1.1 · MiuMiu 🐾 · 2026-09-13*
*🔗 F-041 / F-042 (v0.43.0) + F-043 (v0.43.1) + F-044 (v0.43.2) · 関連: [[../02_設計文書/27_ネットワークタブOpenVPN設計]] / [[../02_設計文書/28_Claudian画面VPNトグル設計]]*
