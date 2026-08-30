# ローカル EdgeTTS エンジン追加 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian Bridge に 4 つ目の TTS エンジン「ローカル EdgeTTS」（`edge-local`）を追加し、edge_tts モジュール場所を設定画面で変更可能にする。

**Architecture:** 同梱 `edge_tts` Python パッケージを直接使う新エンジン `'edge-local'` を追加。Python アダプタを TS 定数として main.js に埋め込み、実行時に `os.tmpdir()` へ書き出して spawn し、audio/mpeg を `<audio>` で再生する。モジュール場所は `tts.edgeTtsModulePath`（既定 `''` = 自動: プラグイン内 `edge_tts` → Python site-packages）で設定可能。

**Tech Stack:** TypeScript 5.7 / vitest 2.1 / esbuild / Obsidian API / Python 3（edge_tts パッケージ同梱）

## Global Constraints

- 既存 `edge`（ClaudeTTS スキル経由）エンジンの挙動は**変更しない**
- デプロイスクリプト・リポジトリ構成は変更しない（Python アダプタは main.js に埋め込み）
- Python インタプリタは既存 edge と同じ `'python'` 固定（`pythonPath` 設定は追加しない）
- i18n キーは **ja / zh / en の 3 言語すべて**に追加する（`i18n.ts` の `zh STRINGS は日本語漢字を含まない` テストに注意）
- 新規ファイル・関数はこのコードベースの既存命名・スタイル（2 スペースインデント・日本語コメント）に従う
- `npm run typecheck`（`tsc -noEmit`）が常にパスすること
- 検証は `npm test`（vitest）と `npm run typecheck`。`npm run build` は**ユーザー確認後にのみ**実行（Vault の実プラグインへデプロイされるため）

---

### Task 1: 設定スキーマ拡張（TtsEngine / edgeTtsModulePath）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts:125`（TtsEngine 型）
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts:445-466`（tts インターフェース）
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts:494-513`（DEFAULT）
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts:598-657`（normalize）
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/settings.ts:757`（validate engine 列挙）
- Test: `D:/AI-Agent/ClaudianBridge/tests/core/settings.test.ts`

**Interfaces:**
- Produces: `TtsEngine = 'edge' | 'webspeech' | 'plachta' | 'edge-local'`。`ClaudianBridgeSettings['tts']` に `edgeTtsModulePath: string` を追加。`normalizeClaudianBridgeSettings` が `edge-local` と `edgeTtsModulePath` を処理し、`validateClaudianBridgeSettings` が検証する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/settings.test.ts` の末尾に追加:

```typescript
describe('tts.edgeTtsModulePath (ローカル EdgeTTS, v0.20.0)', () => {
  it('DEFAULT: edgeTtsModulePath は空文字', () => {
    expect(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.edgeTtsModulePath).toBe('');
  });
  it('normalize: 文字列を保持する', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { edgeTtsModulePath: 'C:\\MyEdgeTts' } });
    expect(n.tts.edgeTtsModulePath).toBe('C:\\MyEdgeTts');
  });
  it('normalize: 欠落・非文字列は空文字', () => {
    expect(normalizeClaudianBridgeSettings({}).tts.edgeTtsModulePath).toBe('');
    expect(normalizeClaudianBridgeSettings({ tts: { edgeTtsModulePath: 42 as unknown as string } }).tts.edgeTtsModulePath).toBe('');
  });
  it('normalize: engine edge-local を許可', () => {
    const n = normalizeClaudianBridgeSettings({ tts: { engine: 'edge-local' } });
    expect(n.tts.engine).toBe('edge-local');
  });
  it('validate: edgeTtsModulePath 非文字列は拒否', () => {
    const ok = normalizeClaudianBridgeSettings({});
    const bad = { ...ok, tts: { ...ok.tts, edgeTtsModulePath: 42 as unknown as string } };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.edgeTtsModulePath');
  });
  it('validate: engine edge-local は許可される', () => {
    const ok = normalizeClaudianBridgeSettings({ tts: { engine: 'edge-local' } });
    expect(validateClaudianBridgeSettings(ok)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts`
Expected: `edgeTtsModulePath` が型に無く FAIL（TS エラー / undefined）

- [ ] **Step 3: 実装**

`src/core/settings.ts`:

1. 125 行目:
```typescript
export type TtsEngine = 'edge' | 'webspeech' | 'plachta' | 'edge-local';
```

2. `tts` インターフェース（`engine: TtsEngine;` の直後）:
```typescript
    /** 次期バージョン: ローカル EdgeTTS の edge_tts モジュール場所（空=自動: プラグイン内 edge_tts → site-packages） */
    edgeTtsModulePath: string;
```

3. `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts`（`engine: 'edge',` の直後）:
```typescript
    edgeTtsModulePath: '',
```

4. `normalize` の `tts` ブロック（`engine:` 三項の直後）:
```typescript
      edgeTtsModulePath: typeof r.tts?.edgeTtsModulePath === 'string' ? r.tts.edgeTtsModulePath : '',
```
かつ `engine:` 三項を 4 択に拡張:
```typescript
      engine: r.tts?.engine === 'webspeech' ? 'webspeech'
            : r.tts?.engine === 'plachta' ? 'plachta'
            : r.tts?.engine === 'edge-local' ? 'edge-local'
            : 'edge',
```

5. `validateClaudianBridgeSettings`:
```typescript
  const engines: readonly TtsEngine[] = ['edge', 'webspeech', 'plachta', 'edge-local'];
```
（`engine` チェックの直後に追加）:
```typescript
  if (typeof cfg.tts.edgeTtsModulePath !== 'string') return 'tts.edgeTtsModulePath は文字列である必要があります';
```

6. **テストヘルパー更新（必須化に伴う型エラー修正）**: `ClaudianBridgeSettings['tts']` に `edgeTtsModulePath` が必須になるため、**フル設定オブジェクトを組み立てているテストヘルパー**に `edgeTtsModulePath: ''` を追加する:
   - `tests/features/tts/speak.test.ts`（`makeCfg` の tts、21-33 行）
   - `tests/features/tts/voice-config-sync.test.ts`（`exportToVoiceConfig` テストの tts、85-90 行・110 行）
   - `tests/features/tts/auto-read.test.ts`（tts、43 行付近）
   - `tests/features/tts/input-ai-read-button.test.ts`（tts、35 行付近）
   - `tests/features/tts/message-read-button.test.ts`（tts、33 行付近）
   - `tests/features/tts/toolbar-buttons.test.ts`（tts、14 行付近）

- [ ] **Step 4: テスト + typecheck が通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/settings.test.ts && npm run typecheck`
Expected: PASS（typecheck でテストヘルパーの型エラーが残っていないこと）

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(tts): add edge-local engine and edgeTtsModulePath setting schema"
```

---

### Task 2: i18n キー追加（3 言語）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/core/i18n.ts`（interface・ja・en・zh）
- Test: `D:/AI-Agent/ClaudianBridge/tests/core/i18n.test.ts`

**Interfaces:**
- Produces: `LocaleStrings` に `ttsEngineEdgeLocal` / `ttsEdgeTtsModulePath` / `ttsEdgeTtsModulePathDesc` / `ttsEdgeTtsModulePathPlaceholder` を追加。`ttsEngineDesc` を 4 択表記に更新。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/i18n.test.ts` に追加:

```typescript
  it('ttsEngineEdgeLocal / ttsEdgeTtsModulePath* キーが 3 言語で非空（v0.20.0）', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const v = getLocaleStrings(lang);
      expect(v.ttsEngineEdgeLocal.length, `${lang}.ttsEngineEdgeLocal empty`).toBeGreaterThan(0);
      expect(v.ttsEdgeTtsModulePath.length, `${lang}.ttsEdgeTtsModulePath empty`).toBeGreaterThan(0);
      expect(v.ttsEdgeTtsModulePathDesc.length, `${lang}.ttsEdgeTtsModulePathDesc empty`).toBeGreaterThan(0);
      expect(v.ttsEdgeTtsModulePathPlaceholder.length, `${lang}.ttsEdgeTtsModulePathPlaceholder empty`).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/i18n.test.ts`
Expected: FAIL（プロパティが無い）

- [ ] **Step 3: 実装**

`src/core/i18n.ts`:

interface（`ttsEnginePlachta: string;` の直後）:
```typescript
  ttsEngineEdgeLocal: string;
  ttsEdgeTtsModulePath: string;
  ttsEdgeTtsModulePathDesc: string;
  ttsEdgeTtsModulePathPlaceholder: string;
```

ja（`ttsEnginePlachta` の直後）:
```typescript
    ttsEngineEdgeLocal: 'ローカル EdgeTTS（同梱モジュール）',
    ttsEdgeTtsModulePath: 'Edge TTS モジュール場所',
    ttsEdgeTtsModulePathDesc: 'edge_tts モジュールのパス。空ならプラグイン内 edge_tts → Python site-packages の順に使用',
    ttsEdgeTtsModulePathPlaceholder: '自動（プラグイン内 edge_tts）',
```
また ja の `ttsEngineDesc` を更新:
```typescript
    ttsEngineDesc: '音声合成エンジンを選択（edge-TTS / WebSpeech / Plachta / ローカル EdgeTTS）',
```

en:
```typescript
    ttsEngineEdgeLocal: 'Local Edge-TTS (bundled module)',
    ttsEdgeTtsModulePath: 'Edge TTS module path',
    ttsEdgeTtsModulePathDesc: 'Path to the edge_tts module. Empty uses plugin edge_tts → Python site-packages',
    ttsEdgeTtsModulePathPlaceholder: 'Auto (plugin edge_tts)',
```
en の `ttsEngineDesc`:
```typescript
    ttsEngineDesc: 'Select the speech synthesis engine (edge-TTS / WebSpeech / Plachta / Local Edge-TTS)',
```

zh:
```typescript
    ttsEngineEdgeLocal: '本地 EdgeTTS（内置模块）',
    ttsEdgeTtsModulePath: 'Edge TTS 模块路径',
    ttsEdgeTtsModulePathDesc: 'edge_tts 模块路径。留空则使用插件内 edge_tts → Python site-packages',
    ttsEdgeTtsModulePathPlaceholder: '自动（插件内 edge_tts）',
```
zh の `ttsEngineDesc`:
```typescript
    ttsEngineDesc: '选择语音合成引擎（edge-TTS / WebSpeech / Plachta / 本地 EdgeTTS）',
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/core/i18n.test.ts`
Expected: PASS（`zh STRINGS は日本語漢字を含まない` もパスすること）

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/core/i18n.ts tests/core/i18n.test.ts
git commit -m "feat(tts): add i18n keys for local edge-tts engine (ja/en/zh)"
```

---

### Task 3: `pickWebSpeechLang` を `lang.ts` へ分離 + `playObjectUrl` 汎用化

**Files:**
- Create: `D:/AI-Agent/ClaudianBridge/src/features/tts/lang.ts`
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/core.ts:139-150`（関数を移設し re-export）
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/plachta-tts.ts:145-181`（`playObjectUrl` に engine 引数）
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/tts/lang.test.ts`（新規）

**Interfaces:**
- Produces: `lang.ts` から `pickWebSpeechLang(text: string): 'zh' | 'ja' | 'en'` を export。`core.ts` が re-export（既存 import は壊れない）。`playObjectUrl(url: string, noticeFn: (m: string) => void, engine: TtsEngine = 'plachta'): Promise<boolean>` に拡張（既定 `'plachta'` で後方互換）。
- Consumes: なし（純関数のみ）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/lang.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { pickWebSpeechLang } from '../../../src/features/tts/lang';

describe('pickWebSpeechLang', () => {
  it('ひらがな主体は ja', () => {
    expect(pickWebSpeechLang('こんにちは、テストです。')).toBe('ja');
  });
  it('漢字主体は zh', () => {
    expect(pickWebSpeechLang('你好，这是一段测试文本。')).toBe('zh');
  });
  it('ラテン主体は en', () => {
    expect(pickWebSpeechLang('Hello, this is a test.')).toBe('en');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/lang.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

`src/features/tts/lang.ts` を作成（core.ts の 139-150 行から移動）:

```typescript
/**
 * v0.20.0: テキスト言語判定。
 * core.ts の pickWebSpeechLang を分離（edge-tts-local と共用のため）。
 */

/** Detect a likely IETF language code for the given text (best-effort). */
export function pickWebSpeechLang(text: string): 'zh' | 'ja' | 'en' {
  const counts = { kana: 0, cjk: 0, latin: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x309f) counts.kana++; // hiragana
    else if (cp >= 0x30a0 && cp <= 0x30ff) counts.kana++; // katakana
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.cjk++; // CJK ideographs
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) counts.latin++;
  }
  if (counts.kana > 0 || counts.cjk > counts.latin) return counts.kana > counts.cjk ? 'ja' : 'zh';
  return 'en';
}
```

`src/features/tts/core.ts`:
- 139-150 行の `pickWebSpeechLang` 本体を削除し、代わりに re-export を追加:

```typescript
export { pickWebSpeechLang } from './lang';
```

`src/features/tts/plachta-tts.ts`:
- import に `TtsEngine` を追加（既存の settings import 行）:
```typescript
import type { PlachtaSettings, PlachtaLanguage, TtsEngine } from '../../core/settings';
```
- `playObjectUrl` のシグネチャ変更（145 行目）:
```typescript
export async function playObjectUrl(
  url: string,
  noticeFn: (m: string) => void,
  engine: TtsEngine = 'plachta',
): Promise<boolean> {
```
- `registerPlayback({ engine: 'plachta', ... })` → `registerPlayback({ engine, ... })`

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/lang.test.ts tests/features/tts/plachta-tts.test.ts tests/features/tts/core.test.ts`
Expected: 全部 PASS（既存 webspeech テストが言語判定の移設後も通る）

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/features/tts/lang.ts src/features/tts/core.ts src/features/tts/plachta-tts.ts tests/features/tts/lang.test.ts
git commit -m "refactor(tts): extract pickWebSpeechLang to lang.ts and parametrize playObjectUrl engine"
```

---

### Task 4: `edge-tts-local.ts` モジュール（音声名解決・パス解決・Python アダプタ・再生）

**Files:**
- Create: `D:/AI-Agent/ClaudianBridge/src/features/tts/edge-tts-local.ts`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/tts/edge-tts-local.test.ts`（新規）

**Interfaces:**
- Consumes: `TtsSettings`（`./core` から **type-only**）、`pickWebSpeechLang`（`./lang`）、`playObjectUrl`（`./plachta-tts`）、`registerPlayback`/`isTtsPlaying`（`./playback-registry`）、`execFileSync`（`child_process`）。
- Produces:
  - `initEdgeTtsLocal(pluginDir: string): void`
  - `resolveEdgeTtsModulePath(configured: string): string`
  - `resolveEdgeVoiceFull(configured: string, lang: 'zh' | 'ja' | 'en'): string`
  - `localEdgeTtsSpeak(text: string, settings: TtsSettings, noticeFn: (m: string) => void): Promise<boolean>`
  - `resetEdgeTtsLocalState(): void`（テスト用）

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/edge-tts-local.test.ts` を作成:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { localEdgeTtsSpeak, resolveEdgeTtsModulePath, resolveEdgeVoiceFull, initEdgeTtsLocal, resetEdgeTtsLocalState } from '../../../src/features/tts/edge-tts-local';
import type { TtsSettings } from '../../../src/features/tts/core';
import { isTtsPlaying, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';

// child_process.spawn: controllable per test.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock, execFileSync: vi.fn() }));

interface StreamHandle { on: ReturnType<typeof vi.fn>; emitData: (d: unknown) => void; }
interface ChildHandle {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stderr: StreamHandle;
  stdout: StreamHandle;
  on: ReturnType<typeof vi.fn>;
  emit: (ev: string, ...args: unknown[]) => void;
  kill: ReturnType<typeof vi.fn>;
  pid?: number;
}
function makeEmitter(): StreamHandle {
  const listeners: Array<(d: unknown) => void> = [];
  return {
    on: vi.fn((_ev: string, fn: (d: unknown) => void) => { listeners.push(fn); }),
    emitData: (d: unknown) => { listeners.forEach((fn) => fn(d)); },
  };
}
function makeChild(): ChildHandle {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: makeEmitter(),
    stdout: makeEmitter(),
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => { (listeners[ev] ??= []).push(fn); return child; }),
    emit(ev: string, ...args: unknown[]) { (listeners[ev] ?? []).forEach((fn) => fn(...args)); },
    kill: vi.fn(),
  } as ChildHandle;
  return child;
}

function makeSettings(): TtsSettings {
  return {
    engine: 'edge-local',
    voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' }, webspeech: { zh: '', ja: '', en: '' } },
  };
}

const origCreateObjectURL = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;

beforeEach(() => {
  spawnMock.mockReset();
  resetPlaybackRegistry();
  initEdgeTtsLocal('C:/plugin');
  // Node には URL.createObjectURL が無いためモックする
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:test');
});

afterEach(() => {
  resetEdgeTtsLocalState();
  if (origCreateObjectURL === undefined) {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  } else {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = origCreateObjectURL;
  }
  delete (globalThis as unknown as { Audio?: unknown }).Audio;
});

describe('resolveEdgeVoiceFull', () => {
  it('短縮名 → フル名', () => {
    expect(resolveEdgeVoiceFull('xiaoxiao', 'zh')).toBe('zh-CN-XiaoxiaoNeural');
    expect(resolveEdgeVoiceFull('nanami', 'ja')).toBe('ja-JP-NanamiNeural');
    expect(resolveEdgeVoiceFull('aria', 'en')).toBe('en-US-AriaNeural');
  });
  it('未知値はそのまま', () => {
    expect(resolveEdgeVoiceFull('zh-CN-YunxiNeural', 'zh')).toBe('zh-CN-YunxiNeural');
  });
  it('空文字は言語の既定', () => {
    expect(resolveEdgeVoiceFull('', 'zh')).toBe('zh-CN-XiaoxiaoNeural');
    expect(resolveEdgeVoiceFull('', 'ja')).toBe('ja-JP-NanamiNeural');
    expect(resolveEdgeVoiceFull('', 'en')).toBe('en-US-AriaNeural');
  });
});

describe('resolveEdgeTtsModulePath', () => {
  it('設定値が最優先', () => {
    expect(resolveEdgeTtsModulePath('C:/MyEdgeTts')).toBe('C:/MyEdgeTts');
  });
  it('空ならプラグイン内 edge_tts', () => {
    expect(resolveEdgeTtsModulePath('')).toBe(path.join('C:/plugin', 'edge_tts'));
  });
  it('プラグインDIR未設定なら空（site-packages）', () => {
    resetEdgeTtsLocalState();
    expect(resolveEdgeTtsModulePath('')).toBe('');
  });
});

describe('localEdgeTtsSpeak', () => {
  it('spawn: python <tmp>/claudian_bridge_edge_tts.py --voice <full> --edge-tts-path <path> + stdin に text', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = localEdgeTtsSpeak('こんにちは', makeSettings(), vi.fn());
    // アダプタが tmp に書き出されている
    const scriptPath = spawnMock.mock.calls[0][1][0] as string;
    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(scriptPath).toContain('claudian_bridge_edge_tts.py');
    expect(spawnMock.mock.calls[0][0]).toBe('python');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[1]).toBe('--voice');
    expect(args[2]).toBe('ja-JP-NanamiNeural'); // かな判定 → ja
    expect(args).toContain('--edge-tts-path');
    expect(args[args.indexOf('--edge-tts-path') + 1]).toBe(path.join('C:/plugin', 'edge_tts'));
    expect(child.stdin.write).toHaveBeenCalledWith('こんにちは');
    child.emit('close', 0); // 再生は Audio 未モックなので playObjectUrl が失敗 → false
    await p;
  });

  it('exit 0 + 音声 → Audio 再生 → true', async () => {
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = localEdgeTtsSpeak('hello', makeSettings(), vi.fn());
    expect(isTtsPlaying()).toBe(true);
    child.stdout.emitData(Buffer.from('MP3DATA'));
    child.emit('close', 0);
    await expect(p).resolves.toBe(true);
    expect(isTtsPlaying()).toBe(false);
  });

  it('exit 1 → false + Notice', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const notice = vi.fn();
    const p = localEdgeTtsSpeak('hello', makeSettings(), notice);
    child.stderr.emitData('boom');
    child.emit('close', 1);
    await expect(p).resolves.toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('ローカル EdgeTTS 失敗'));
  });

  it('設定パスに edge_tts が無い場合は spawn せず Notice', async () => {
    const settings = makeSettings();
    settings.edgeTtsModulePath = 'C:/nonexistent';
    const notice = vi.fn();
    const p = localEdgeTtsSpeak('hello', settings, notice);
    await expect(p).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('指定パスに edge_tts モジュールがありません'));
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/edge-tts-local.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

`src/features/tts/edge-tts-local.ts` を作成:

```typescript
import * as os from 'os';
import * as path from 'path';
import { spawn, execFileSync } from 'child_process';
import type { TtsSettings } from './core';
import { pickWebSpeechLang } from './lang';
import { playObjectUrl } from './plachta-tts';
import { registerPlayback } from './playback-registry';

/**
 * v0.20.0: ローカル EdgeTTS エンジン。
 * プラグイン内（または設定指定）の edge_tts Python モジュールを直接実行し、
 * ClaudeTTS スキル / Pip に依存しない自己完結動作を実現する。
 * 方式 A: Python アダプタを TS 定数として埋め込み、実行時に os.tmpdir() へ書き出して spawn。
 */

/** 短縮名 → Microsoft フル音声名 */
const EDGE_VOICE_FULL: Record<string, string> = {
  xiaoxiao: 'zh-CN-XiaoxiaoNeural', yunxi: 'zh-CN-YunxiNeural', yunyang: 'zh-CN-YunyangNeural',
  yunjian: 'zh-CN-YunjianNeural', xiaoyi: 'zh-CN-XiaoyiNeural', yunxia: 'zh-CN-YunxiaNeural',
  nanami: 'ja-JP-NanamiNeural', keita: 'ja-JP-KeitaNeural',
  aria: 'en-US-AriaNeural', guy: 'en-US-GuyNeural', jenny: 'en-US-JennyNeural',
};

/** 言語別の既定フル音声名 */
const LANG_DEFAULT_VOICE: Record<'zh' | 'ja' | 'en', string> = {
  zh: 'zh-CN-XiaoxiaoNeural',
  ja: 'ja-JP-NanamiNeural',
  en: 'en-US-AriaNeural',
};

/** プラグインDIR（main.ts の onload で initEdgeTtsLocal により設定） */
let edgeTtsPluginDir = '';
let adapterWritten = false;
let adapterPath = '';

export function initEdgeTtsLocal(pluginDir: string): void {
  edgeTtsPluginDir = pluginDir;
}

/** テスト用: モジュール状態を初期化 */
export function resetEdgeTtsLocalState(): void {
  edgeTtsPluginDir = '';
  adapterWritten = false;
  adapterPath = '';
}

/** edge_tts モジュールのパス解決: 設定値 → プラグイン内 edge_tts → ''（site-packages） */
export function resolveEdgeTtsModulePath(configured: string): string {
  const c = configured.trim();
  if (c !== '') return c;
  if (edgeTtsPluginDir !== '') return path.join(edgeTtsPluginDir, 'edge_tts');
  return '';
}

/** 設定値（短縮名またはフル名）をフル音声名に解決する。未知値はそのまま */
export function resolveEdgeVoiceFull(configured: string, lang: 'zh' | 'ja' | 'en'): string {
  if (configured) return EDGE_VOICE_FULL[configured] ?? configured;
  return LANG_DEFAULT_VOICE[lang];
}

/** 埋め込み Python アダプタ（stdin のテキストを edge_tts で合成し audio/mpeg を stdout へ） */
const EDGE_TTS_ADAPTER_PY = `#!/usr/bin/env python3
"""Claudian Bridge \u30ed\u30fc\u30ab\u30eb EdgeTTS \u30a2\u30c0\u30d7\u30bf\uff081\u30ea\u30af\u30a8\u30b9\u30c8=1\u30d7\u30ed\u30bb\u30b9\uff09"""
import argparse
import asyncio
import sys
from pathlib import Path

for _stream in (sys.stdin, sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

def _add_edge_tts_path(path: str):
    """edge_tts \u3092 import \u53ef\u80fd\u306b\u3059\u308b\u3002\u6307\u5b9a\u30d1\u30b9\u304c:
    - edge_tts \u30d1\u30c3\u30b1\u30fc\u30b8\u81ea\u4f53\u306e\u30c7\u30a3\u30ec\u30af\u30c8\u30ea\u2192 \u305d\u306e\u89aa\u3092 sys.path \u306b\u8ffd\u52a0
    - \u89aa\u30c7\u30a3\u30ec\u30af\u30c8\u30ea\uff08edge_tts/ \u3092\u542b\u3080\uff09\u2192 \u305d\u306e\u307e\u307e sys.path \u306b\u8ffd\u52a0
    """
    if not path:
        return
    p = Path(path)
    if (p / "edge_tts" / "__init__.py").exists():
        sys.path.insert(0, str(p))
    elif p.name == "edge_tts" and (p / "__init__.py").exists():
        sys.path.insert(0, str(p.parent))
    else:
        sys.path.insert(0, str(p))

async def _synthesize(text: str, voice: str):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--edge-tts-path", default="")
    args = ap.parse_args()
    _add_edge_tts_path(args.edge_tts_path)
    text = sys.stdin.read()
    try:
        audio = asyncio.run(_synthesize(text, args.voice))
    except Exception as e:
        print(f"[edge-tts-local] error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    sys.stdout.buffer.write(audio)
    sys.stdout.buffer.flush()

if __name__ == "__main__":
    main()
`;

/** アダプタを os.tmpdir() へ書き出す（初回のみ。以後は既存を再利用） */
function ensureAdapter(): string {
  if (adapterWritten) return adapterPath;
  const fs = require('fs') as typeof import('fs');
  adapterPath = path.join(os.tmpdir(), 'claudian_bridge_edge_tts.py');
  fs.writeFileSync(adapterPath, EDGE_TTS_ADAPTER_PY, 'utf-8');
  adapterWritten = true;
  return adapterPath;
}

/** 指定パスに edge_tts パッケージが存在するか（edge_tts 直下 or 親ディレクトリの両対応） */
function pathExistsEdgeTts(dir: string): boolean {
  try {
    const fs = require('fs') as typeof import('fs');
    return fs.existsSync(path.join(dir, '__init__.py'))
        || fs.existsSync(path.join(dir, 'edge_tts', '__init__.py'));
  } catch {
    return false;
  }
}

/** ローカル EdgeTTS で 1 チャンクを合成・再生する */
export function localEdgeTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const lang = pickWebSpeechLang(text);
    const voice = resolveEdgeVoiceFull(settings.voices.edge[lang], lang);
    const configured = (settings.edgeTtsModulePath ?? '').trim();
    const modulePath = resolveEdgeTtsModulePath(configured);

    // 設定パスが明示されているのに edge_tts が無い場合は事前に案内
    if (configured !== '' && !pathExistsEdgeTts(modulePath)) {
      noticeFn(`⚠️ 指定パスに edge_tts モジュールがありません: ${configured}`);
      resolve(false);
      return;
    }

    let scriptPath: string;
    try {
      scriptPath = ensureAdapter();
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 失敗: アダプタ展開エラー ${(e as Error).message}`);
      resolve(false);
      return;
    }

    let child: ReturnType<typeof spawn>;
    try {
      const args = [scriptPath, '--voice', voice];
      if (modulePath !== '') args.push('--edge-tts-path', modulePath);
      child = spawn('python', args, { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }

    const chunks: Buffer[] = [];
    let err = '';
    let settled = false;
    const unregister = registerPlayback({
      engine: 'edge-local',
      stop: () => {
        if (child.pid && process.platform === 'win32') {
          try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 既に終了済み */ }
        }
        try { child.kill(); } catch { /* ignore */ }
      },
    });

    child.stdout?.on('data', (d: Buffer) => chunks.push(d));
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      unregister();
      noticeFn(`⚠️ ローカル EdgeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', async (code) => {
      if (settled) return;
      settled = true;
      unregister();
      if (code !== 0) {
        noticeFn(`⚠️ ローカル EdgeTTS 失敗 (exit ${code}): ${err.trim().slice(0, 200)}`);
        resolve(false);
        return;
      }
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) {
        noticeFn('⚠️ ローカル EdgeTTS 失敗: 音声データが空です');
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
      resolve(await playObjectUrl(url, noticeFn, 'edge-local'));
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}
```

> 注: `pickWebSpeechLang` の戻り値は `'zh' | 'ja' | 'en'` なので `settings.voices.edge[lang]` の添字として安全。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/edge-tts-local.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/features/tts/edge-tts-local.ts tests/features/tts/edge-tts-local.test.ts
git commit -m "feat(tts): add local edge-tts engine with embedded python adapter"
```

---

### Task 5: core.ts / speak.ts 統合（dispatch・チャンク上限・エンジン名）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/core.ts:23-36`（TtsSettings に edgeTtsModulePath?）
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/core.ts:39-44`（voicesFor）
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/core.ts:261-296`（chunk 上限・dispatch・engineLabels）
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/speak.ts:32-40`（toTtsSettings）
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/tts/core.test.ts`

**Interfaces:**
- Consumes: `localEdgeTtsSpeak`（Task 4）、`TtsSettings` に `edgeTtsModulePath?: string`。
- Produces: `addTextToTTS` が `engine === 'edge-local'` で `localEdgeTtsSpeak` を呼ぶ。チャンク上限は edge と同値（既定 500・`chunkMaxChars.edge` を共有）。`voicesFor` が edge-local を `voices.edge` にマップ。

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/core.test.ts` に `makeSettings` ヘルパーの型を拡張し、dispatch テストを追加:

`makeSettings` のシグネチャ（81 行目）を拡張:
```typescript
function makeSettings(engine: 'edge' | 'webspeech' | 'edge-local'): TtsSettings {
```

共有 `beforeEach`（107-113 行目）に `URL.createObjectURL` モックを追加（edge-local 経路が利用するため）:
```typescript
beforeEach(() => {
  spawnMock.mockReset();
  noticeMock.mockClear();
  resetPlaybackRegistry();
  vi.mocked(plachtaSpeakChunksPipelined).mockReset();
  vi.mocked(plachtaSpeakChunksPipelined).mockResolvedValue(true);
  // Node には URL.createObjectURL が無いためモックする（edge-local 経路）
  URL.createObjectURL = vi.fn(() => 'blob:test') as unknown as typeof URL.createObjectURL;
});
```

共有 `afterEach`（145-147 行目）に削除を追加:
```typescript
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
});
```

`addTextToTTS chunking` describe 内に追加:

```typescript
  it('TC-EL01: engine=edge-local → spawn で localEdgeTtsSpeak 経由になる（voice=フル名・edge-tts-path 付き）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const settings = makeSettings('edge-local');
    settings.edgeTtsModulePath = 'C:/MyEdgeTts';
    const p = addTextToTTS(null as never, 'こんにちは', settings);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][0]).toBe('python');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toContain('claudian_bridge_edge_tts.py');
    expect(args[2]).toBe('ja-JP-NanamiNeural'); // かな判定 → ja 音声
    expect(args).toContain('--edge-tts-path');
    expect(args[args.indexOf('--edge-tts-path') + 1]).toBe('C:/MyEdgeTts');
    child.emit('close', 0);
    await p;
  });

  it('TC-EL02: edge-local は 501 文字を chunkMaxChars.edge（既定 500）で分割する', async () => {
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
      pause() {}
    };
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const p = addTextToTTS(null as never, 'a'.repeat(501), makeSettings('edge-local'));
    child.emit('close', 0); // chunk1 完了 → chunk2 spawn
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    child.emit('close', 0); // chunk2 完了
    await p;
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect((child.stdin.write.mock.calls[0][0] as string).length).toBe(500);
  });
```

`tests/features/tts/speak.test.ts` の `speakText` describe 内に追加（toTtsSettings が edgeTtsModulePath を渡すこと）:

```typescript
  it('edgeTtsModulePath を TtsSettings に含めて渡す（v0.20.0）', async () => {
    await speakText('selection', 'テキスト', makeCfg({ edgeTtsModulePath: 'C:/MyEdgeTts' }));
    expect(addTextToTTS.mock.calls[0][2].edgeTtsModulePath).toBe('C:/MyEdgeTts');
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（edge-local が dispatch されず spawn されない）

- [ ] **Step 3: 実装**

`src/features/tts/core.ts`:

1. import 追加（既存 import 行に）:
```typescript
import { localEdgeTtsSpeak } from './edge-tts-local';
```

2. `TtsSettings` interface に追加（`engine: TtsEngine;` の直後）:
```typescript
  /** v0.20.0: ローカル EdgeTTS の edge_tts モジュール場所（空=自動解決） */
  edgeTtsModulePath?: string;
```

3. `voicesFor`（39-44 行目）を edge-local 対応に:
```typescript
export function voicesFor(settings: TtsSettings, lang: 'zh' | 'ja' | 'en'): string {
  const voiceEngine = settings.engine === 'edge-local' ? 'edge' : settings.engine;
  if (voiceEngine === 'plachta') return '';
  return settings.voices[voiceEngine][lang];
}
```

4. `addTextToTTS` 内:
- chunk 既定（261 行目）:
```typescript
  const engineDefault = (settings.engine === 'edge' || settings.engine === 'edge-local') ? DEFAULT_EDGE_CHUNK_MAX_CHARS : DEFAULT_CHUNK_MAX_CHARS;
  const chunkKey = settings.engine === 'edge-local' ? 'edge' : settings.engine;
  const limit = settings.chunkMaxChars?.[chunkKey] ?? engineDefault;
```
- engineLabels（277-281 行目）:
```typescript
  const engineLabels: Record<TtsEngine, string> = {
    edge: 'Edge-TTS',
    webspeech: 'WebSpeech',
    plachta: 'Plachta',
    'edge-local': 'ローカル EdgeTTS',
  };
```
- progress 条件（282 行目）:
```typescript
  const progressMsg = (settings.engine === 'edge' || settings.engine === 'edge-local')
    ? `⏳ [${engineLabels[settings.engine]}] 音声生成中…（読み上げ）`
    : `▶ [${engineLabels[settings.engine]}] 読み上げ中…`;
```
- dispatch（286-291 行目）:
```typescript
  const result = await speakChunks(chunks, async (chunk) => {
    if (settings.engine === 'edge') {
      return claudettsHttpSpeak(chunk, settings, noticeFn);
    }
    if (settings.engine === 'edge-local') {
      return localEdgeTtsSpeak(chunk, settings, noticeFn);
    }
    return webSpeechSpeak(chunk, settings, noticeFn);
  });
```

`src/features/tts/speak.ts` `toTtsSettings`（32-40 行目）:
```typescript
function toTtsSettings(cfg: ClaudianBridgeSettings): TtsSettings {
  return {
    engine: cfg.tts.engine,
    voices: cfg.tts.voices,
    plachta: cfg.tts.plachta,
    cli: cfg.tts.cli,
    chunkMaxChars: cfg.tts.chunkMaxChars,
    edgeTtsModulePath: cfg.tts.edgeTtsModulePath,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/core.test.ts tests/features/tts/speak.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/features/tts/core.ts src/features/tts/speak.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): dispatch edge-local engine in addTextToTTS and pass module path"
```

---

### Task 6: voice-config-sync の engine priority

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/voice-config-sync.ts:22-26`
- Test: `D:/AI-Agent/ClaudianBridge/tests/features/tts/voice-config-sync.test.ts`

**Interfaces:**
- Produces: `ENGINE_PRIORITY['edge-local'] = ['edge-tts', 'pyttsx3', 'system']`（`Record<TtsEngine, string[]>` の型チェックが通る）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/features/tts/voice-config-sync.test.ts` の `exportToVoiceConfig` describe に追加:

```typescript
    it('engine=edge-local は edge-tts 優先で出力する（v0.20.0）', async () => {
      const store = makeStore(tmp);
      store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      const cfg: ClaudianBridgeSettings = {
        ...store.load(),
        tts: { ...store.load().tts, engine: 'edge-local' },
      };
      const sync = new VoiceConfigSync(store, vcPath);
      await sync.exportToVoiceConfig(cfg);
      const written = JSON.parse(fs.readFileSync(vcPath, 'utf-8'));
      expect(written.engine_priority).toEqual(['edge-tts', 'pyttsx3', 'system']);
    });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/voice-config-sync.test.ts`
Expected: FAIL（TS 型エラー: `Record<TtsEngine, string[]>` に `edge-local` キーが無い / engine_priority が undefined）

- [ ] **Step 3: 実装**

`src/features/tts/voice-config-sync.ts`:
```typescript
const ENGINE_PRIORITY: Record<TtsEngine, string[]> = {
  edge: ['edge-tts', 'pyttsx3', 'system'],
  webspeech: ['pyttsx3', 'system'],
  plachta: ['edge-tts', 'pyttsx3', 'system'],
  'edge-local': ['edge-tts', 'pyttsx3', 'system'],
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /d/AI-Agent/ClaudianBridge && npx vitest run tests/features/tts/voice-config-sync.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/features/tts/voice-config-sync.ts tests/features/tts/voice-config-sync.test.ts
git commit -m "feat(tts): map edge-local engine to edge-tts priority in voice-config sync"
```

---

### Task 7: 設定 UI（SettingTabTts.ts）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/settings/SettingTabTts.ts:55-73`（エンジン dropdown）
- Modify: `D:/AI-Agent/ClaudianBridge/src/settings/SettingTabTts.ts:76-131`（音声テーブル・モジュール場所フィールド）

**Interfaces:**
- Consumes: i18n キー（Task 2）、`cfg.tts.edgeTtsModulePath`（Task 1）。
- Produces: エンジン dropdown に「ローカル EdgeTTS」、edge-local 選択時にモジュール場所テキスト欄を表示。音声テーブルは edge-local → `voices.edge` にマップ。

- [ ] **Step 1: 変更を実装する**（UI は単体テスト対象外のため、typecheck で検証）

`src/settings/SettingTabTts.ts`:

1. エンジン dropdown（59-61 行目付近）に追加:
```typescript
        d.addOption('edge', s.ttsEngineEdge);
        d.addOption('webspeech', s.ttsEngineWebspeech);
        d.addOption('plachta', s.ttsEnginePlachta);
        d.addOption('edge-local', s.ttsEngineEdgeLocal);
```

2. エンジン dropdown 直後（73 行目の閉じ括弧の後）にモジュール場所フィールドを追加:
```typescript
    // 2.5 v0.20.0: ローカル EdgeTTS のモジュール場所（edge-local 選択時のみ表示）
    if (cfg.tts.engine === 'edge-local') {
      new Setting(containerEl)
        .setName(s.ttsEdgeTtsModulePath)
        .setDesc(s.ttsEdgeTtsModulePathDesc)
        .addText((t) => t
          .setPlaceholder(s.ttsEdgeTtsModulePathPlaceholder)
          .setValue(cfg.tts.edgeTtsModulePath ?? '')
          .onChange(async (v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, tts: { ...latest.tts, edgeTtsModulePath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            }
          }),
        );
    }
```

3. 音声テーブル表示条件（76 行目）:
```typescript
    if (cfg.tts.engine === 'edge' || cfg.tts.engine === 'webspeech' || cfg.tts.engine === 'edge-local') {
```

4. `currentEngineVoices`（80 行目）を edge-local → edge にマップ:
```typescript
      const voiceEngine = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
      const currentEngineVoices = cfg.tts.voices[voiceEngine];
```

5. 音声保存の engine 型（98 行目）をマップ:
```typescript
                const engine = (latest.tts.engine === 'edge-local' ? 'edge' : latest.tts.engine) as 'edge' | 'webspeech';
```

- [ ] **Step 2: typecheck**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run typecheck`
Expected: PASS（エラーなし）

- [ ] **Step 3: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/settings/SettingTabTts.ts
git commit -m "feat(tts): add edge-local engine option and module path field to settings UI"
```

---

### Task 8: main.ts 初期化 + toolbar マーカー + 全体検証

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge/src/main.ts:53-54`（initEdgeTtsLocal 呼び出し）
- Modify: `D:/AI-Agent/ClaudianBridge/src/features/tts/toolbar-buttons.ts:50`（edge マーカー条件）

- [ ] **Step 1: 変更を実装する**

`src/main.ts`:
- import 追加（`import { VoiceConfigSync } ...` の近く）:
```typescript
import { initEdgeTtsLocal } from './features/tts/edge-tts-local';
```
- `pluginDataDir` 算出直後（54 行目の後）:
```typescript
      initEdgeTtsLocal(pluginDataDir);
```

`src/features/tts/toolbar-buttons.ts`（50 行目）:
```typescript
  if (engine === 'edge' || engine === 'edge-local') {
    btn.classList.add('is-edge-engine');
  }
```

- [ ] **Step 2: typecheck + 全テスト**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run typecheck && npm test`
Expected: typecheck PASS・全テスト PASS（既存 315+ 件と新規 15 件程度）

- [ ] **Step 3: コミット**

```bash
cd /d/AI-Agent/ClaudianBridge
git add src/main.ts src/features/tts/toolbar-buttons.ts
git commit -m "feat(tts): initialize local edge-tts plugin dir and mark edge-local in mute button"
```

---

### Task 9: ビルド + 実機確認（要ユーザー確認）

**Files:**
- 成果物: ビルドされた `main.js` が Vault の `C:\Users\superlambkin\OneDrive\Edge\Obsidian Vault\.obsidian\plugins\claudian-bridge\main.js` へデプロイされる

> ⚠️ `npm run build` は `scripts/deploy.mjs` 経由で**実プラグインの main.js を上書き**します。実行前にユーザー確認を取ること。

- [ ] **Step 1: ユーザーにビルド実行を確認**

- [ ] **Step 2: ビルド + デプロイ**

Run: `cd /d/AI-Agent/ClaudianBridge && npm run build`
Expected: esbuild 成功 → deploy が `main.js` / `manifest.json` 等を Vault へコピー → マーカー検証 OK

- [ ] **Step 3: Obsidian でプラグインをリロード**（hot-reload 有効の場合は自動）

- [ ] **Step 4: 手動確認チェックリスト**

- [ ] 設定 → Claudian Bridge → テキスト読み上げ → エンジン dropdown に「ローカル EdgeTTS（同梱モジュール）」がある
- [ ] edge-local 選択で「Edge TTS モジュール場所」テキスト欄が表示される（placeholder「自動（プラグイン内 edge_tts）」）
- [ ] 空欄のままテスト再生 → プラグイン内 `edge_tts` フォルダで合成され音声再生される
- [ ] モジュール場所を不正なパスに変更 → `⚠️ 指定パスに edge_tts モジュールがありません: <path>` と出て失敗する
- [ ] 既存 `edge`（ClaudeTTS スキル）に切り替えてテスト再生 → 従来どおり動作する（回帰なし）

- [ ] **Step 5: コミット（CHANGELOG 等の更新があれば）**

---

## Self-Review チェックリスト

- [ ] 設計書 §3.1（TtsEngine / edgeTtsModulePath）→ Task 1
- [ ] 設計書 §3.2（モジュールパス解決・initEdgeTtsLocal）→ Task 4・8
- [ ] 設計書 §3.3（エンジン実装・Python アダプタ・再生）→ Task 3・4
- [ ] 設計書 §3.4（core.ts / speak.ts 統合・チャンク上限）→ Task 5
- [ ] 設計書 §3.5（設定 UI・i18n）→ Task 2・7
- [ ] 設計書 §3.6（voice-config-sync / main.ts / toolbar）→ Task 6・8
- [ ] 設計書 §4（エラー処理: パス不正・exit 1・空データ）→ Task 4
- [ ] 設計書 §5（テスト計画 8 項目）→ Task 1-6
- [ ] プレースホルダなし（全 Step に実コードあり）
- [ ] 型整合: `localEdgeTtsSpeak` / `resolveEdgeTtsModulePath` / `resolveEdgeVoiceFull` / `initEdgeTtsLocal` のシグネチャが全タスクで一致

---

*📅 2026-08-17 · MiuMiu 🐾 · 設計書: [[2026-08-17-edge-tts-local-engine-design]]*
