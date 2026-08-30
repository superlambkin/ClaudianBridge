# 智谱（Zhipu）LLM 残量プロバイダ追加 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian Bridge の LLM 残量インジケータに智谱（Zhipu）プロバイダを追加し、GLM Coding Plan の 5 時間窓使用率 % を表示できるようにする。

**Architecture:** 既存の `MultiQuotaService` のプロバイダ登録パターンを踏襲。TS 側 `createZhipuProvider` が Python スクリプト（`zai-sdk` の `ZhipuAiClient` で auth 解決）を spawn し、`open.bigmodel.cn/api/monitor/usage/quota/limit` から取得した 5h 使用率 % を `ProviderQuota` に変換して返す。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest / Python 3 / zai-sdk（`ZhipuAiClient`）

## Global Constraints

- コードリポジトリ: `D:\AI-Agent\ClaudianBridge`（git 管理・全コミットはここで行う）
- Python スクリプト配置先（Vault）: `00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py`
- 既存プロバイダと同じパターン: `QuotaProvider` 抽象・`httpGet` 相当・`isConfigured()` / `fetch()`
- Python spawn は `shell: false` + args 配列 + 明示 timeout（30 秒）で行う（インジェクション防止）
- Windows パイプ対策: `PYTHONIOENCODING=utf-8` / `PYTHONUTF8=1` を必ず設定
- 表示データは GLM Coding Plan **5 時間窓使用率 %**（`type === 'TOKENS_LIMIT' && unit === 3`）
- API キー: 設定 `quota.zhipuApiKey` → 環境変数 `ZHIPU_API_KEY` → `ZAI_API_KEY` の順で解決
- i18n は ja / en / zh の 3 言語すべてを必ず同時更新

---

## ファイル構成

| 種別 | パス | 責務 |
|------|------|------|
| 変更 | `src/features/quota/types.ts` | `ProviderId` に `'zhipu'` 追加 |
| 変更 | `src/features/quota/llm-info.ts` | `LlmProviderId` に `'zhipu'`、base_url 検出追加 |
| 新規 | `src/features/quota/python.ts` | Python spawn ヘルパー（`runPython` / `parseJsonOutput`） |
| 変更 | `src/core/settings.ts` | `zhipuApiKey` / `zhipuPythonPath` / `displayModels.zhipu` |
| 新規 | `00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py` | 智谱クォータ取得スクリプト |
| 新規 | `src/features/quota/providers/zhipu.ts` | `createZhipuProvider()` |
| 変更 | `src/features/quota/service.ts` | プロバイダ登録 + `resolveVaultRoot` ヘルパー |
| 変更 | `src/core/i18n.ts` | 智谱用文字列（ja/en/zh） |
| 変更 | `src/settings/SettingTabQuota.ts` | 表示切替・API キー入力・接続テストに智谱追加 |
| テスト | `tests/features/quota/python.test.ts` | `parseJsonOutput` |
| テスト | `tests/features/quota/providers/zhipu.test.ts` | `createZhipuProvider` |
| テスト | `tests/features/quota/llm-info.test.ts` | 智谱 base_url 検出 |
| テスト | `tests/core/settings.test.ts` | 智谱設定の正規化 |
| テスト | `tests/features/quota/service.test.ts` | 智谱プロバイダ登録 |

---

## Task 1: 型・プロバイダ検出（types / llm-info）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/quota/types.ts:69`
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/quota/llm-info.ts:5,23-30`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/quota/llm-info.test.ts`

**Interfaces:**
- Produces: `ProviderId` に `'zhipu'` が追加される。`LlmProviderId` に `'zhipu'` が追加され、`detectProviderFromBaseUrl()` が `bigmodel` / `z.ai` を含む URL で `'zhipu'` を返す。

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/llm-info.test.ts` の `detectProviderFromBaseUrl` describe 内に追加:

```typescript
it('zhipu bigmodel URL → zhipu', () => {
  expect(detectProviderFromBaseUrl('https://open.bigmodel.cn/api/paas/v4')).toBe('zhipu');
});
it('zhipu z.ai URL → zhipu', () => {
  expect(detectProviderFromBaseUrl('https://api.z.ai/api/paas/v4')).toBe('zhipu');
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/llm-info.test.ts
```

Expected: FAIL — `detectProviderFromBaseUrl` が `'claude'` を返す（`'zhipu'` 未定義）。

- [ ] **Step 3: 実装**

`src/features/quota/types.ts:69`:

```typescript
export type ProviderId = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu';
```

`src/features/quota/llm-info.ts:5`:

```typescript
export type LlmProviderId = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu' | 'unknown';
```

`src/features/quota/llm-info.ts` の `detectProviderFromBaseUrl`（`return 'claude'` の直前）:

```typescript
if (u.includes('bigmodel')) return 'zhipu';
if (u.includes('z.ai')) return 'zhipu';
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/llm-info.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/features/quota/types.ts src/features/quota/llm-info.ts tests/features/quota/llm-info.test.ts && git commit -m "feat(quota): add zhipu provider id and base-url detection"
```

---

## Task 2: Python spawn ヘルパー（python.ts）

**Files:**
- Create: `D:/AI-Agent/ClaudianBridge/src/features/quota/python.ts`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/quota/python.test.ts`

**Interfaces:**
- Produces:
  - `runPython(opts: { pythonPath; scriptPath; args; cwd; timeoutMs?; env? }): Promise<{ exitCode: number; stdout: string; stderr: string }>`
  - `parseJsonOutput<T>(stdout: string): { ok: true; data: T } | { ok: false; error: string; data: null }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/python.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseJsonOutput } from '../../../src/features/quota/python';

describe('parseJsonOutput', () => {
  it('有効 JSON → ok=true, data を返す', () => {
    expect(parseJsonOutput('{"ok": true, "pct": 45}')).toEqual({
      ok: true,
      data: { ok: true, pct: 45 },
    });
  });
  it('空文字 → ok=false, error=empty stdout', () => {
    const r = parseJsonOutput('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });
  it('不正 JSON → ok=false, error に JSON parse を含む', () => {
    const r = parseJsonOutput('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/python.test.ts
```

Expected: FAIL — module not found。

- [ ] **Step 3: 実装**

`src/features/quota/python.ts`:

```typescript
import { spawn } from 'child_process';

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunPythonOptions {
  pythonPath: string;
  scriptPath: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

/** Python CLI を同期実行（タイムアウト付き・shell:false → インジェクション防止）。 */
export function runPython(opts: RunPythonOptions): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let child;
    try {
      child = spawn(opts.pythonPath, ['-u', opts.scriptPath, ...opts.args], {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}), PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        shell: false,
        windowsHide: true,
      });
    } catch (e) {
      resolve({ exitCode: -1, stdout: '', stderr: `spawn failed: ${(e as Error).message}` });
      return;
    }
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: stderr || `spawn error: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: killed ? -1 : code ?? -1, stdout, stderr });
    });
  });
}

/** stdout を JSON としてパース（絶対に throw しない）。 */
export function parseJsonOutput<T>(stdout: string):
  | { ok: true; data: T }
  | { ok: false; error: string; data: null } {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return { ok: false, error: 'empty stdout', data: null };
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}`, data: null };
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/python.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/features/quota/python.ts tests/features/quota/python.test.ts && git commit -m "feat(quota): add python spawn helper (runPython, parseJsonOutput)"
```

---

## Task 3: 設定スキーマ拡張（settings）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts`（QuotaDisplayFlags / QuotaSettings / DEFAULT / normalize / validate）
- Test: `D:/AI-Agent/ClaudianBridge/tests/core/settings.test.ts`

**Interfaces:**
- Consumes: Task 1 の `ProviderId`（直接は未使用だが型整合）
- Produces: `QuotaSettings` に `zhipuApiKey: string` / `zhipuPythonPath: string`、`QuotaDisplayFlags` に `zhipu: boolean`。`normalizeClaudianBridgeSettings` / `validateClaudianBridgeSettings` がこれらを扱う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/settings.test.ts` に追加:

```typescript
it('quota.zhipuApiKey / zhipuPythonPath が正規化される', () => {
  const norm = normalizeClaudianBridgeSettings({ quota: { zhipuApiKey: 'sk-zhipu', zhipuPythonPath: 'python3' } });
  expect(norm.quota.zhipuApiKey).toBe('sk-zhipu');
  expect(norm.quota.zhipuPythonPath).toBe('python3');
});

it('DEFAULT: zhipuApiKey は空・zhipuPythonPath は非空・displayModels.zhipu は true', () => {
  expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.zhipuApiKey).toBe('');
  expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.zhipuPythonPath).toBeTruthy();
  expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota.displayModels.zhipu).toBe(true);
});

it('normalize: displayModels 欠落の zhipu は true になる', () => {
  const norm = normalizeClaudianBridgeSettings({});
  expect(norm.quota.displayModels.zhipu).toBe(true);
});

it('validate: quota.zhipuApiKey 型違反を返す', () => {
  const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, quota: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota, zhipuApiKey: 123 as unknown as string } };
  expect(validateClaudianBridgeSettings(bad)).toContain('quota.zhipuApiKey');
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts
```

Expected: FAIL — `zhipuApiKey` プロパティが存在しない等。

- [ ] **Step 3: 実装**

`src/core/settings.ts`:

1. `QuotaDisplayFlags` に追加:

```typescript
export interface QuotaDisplayFlags {
  claude: boolean;
  deepseek: boolean;
  kimi: boolean;
  minimax: boolean;
  zhipu: boolean;
}
```

2. `QuotaSettings` に追加:

```typescript
export interface QuotaSettings {
  claudeSettingsPath: string;
  deepseekApiKey: string;
  kimiApiKey: string;
  minimaxApiKey: string;
  zhipuApiKey: string;
  zhipuPythonPath: string;
  displayModels: QuotaDisplayFlags;
}
```

3. `DEFAULT_QUOTA_DISPLAY_MODELS` に追加:

```typescript
export const DEFAULT_QUOTA_DISPLAY_MODELS: QuotaDisplayFlags = {
  claude: true,
  deepseek: true,
  kimi: true,
  minimax: true,
  zhipu: true,
};
```

4. Python 既定パス定数を追加（`defaultClaudeSettingsPath()` の近く）:

```typescript
/** 既定の Python インタプリタ（office / chroma と同じ導出） */
const DEFAULT_PYTHON_PATH = typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3';
```

5. `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.quota` に追加:

```typescript
quota: {
  claudeSettingsPath: defaultClaudeSettingsPath(),
  deepseekApiKey: '',
  kimiApiKey: '',
  minimaxApiKey: '',
  zhipuApiKey: '',
  zhipuPythonPath: DEFAULT_PYTHON_PATH,
  displayModels: { ...DEFAULT_QUOTA_DISPLAY_MODELS },
},
```

6. `normalizeClaudianBridgeSettings` の `quota:` 内に追加:

```typescript
zhipuApiKey: typeof r.quota?.zhipuApiKey === 'string' ? r.quota.zhipuApiKey : '',
zhipuPythonPath: typeof r.quota?.zhipuPythonPath === 'string' && r.quota.zhipuPythonPath.trim() !== ''
  ? r.quota.zhipuPythonPath
  : DEFAULT_PYTHON_PATH,
displayModels: {
  claude: typeof r.quota?.displayModels?.claude === 'boolean' ? r.quota.displayModels.claude : true,
  deepseek: typeof r.quota?.displayModels?.deepseek === 'boolean' ? r.quota.displayModels.deepseek : true,
  kimi: typeof r.quota?.displayModels?.kimi === 'boolean' ? r.quota.displayModels.kimi : true,
  minimax: typeof r.quota?.displayModels?.minimax === 'boolean' ? r.quota.displayModels.minimax : true,
  zhipu: typeof r.quota?.displayModels?.zhipu === 'boolean' ? r.quota.displayModels.zhipu : true,
},
```

7. `validateClaudianBridgeSettings` に追加:

```typescript
if (typeof cfg.quota?.zhipuApiKey !== 'string') return 'quota.zhipuApiKey は文字列である必要があります';
if (typeof cfg.quota?.zhipuPythonPath !== 'string') return 'quota.zhipuPythonPath は文字列である必要があります';
```

8. `validateClaudianBridgeSettings` の displayModels ループ配列を変更:

```typescript
for (const k of ['claude', 'deepseek', 'kimi', 'minimax', 'zhipu'] as const) {
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/core/settings.ts tests/core/settings.test.ts && git commit -m "feat(quota): add zhipu api key and python path settings"
```

---

## Task 4: Python クォータ取得スクリプト（Vault）

**Files:**
- Create: `00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py`（Vault 相対）

**Interfaces:**
- Consumes: 環境変数 `ZHIPU_API_KEY` / `ZAI_API_KEY` または第 1 引数 API キー
- Produces: stdout に UTF-8 JSON 1 行
  - 成功: `{"ok": true, "pct": <int>, "nextResetTime": <str|null>}`
  - 失敗: `{"ok": false, "error": "<msg>"}`（HTTP 401/403 は `"expired"`）

- [ ] **Step 1: スクリプトを実装する**

`00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py`:

```python
"""智谱 (Zhipu) GLM Coding Plan 使用率取得スクリプト。

zai-sdk (ZhipuAiClient) で base_url / auth_headers を解決し、
GLM Coding Plan の 5 時間窓使用率 % を JSON で出力する。

出力 (stdout, UTF-8):
  成功: {"ok": true, "pct": <int>, "nextResetTime": <str|null>}
  失敗: {"ok": false, "error": "<msg>"}  (HTTP 401/403 は "expired")

使い方:
  python _query_zhipu_quota.py <api_key>
  または環境変数 ZHIPU_API_KEY / ZAI_API_KEY
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _emit(obj) -> None:
    sys.stdout.buffer.write(json.dumps(obj, ensure_ascii=False).encode("utf-8") + b"\n")


def main() -> None:
    api_key = sys.argv[1] if len(sys.argv) > 1 else (
        os.environ.get("ZHIPU_API_KEY") or os.environ.get("ZAI_API_KEY")
    )
    if not api_key:
        _emit({"ok": False, "error": "no key"})
        return

    try:
        from zai import ZhipuAiClient
    except ImportError as exc:
        _emit({"ok": False, "error": f"zai-sdk not installed: {exc} (pip install zai-sdk)"})
        return

    try:
        client = ZhipuAiClient(api_key=api_key)
        # base_url 例: https://open.bigmodel.cn/api/paas/v4 → host: https://open.bigmodel.cn
        host = client.base_url.split("/api/")[0]
        url = host + "/api/monitor/usage/quota/limit"
        headers = dict(client.auth_headers)
        headers["Accept-Language"] = "en-US,en"
        headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        code = data.get("code")
        if code != 200:
            _emit({"ok": False, "error": f"code {code}"})
            return

        limits = (data.get("data") or {}).get("limits") or []
        five = next(
            (l for l in limits if l.get("type") == "TOKENS_LIMIT" and l.get("unit") == 3),
            None,
        )
        if five is None:
            _emit({"ok": False, "error": "5h limit not found"})
            return

        pct = round(float(five.get("percentage") or 0))
        _emit({"ok": True, "pct": pct, "nextResetTime": five.get("nextResetTime")})
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            _emit({"ok": False, "error": "expired"})
        else:
            _emit({"ok": False, "error": f"HTTP {exc.code}"})
    except Exception as exc:
        _emit({"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 手動検証（キーなし）**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/00_Vault管理/_設定ファイル/_scripts" && python _query_zhipu_quota.py
```

Expected: `{"ok": false, "error": "no key"}`（stdout 1 行・UTF-8）

- [ ] **Step 3: 手動検証（zai-sdk 未導入時）**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/00_Vault管理/_設定ファイル/_scripts" && python _query_zhipu_quota.py fake-key
```

Expected: `{"ok": false, "error": "zai-sdk not installed: ..."}`（導入済みなら HTTP/401 エラー）

- [ ] **Step 4: コミット（git 管理下の Vault はコミットしない。POC フォルダのみ管理対象のためスキップ）**

> ℹ️ Python スクリプトは Vault の `00_Vault管理/_設定ファイル/_scripts/` に配置し、コードリポジトリ `D:\AI-Agent\ClaudianBridge` では管理しない（既存 `_run_markitdown.py` と同じ扱い）。

---

## Task 5: 智谱プロバイダ（zhipu.ts）

**Files:**
- Create: `D:/AI-Agent/ClaudianBridge/src/features/quota/providers/zhipu.ts`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/quota/providers/zhipu.test.ts`

**Interfaces:**
- Consumes: Task 2 の `runPython` / `parseJsonOutput`、Task 1 の `ProviderId`
- Produces: `createZhipuProvider(opts: { getKey(): string|undefined; getPythonPath(): string; getVaultRoot(): string }): QuotaProvider`

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/providers/zhipu.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/features/quota/python', () => ({
  runPython: vi.fn(),
  parseJsonOutput: (stdout: string) => {
    try {
      return { ok: true as const, data: JSON.parse(stdout) as unknown };
    } catch {
      return { ok: false as const, error: 'JSON parse error', data: null };
    }
  },
}));

import { createZhipuProvider } from '../../../../src/features/quota/providers/zhipu';
import { runPython } from '../../../../src/features/quota/python';

const runPythonMock = vi.mocked(runPython);

function makeProvider() {
  return createZhipuProvider({
    getKey: () => 'sk-zhipu',
    getPythonPath: () => 'py',
    getVaultRoot: () => 'C:\\vault',
  });
}

describe('createZhipuProvider', () => {
  beforeEach(() => {
    runPythonMock.mockReset();
  });

  it('キー未設定 → isConfigured=false', () => {
    const p = createZhipuProvider({
      getKey: () => undefined,
      getPythonPath: () => 'py',
      getVaultRoot: () => '',
    });
    expect(p.isConfigured()).toBe(false);
  });

  it('成功 → 5h 使用率 % を返す', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 45, nextResetTime: '2099-01-01T00:00:00Z' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('45%');
    expect(q.pct).toBe(45);
    expect(q.detail).toBe('5h');
  });

  it('expired（401/403）→ status expired', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'expired' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('expired');
  });

  it('error → status error + error メッセージ', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'code 500' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
    expect(q.error).toBe('code 500');
  });

  it('Python 不在（exitCode 127）→ error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 127, stdout: '', stderr: 'python not found' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });

  it('stdout が不正 JSON → error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 0, stdout: 'not json', stderr: '' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/providers/zhipu.test.ts
```

Expected: FAIL — module not found。

- [ ] **Step 3: 実装**

`src/features/quota/providers/zhipu.ts`:

```typescript
import * as path from 'path';
import type { ProviderQuota, QuotaProvider } from '../types';
import { runPython, parseJsonOutput } from '../python';

export interface ZhipuProviderOptions {
  getKey: () => string | undefined;
  getPythonPath: () => string;
  getVaultRoot: () => string;
}

/** Vault 内のヘルパースクリプト相対パス */
const SCRIPT_VAULT_REL = '00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py';

/**
 * 智谱 (Zhipu) GLM Coding Plan 使用率プロバイダ。
 *
 * Python スクリプト（zai-sdk）を spawn し、5 時間窓使用率 % を取得する。
 * - 成功: value = "<pct>%"
 * - 401/403: expired
 * - その他 / Python 不在 / JSON 不正: error
 */
export function createZhipuProvider(opts: ZhipuProviderOptions): QuotaProvider {
  return {
    id: 'zhipu',
    label: 'Zhipu',
    envKeys: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
    isConfigured: () => Boolean(opts.getKey()),
    async fetch(): Promise<ProviderQuota> {
      const key = opts.getKey();
      if (!key) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: 'no key' };
      }
      const scriptPath = path.join(opts.getVaultRoot(), SCRIPT_VAULT_REL);
      const run = await runPython({
        pythonPath: opts.getPythonPath(),
        scriptPath,
        args: [key],
        cwd: path.dirname(scriptPath),
        timeoutMs: 30_000,
      });
      if (run.exitCode !== 0) {
        return {
          status: 'error',
          providerId: 'zhipu',
          label: 'Zhipu',
          value: '',
          pct: null,
          error: run.stderr.trim() || `exit ${run.exitCode}`,
        };
      }
      const parsed = parseJsonOutput<{ ok: boolean; pct?: number; nextResetTime?: string | null; error?: string }>(run.stdout);
      if (!parsed.ok) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: `python: ${parsed.error}` };
      }
      const d = parsed.data;
      if (!d.ok) {
        return {
          status: d.error === 'expired' ? 'expired' : 'error',
          providerId: 'zhipu',
          label: 'Zhipu',
          value: '',
          pct: null,
          error: d.error ?? 'unknown',
        };
      }
      const pct = typeof d.pct === 'number' && Number.isFinite(d.pct) ? d.pct : null;
      return {
        status: 'success',
        providerId: 'zhipu',
        label: 'Zhipu',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: '5h',
      };
    },
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/providers/zhipu.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/features/quota/providers/zhipu.ts tests/features/quota/providers/zhipu.test.ts && git commit -m "feat(quota): add zhipu quota provider"
```

---

## Task 6: プロバイダ登録（service）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/quota/service.ts`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/quota/service.test.ts`

**Interfaces:**
- Consumes: Task 5 の `createZhipuProvider`、Task 3 の `cfg.quota.zhipuApiKey` / `zhipuPythonPath` / `displayModels.zhipu`
- Produces: `resolveVaultRoot(app: App | undefined): string`（export）。`MultiQuotaService` が智谱プロバイダを自動登録。

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/quota/service.test.ts` の `makeService` を更新:

```typescript
displayModels?: { claude?: boolean; deepseek?: boolean; kimi?: boolean; minimax?: boolean; zhipu?: boolean };
```

```typescript
quota: {
  deepseekApiKey: opts?.apiKeys?.deepseek ?? '',
  kimiApiKey: '',
  minimaxApiKey: '',
  zhipuApiKey: opts?.apiKeys?.zhipu ?? '',
  zhipuPythonPath: 'py',
  displayModels: {
    claude: opts?.displayModels?.claude ?? true,
    deepseek: opts?.displayModels?.deepseek ?? true,
    kimi: opts?.displayModels?.kimi ?? true,
    minimax: opts?.displayModels?.minimax ?? true,
    zhipu: opts?.displayModels?.zhipu ?? true,
  },
},
```

`makeService` の `apiKeys` 型に `zhipu?: string` を追加し、`MultiQuotaService` describe 内にテスト追加:

```typescript
it('ZHIPU_API_KEY 設定時のみ Zhipu が available', () => {
  const svc = makeService({ quotaEnabled: false, providers: ['ZHIPU_API_KEY'] });
  expect(svc.getAvailableIds()).toEqual(['zhipu']);
});

it('settings の zhipu API キー設定時は available になる', () => {
  const svc = makeService({ quotaEnabled: false, apiKeys: { zhipu: 'sk-zhipu' } });
  expect(svc.getAvailableIds()).toEqual(['zhipu']);
});

it('表示OFFの zhipu は available に含まれない', () => {
  const svc = makeService({ quotaEnabled: false, apiKeys: { zhipu: 'sk-zhipu' }, displayModels: { zhipu: false } });
  expect(svc.getAvailableIds()).toEqual([]);
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/service.test.ts
```

Expected: FAIL — zhipu プロバイダが未登録のため `[]` になる。

- [ ] **Step 3: 実装**

`src/features/quota/service.ts`:

1. import 追加:

```typescript
import { createZhipuProvider } from './providers/zhipu';
```

2. `resolveVaultRoot` ヘルパーを export（`testProviderConnection` の近く）:

```typescript
/** Vault ルートを安全に解決（app.vault.adapter.getBasePath → basePath → cwd） */
export function resolveVaultRoot(app: App | undefined): string {
  if (!app) return process.cwd();
  try {
    const adapter = (app.vault?.adapter as { getBasePath?: () => string; basePath?: string } | undefined);
    if (adapter?.getBasePath) return adapter.getBasePath();
    if (adapter?.basePath) return adapter.basePath;
  } catch { /* ignore */ }
  return process.cwd();
}
```

3. コンストラクタで Vault ルートと Python 既定を解決し、智谱を登録:

```typescript
const getEnv = opts.getEnv ?? ((k: string) => process.env[k]);
const cfg = opts.store.load();
const vaultRoot = resolveVaultRoot(opts.app);
const defaultPython = typeof process !== 'undefined' && process.platform === 'win32' ? 'py' : 'python3';
this.providers = [
  createDeepSeekProvider(() => resolveApiKey(cfg.quota?.deepseekApiKey, getEnv, ['DEEPSEEK_API_KEY'])),
  createKimiProvider(() => resolveApiKey(cfg.quota?.kimiApiKey, getEnv, ['KIMI_CODING_API_KEY', 'KIMI_API_KEY'])),
  createMiniMaxProvider(() => resolveApiKey(cfg.quota?.minimaxApiKey, getEnv, ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'])),
  createZhipuProvider({
    getKey: () => resolveApiKey(cfg.quota?.zhipuApiKey, getEnv, ['ZHIPU_API_KEY', 'ZAI_API_KEY']),
    getPythonPath: () => (cfg.quota?.zhipuPythonPath && cfg.quota.zhipuPythonPath.trim() !== '' ? cfg.quota.zhipuPythonPath : defaultPython),
    getVaultRoot: () => vaultRoot,
  }),
].filter((p) => p.isConfigured());
```

4. `getAvailableIds` のデフォルトフラグに zhipu を追加:

```typescript
const flags = cfg.quota?.displayModels ?? { claude: true, deepseek: true, kimi: true, minimax: true, zhipu: true };
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/quota/service.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/features/quota/service.ts tests/features/quota/service.test.ts && git commit -m "feat(quota): register zhipu provider in MultiQuotaService"
```

---

## Task 7: i18n + 設定タブ UI

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/i18n.ts`
- Modify: `D:/AI-Agent/ClaudianBridge/src/settings/SettingTabQuota.ts`

**Interfaces:**
- Consumes: Task 5 の `createZhipuProvider`、Task 6 の `resolveVaultRoot`、Task 3 の設定フィールド
- Produces: 設定タブに「智谱表示 ON/OFF」「ZHIPU API キー入力」「接続テスト」が追加される。

- [ ] **Step 1: i18n に文字列を追加**

`src/core/i18n.ts` の `LocaleStrings` interface に追加:

```typescript
quotaZhipuApiKey: string;
quotaZhipuValue: string;
quotaDisplayZhipu: string;
```

`STRINGS.ja` に追加:

```typescript
quotaZhipuApiKey: 'ZHIPU API キー',
quotaZhipuValue: '5時間使用量',
quotaDisplayZhipu: '智谱を表示',
```

`STRINGS.en` に追加:

```typescript
quotaZhipuApiKey: 'ZHIPU API key',
quotaZhipuValue: '5h usage',
quotaDisplayZhipu: 'Show Zhipu',
```

`STRINGS.zh` に追加:

```typescript
quotaZhipuApiKey: 'ZHIPU API 密钥',
quotaZhipuValue: '5小时用量',
quotaDisplayZhipu: '显示智谱',
```

- [ ] **Step 2: 設定タブに智谱を追加**

`src/settings/SettingTabQuota.ts`:

1. import 追加:

```typescript
import { createZhipuProvider } from '../features/quota/providers/zhipu';
import { resolveVaultRoot } from '../features/quota/service';
import type { ProviderId, ProviderQuota, QuotaProvider } from '../features/quota/types';
```

2. `displayEntries` に追加:

```typescript
['zhipu', s.quotaDisplayZhipu],
```

3. `providerBuilders` を以下に置換（`labelByKey` 関数は削除）:

```typescript
type QuotaApiKeyField = 'deepseekApiKey' | 'kimiApiKey' | 'minimaxApiKey' | 'zhipuApiKey';

const providerBuilders: Array<{
  id: ProviderId;
  apiKey: string;
  apiKeyField: QuotaApiKeyField;
  label: string;
  valueLabel: string;
  build: (k: string) => QuotaProvider;
}> = [
  {
    id: 'deepseek',
    apiKey: quota.deepseekApiKey,
    apiKeyField: 'deepseekApiKey',
    label: s.quotaDeepseekApiKey,
    build: (k) => createDeepSeekProvider(() => k),
    valueLabel: s.quotaDeepseekValue,
  },
  {
    id: 'kimi',
    apiKey: quota.kimiApiKey,
    apiKeyField: 'kimiApiKey',
    label: s.quotaKimiApiKey,
    build: (k) => createKimiProvider(() => k),
    valueLabel: s.quotaKimiValue,
  },
  {
    id: 'minimax',
    apiKey: quota.minimaxApiKey,
    apiKeyField: 'minimaxApiKey',
    label: s.quotaMinimaxApiKey,
    build: (k) => createMiniMaxProvider(() => k),
    valueLabel: s.quotaMinimaxValue,
  },
  {
    id: 'zhipu',
    apiKey: quota.zhipuApiKey,
    apiKeyField: 'zhipuApiKey',
    label: s.quotaZhipuApiKey,
    build: (k) => createZhipuProvider({
      getKey: () => k,
      getPythonPath: () => quota.zhipuPythonPath,
      getVaultRoot: () => resolveVaultRoot(app),
    }),
    valueLabel: s.quotaZhipuValue,
  },
];
```

4. ループ内の `setName(labelByKey(p.id))` → `setName(p.label)` に変更し、`saveKey(...)` を `saveKey(p.apiKeyField, v)` に、ボタン内キー取得を `const key = latest.quota[p.apiKeyField];` に変更。

- [ ] **Step 3: 型チェックで確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npm run typecheck
```

Expected: エラーなし

- [ ] **Step 4: 既存テストが通ることを確認**

```bash
cd /d/AI-Agent/ClaudianBridge && npx vitest run
```

Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge && git add src/core/i18n.ts src/settings/SettingTabQuota.ts && git commit -m "feat(quota): add zhipu i18n strings and settings UI"
```

---

## Task 8: 全体検証

**Files:**
- 検証のみ（コード変更なし）

- [ ] **Step 1: 全テスト実行**

```bash
cd /d/AI-Agent/ClaudianBridge && npm test
```

Expected: 全 PASS

- [ ] **Step 2: 型チェック**

```bash
cd /d/AI-Agent/ClaudianBridge && npm run typecheck
```

Expected: エラーなし

- [ ] **Step 3: 本番ビルド（デプロイ込み・Obsidian 反映）**

> ⚠️ `npm run build` は `scripts/deploy.mjs` 経由で Vault の `.obsidian/plugins/claudian-bridge/` へデプロイする。Obsidian での実機確認を行う場合のみ実行。

```bash
cd /d/AI-Agent/ClaudianBridge && npm run build
```

Expected: esbuild 成功 + デプロイ成功

- [ ] **Step 4: 実機確認（Obsidian）**

- 設定 → LLM 残量 → 表示モデルに「智谱を表示」がある
- ZHIPU API キー + Python パスを設定 → 接続テスト → 5時間使用量 % が表示される
- インジケータに `Zhipu 45%` が表示される

---

## セルフレビュー結果

- ✅ **Spec coverage**: 設計書の全セクション（データソース・アーキテクチャ・設定・エラー処理・テスト）に対応するタスクあり
- ✅ **Placeholder scan**: TBD/TODO なし。全コードブロックは実内容
- ✅ **Type consistency**: `ProviderId` に `'zhipu'`（Task 1）、`QuotaSettings.zhipuApiKey/zhipuPythonPath`（Task 3）、`createZhipuProvider`（Task 5）、`resolveVaultRoot`（Task 6）を一貫して使用
