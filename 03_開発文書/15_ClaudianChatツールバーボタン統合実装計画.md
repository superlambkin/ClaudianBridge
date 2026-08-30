# ClaudianChat ツールバーボタン統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudianChat ツールバーに「🔊 ミュート（3状態）」を復活させ、既存「📖 全文読み上げ」ボタンを自動読み上げ範囲設定（`autoRead.scope`）と統一同期させる。全ボタンをアイコン＋テキスト表示に変更し、`store.onSave` / `onPlaybackChange` によるイベント駆動の即時状態同期を実現する。

**Architecture:** エンジン共通の「再生レジストリ」（`playback-registry.ts`）を新設し、edge / webspeech / plachta 各エンジンに停止ハンドルを組み込む。ツールバー注入は `toolbar-buttons.ts` 1本に統合し、ミュートと全文の両ボタンを差し込む。「全文読み上げ」は `withFullTextState()` ヘルパーで `autoRead.scope` と `cli.full_text` を常に同期する。

**Tech Stack:** TypeScript / Obsidian Plugin API / vitest（jsdom はツールバーテストのみ）

**設計書:** [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-15-claudian-chat-toolbar-buttons-design.md|2026-08-15-claudian-chat-toolbar-buttons-design.md]]

## Global Constraints

- リポジトリ: `D:/AI-Agent/ClaudianBridge`（作業ディレクトリ）
- テスト: `npm test`（=`vitest run`）。個別実行は `npx vitest run <path>`
- 型検査: `npm run typecheck`（=`tsc -noEmit`）
- ⚠️ 既知の既存エラー: `src/features/tts/toolbar-fulltext-button.ts` に typecheck エラーが5件あった（Task 8 で削除予定の旧モジュール）。実装開始前に別コミットで修正済み（`fix: repair pre-existing type errors`）なので、typecheck は各タスクでクリーンに通るはず。
- ⚠️ `NodeList` の `for...of` 反復は TS2488 になる（tsconfig `lib` 構成）→ ツールバーボタンの MutationObserver では `Array.from(m.addedNodes)` を使用する
- 既存テストのモック方針を踏襲: `vi.hoisted` + 手作りモック。ツールバー DOM テストのみ `// @vitest-environment jsdom`
- コミットメッセージは `feat:` / `fix:` プレフィックス（日本語説明）
- ファイル名・識別子は既存コードの命名規則（camelCase / kebab-case）に従う
- 不変条件: `tts.autoRead.scope === 'full'` ⟺ `tts.cli.full_text === true`
- 意図的停止（ミュート/停止ボタン）では**エラー Notice を出さず** `false` を返す（チャンクループを中断させる）

---

### Task 1: 全文読み上げ 統一同期ヘルパー（settings.ts）

**Files:**
- Modify: `src/core/settings.ts`（末尾 `validateClaudianBridgeSettings` の後）
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Produces:
  - `withFullTextState(cfg: ClaudianBridgeSettings, fullText: boolean): ClaudianBridgeSettings`
  - `isFullTextState(cfg: ClaudianBridgeSettings): boolean`
  - 不変条件: `withFullTextState(cfg, true)` → `scope='full'` かつ `cli.full_text=true` / `false` → `scope='header'` かつ `full_text=false`

- [ ] **Step 1: 失敗テストを書く**

`tests/core/settings.test.ts` の import を変更:

```typescript
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, DEFAULT_TTS_CLI_SETTINGS, normalizeClaudianBridgeSettings, validateClaudianBridgeSettings, withFullTextState, isFullTextState } from '../../src/core/settings';
```

ファイル末尾に追加:

```typescript
describe('withFullTextState / isFullTextState (v0.12.0)', () => {
  it('fullText=true → scope=full かつ cli.full_text=true', () => {
    const next = withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, true);
    expect(next.tts.autoRead?.scope).toBe('full');
    expect(next.tts.cli?.full_text).toBe(true);
  });

  it('fullText=false → scope=header かつ cli.full_text=false', () => {
    const next = withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, false);
    expect(next.tts.autoRead?.scope).toBe('header');
    expect(next.tts.cli?.full_text).toBe(false);
  });

  it('isFullTextState は autoRead.scope から判定する', () => {
    expect(isFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS)).toBe(false);
    expect(isFullTextState(withFullTextState(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, true))).toBe(true);
  });

  it('元オブジェクトを変更しない（イミュータブル）', () => {
    const cfg = DEFAULT_CLAUDIAN_BRIDGE_SETTINGS;
    withFullTextState(cfg, true);
    expect(cfg.tts.autoRead?.scope).toBe('header');
    expect(cfg.tts.cli?.full_text).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`withFullTextState is not defined`）

- [ ] **Step 3: 実装**

`src/core/settings.ts` の末尾（`validateClaudianBridgeSettings` の閉じ `}` の後）に追加:

```typescript
// === v0.12.0: 全文読み上げ状態の統一同期ヘルパー ===
/**
 * 全文読み上げ状態を autoRead.scope と cli.full_text に同時反映する。
 * 不変条件: scope === 'full' ⟺ full_text === true
 */
export function withFullTextState(cfg: ClaudianBridgeSettings, fullText: boolean): ClaudianBridgeSettings {
  return {
    ...cfg,
    tts: {
      ...cfg.tts,
      autoRead: { ...(cfg.tts.autoRead ?? DEFAULT_TTS_AUTO_READ_SETTINGS), scope: fullText ? 'full' : 'header' },
      cli: { ...(cfg.tts.cli ?? DEFAULT_TTS_CLI_SETTINGS), full_text: fullText },
    },
  };
}

/** 現在の全文読み上げ状態を autoRead.scope から判定 */
export function isFullTextState(cfg: ClaudianBridgeSettings): boolean {
  return (cfg.tts.autoRead?.scope ?? DEFAULT_TTS_AUTO_READ_SETTINGS.scope) === 'full';
}
```

> `ClaudianBridgeSettings` / `DEFAULT_TTS_AUTO_READ_SETTINGS` / `DEFAULT_TTS_CLI_SETTINGS` は同ファイル内で定義済み（型参照は巻き上げられるため末尾配置でOK）。

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): add withFullTextState/isFullTextState unified full-text helpers"
```

---

### Task 2: 再生レジストリ（playback-registry.ts）

**Files:**
- Create: `src/features/tts/playback-registry.ts`
- Test: `tests/features/tts/playback-registry.test.ts`

**Interfaces:**
- Consumes: `TtsEngine` type（`../../core/settings` から import type）
- Produces:
  - `interface TtsPlaybackHandle { engine: TtsEngine; stop: () => void }`
  - `registerPlayback(handle: TtsPlaybackHandle): () => void`（unregister 関数を返す）
  - `isTtsPlaying(): boolean`
  - `stopAllPlayback(): number`（停止したハンドル数）
  - `onPlaybackChange(fn: () => void): () => void`（購読解除関数を返す）
  - `resetPlaybackRegistry(): void`（テスト用）

- [ ] **Step 1: 失敗テストを書く**

Create `tests/features/tts/playback-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerPlayback, isTtsPlaying, stopAllPlayback, onPlaybackChange, resetPlaybackRegistry,
} from '../../../src/features/tts/playback-registry';

beforeEach(() => { resetPlaybackRegistry(); });

describe('playback-registry', () => {
  it('register すると isTtsPlaying が true になり、unregister で false に戻る', () => {
    expect(isTtsPlaying()).toBe(false);
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(isTtsPlaying()).toBe(true);
    unregister();
    expect(isTtsPlaying()).toBe(false);
  });

  it('stopAllPlayback は active ハンドルの stop を呼び、数を返す', () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    registerPlayback({ engine: 'edge', stop: stop1 });
    registerPlayback({ engine: 'plachta', stop: stop2 });
    expect(stopAllPlayback()).toBe(2);
    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).toHaveBeenCalledTimes(1);
  });

  it('onPlaybackChange は register / unregister で呼ばれる', () => {
    const listener = vi.fn();
    const off = onPlaybackChange(listener);
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(listener).toHaveBeenCalledTimes(1);
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    registerPlayback({ engine: 'edge', stop: vi.fn() });
    expect(listener).toHaveBeenCalledTimes(2); // 購読解除後は増えない
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/playback-registry.test.ts`
Expected: FAIL（モジュール不存在）

- [ ] **Step 3: 実装**

Create `src/features/tts/playback-registry.ts`:

```typescript
import type { TtsEngine } from '../../core/settings';

/**
 * v0.12.0: エンジン横断の「再生中ハンドル」レジストリ。
 * ミュートボタンの3状態（再生中検知・停止）の土台。
 * 各エンジンは再生開始時に registerPlayback() し、終了時に unregister する。
 */
export interface TtsPlaybackHandle {
  engine: TtsEngine;
  stop: () => void;
}

const active = new Set<TtsPlaybackHandle>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* listener エラーは無視 */ }
  }
}

export function registerPlayback(handle: TtsPlaybackHandle): () => void {
  active.add(handle);
  notify();
  return () => {
    active.delete(handle);
    notify();
  };
}

export function isTtsPlaying(): boolean {
  return active.size > 0;
}

export function stopAllPlayback(): number {
  const handles = [...active];
  for (const h of handles) {
    try { h.stop(); } catch { /* ベストエフォート */ }
  }
  return handles.length;
}

export function onPlaybackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** テスト用: 全状態をクリア */
export function resetPlaybackRegistry(): void {
  active.clear();
  listeners.clear();
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run tests/features/tts/playback-registry.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/playback-registry.ts tests/features/tts/playback-registry.test.ts
git commit -m "feat(tts): add playback-registry for cross-engine stop/playing detection"
```

---

### Task 3: edge エンジンに停止ハンドルを組み込む

**Files:**
- Modify: `src/features/tts/core.ts`（`claudettsHttpSpeak` 関数）
- Test: `tests/features/tts/core.test.ts`

**Interfaces:**
- Consumes: `registerPlayback` from `./playback-registry`
- Produces: `claudettsHttpSpeak` 実行中はレジストリに edge ハンドルが登録される。`stopAllPlayback()` → `child.kill()` + `intentionalStop` フラグ → close 時に**エラー Notice なしで `resolve(false)`**

- [ ] **Step 1: テストヘルパーに `kill` を追加し、失敗テストを書く**

`tests/features/tts/core.test.ts` を修正:

1) import 追加（先頭付近）:

```typescript
import { isTtsPlaying, stopAllPlayback, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';
```

2) `ChildHandle` interface に `kill` を追加:

```typescript
interface ChildHandle {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stderr: StreamHandle;
  stdout: StreamHandle;
  on: ReturnType<typeof vi.fn>;
  emit: (ev: string, ...args: unknown[]) => void;
  kill: ReturnType<typeof vi.fn>;
}
```

3) `makeChild()` の return オブジェクトに `kill: vi.fn()` を追加:

```typescript
  return {
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: makeEmitter(),
    stdout: makeEmitter(),
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      (listeners[ev] ??= []).push(fn);
      return child;
    }),
    emit(ev: string, ...args: unknown[]) {
      (listeners[ev] ?? []).forEach((fn) => fn(...args));
    },
    kill: vi.fn(),
  } as ChildHandle;
```

4) `beforeEach` に `resetPlaybackRegistry();` を追加:

```typescript
beforeEach(() => {
  spawnMock.mockReset();
  noticeMock.mockClear();
  resetPlaybackRegistry();
  vi.mocked(plachtaSpeakChunksPipelined).mockReset();
  vi.mocked(plachtaSpeakChunksPipelined).mockResolvedValue(true);
});
```

5) `claudettsHttpSpeak` describe 内に失敗テストを追加:

```typescript
  it('stopAllPlayback で child.kill されると false を返しエラー Notice を出さない', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const p = addTextToTTS(null as never, 'hello', makeSettings('edge'));
    expect(isTtsPlaying()).toBe(true);

    stopAllPlayback();
    expect(child.kill).toHaveBeenCalled();

    child.emit('close', 1); // kill による close（非0 exit）
    await expect(p).resolves.toBe(false);
    expect(noticeMock.mock.calls.some((c) => String(c[0]).startsWith('⚠️'))).toBe(false);
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（`child.kill` が呼ばれない / レジストリ未統合で `isTtsPlaying()` が false）

- [ ] **Step 3: 実装**

`src/features/tts/core.ts` の先頭 import に追加:

```typescript
import { registerPlayback } from './playback-registry';
```

`claudettsHttpSpeak` を以下のように修正（spawn 成功直後に register、error/close で unregister、意図的停止でエラー抑制）:

```typescript
export async function claudettsHttpSpeak(text: string, _settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let intentionalStop = false;
    const cmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');
    let child: ReturnType<typeof spawn>;
    console.log('[claudian-bridge TTS] spawning:', { cmd, textLen: text.length, textPreview: text.slice(0, 40) });
    try {
      child = spawn('python', [cmd, 'speak'], { windowsHide: true });
    } catch (e) {
      console.error('[claudian-bridge TTS] spawn threw:', e);
      noticeFn(`⚠️ ClaudeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }
    // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
    const unregister = registerPlayback({
      engine: 'edge',
      stop: () => {
        intentionalStop = true;
        try { child.kill(); } catch { /* ignore */ }
      },
    });
    let err = '';
    let out = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      console.error('[claudian-bridge TTS] spawn error event:', e.message);
      if (settled) return;
      settled = true;
      unregister();
      noticeFn(`⚠️ ClaudeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      console.log('[claudian-bridge TTS] child close:', { code, stderr: err.slice(0, 300), stdout: out.slice(0, 100) });
      if (settled) return;
      settled = true;
      unregister();
      if (intentionalStop) {
        // v0.12.0: ユーザー操作による停止 → エラー扱いしない
        resolve(false);
        return;
      }
      if (code === 0) {
        if (/使い方|usage/i.test(err) || /使い方|usage/i.test(out)) {
          noticeFn('⚠️ ClaudeTTS speak サブコマンド未定義。~/.claude/skills/claude-tts/scripts/commands.py を更新してください');
          resolve(false);
          return;
        }
        resolve(true);
      } else {
        noticeFn(`⚠️ ClaudeTTS 失敗 (exit ${code}): ${err.slice(0, 200)}`);
        resolve(false);
      }
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}
```

- [ ] **Step 4: テスト通過を確認（既存 + 新規）**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: 全 PASS（既存テスト + 意図的停止テスト）

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/core.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): register edge engine in playback-registry with intentional-stop handling"
```

---

### Task 4: webspeech エンジンに停止ハンドルを組み込む

**Files:**
- Modify: `src/features/tts/core.ts`（`webSpeechSpeak` 関数）
- Test: `tests/features/tts/core.test.ts`

**Interfaces:**
- Consumes: `registerPlayback` from `./playback-registry`（Task 3 で import 済み）
- Produces: `webSpeechSpeak` 実行中はレジストリに webspeech ハンドル登録。`stopAllPlayback()` → `synth.cancel()` + `intentionalStop` → onend/onerror で**エラー Notice なしの `settle(false)`**

- [ ] **Step 1: 失敗テストを書く**

`tests/features/tts/core.test.ts` の `describe('webSpeechSpeak (v0.10.0 onend fix)')` 内に追加:

```typescript
  it('stopAllPlayback で synth.cancel されると false を返しエラー Notice を出さない', async () => {
    const { synth } = mockWindowWithSpeech();
    const notice = vi.fn();
    let resolved: boolean | undefined;
    const p = webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice).then((v) => { resolved = v; });

    expect(isTtsPlaying()).toBe(true);
    stopAllPlayback();
    expect(synth.cancel).toHaveBeenCalled();

    // Chrome 挙動: cancel 後に onerror(canceled/interrupted) が発火
    const u = synth.speak.mock.calls[0][0] as { onerror?: (e: unknown) => void };
    u.onerror?.(new Error('canceled'));

    await p;
    expect(resolved).toBe(false);
    expect(notice).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（意図的停止のエラー Notice が出る / `synth.cancel` 未呼び出し）

- [ ] **Step 3: 実装**

`src/features/tts/core.ts` の `webSpeechSpeak` を以下のように修正（Promise executor 内の `u.onend` / `u.onerror` / timeout / catch を差し替え）:

```typescript
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let intentionalStop = false;
      let timeout: ReturnType<typeof setTimeout>;
      let unregister: () => void = () => {};
      const settle = (v: boolean): void => {
        if (settled) return;
        settled = true;
        unregister();
        clearTimeout(timeout);
        resolve(v);
      };
      u.onend = () => settle(intentionalStop ? false : true);
      u.onerror = (e) => {
        if (!intentionalStop) {
          console.error('[WebSpeech error]', e);
          noticeFn('⚠️ Web Speech 再生エラー');
        }
        settle(false);
      };
      // ブラウザによっては onend が発火しない環境があるため 30 秒ガード
      timeout = setTimeout(() => settle(false), 30_000);
      // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
      unregister = registerPlayback({
        engine: 'webspeech',
        stop: () => {
          intentionalStop = true;
          try { synth.cancel(); } catch { /* ignore */ }
        },
      });
      try {
        synth.speak(u as unknown as SpeechSynthesisUtterance);
      } catch (e) {
        noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
        settle(false);
      }
    });
```

> 元の `try { synth.cancel(); } catch { /* ignore */ }`（冒頭の先行キャンセル）は残す（これは「再生開始前の既存音声クリア」用であり、今回の明示停止とは別）。

- [ ] **Step 4: テスト通過を確認（既存 + 新規）**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: 全 PASS（onend fix / onerror / TC-L04 含む）

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/core.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): register webspeech engine in playback-registry with intentional-stop handling"
```

---

### Task 5: plachta エンジンに停止ハンドルを組み込む

**Files:**
- Modify: `src/features/tts/plachta-tts.ts`（`playObjectUrl` 関数）
- Test: `tests/features/tts/plachta-tts.test.ts`

**Interfaces:**
- Consumes: `registerPlayback` from `./playback-registry`
- Produces: `playObjectUrl` 実行中はレジストリに plachta ハンドル登録。`stopAllPlayback()` → `audio.pause()` + `finish(false)`（二重 settle ガード付き）

- [ ] **Step 1: import 追加と失敗テストを書く**

`tests/features/tts/plachta-tts.test.ts` の import に追加:

```typescript
import { playObjectUrl } from '../../../src/features/tts/plachta-tts';
import { isTtsPlaying, stopAllPlayback, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';
```

`beforeEach` に `resetPlaybackRegistry();` を追加:

```typescript
  beforeEach(() => {
    mockFetch.mockReset();
    resetPlaybackRegistry();
  });
```

`describe('plachta-tts')` 内に失敗テストを追加:

```typescript
  it('stopAllPlayback で audio.pause + resolve(false)（エラー Notice なし）', async () => {
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      pause = vi.fn();
      play(): Promise<void> { return Promise.resolve(); } // 再生継続中（onended しない）
    };
    const notice = vi.fn();
    let resolved: boolean | undefined;
    const p = playObjectUrl('blob:mock', notice).then((v) => { resolved = v; });

    expect(isTtsPlaying()).toBe(true);
    stopAllPlayback();

    await p;
    expect(resolved).toBe(false);
    expect(notice).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/plachta-tts.test.ts`
Expected: FAIL（`playObjectUrl` がレジストリ未登録 / stop で未解決）

- [ ] **Step 3: 実装**

`src/features/tts/plachta-tts.ts` の先頭 import に追加:

```typescript
import { registerPlayback } from './playback-registry';
```

`playObjectUrl` を以下のように修正:

```typescript
/**
 * 合成済み blob object URL を再生する。終了時に URL を revoke する。
 * v0.12.0: 再生レジストリへ登録し、stop() で audio.pause + resolve(false) できるようにする。
 */
export async function playObjectUrl(
  url: string,
  noticeFn: (m: string) => void
): Promise<boolean> {
  const audio = new Audio();
  audio.src = url;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let unregister: () => void = () => {};
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      unregister();
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      resolve(ok);
    };
    // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
    unregister = registerPlayback({
      engine: 'plachta',
      stop: () => {
        try { audio.pause(); } catch { /* ignore */ }
        finish(false);
      },
    });
    audio.onended = () => finish(true);
    audio.onerror = () => { noticeFn('⚠️ 再生失敗'); finish(false); };
    audio.play().catch((e) => {
      noticeFn(`⚠️ 再生失敗: ${e.message}`);
      finish(false);
    });
  });
}
```

- [ ] **Step 4: テスト通過を確認（既存 + 新規）**

Run: `npx vitest run tests/features/tts/plachta-tts.test.ts`
Expected: 全 PASS（TC-P01 等の既存テスト含む）

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/plachta-tts.ts tests/features/tts/plachta-tts.test.ts
git commit -m "feat(tts): register plachta audio in playback-registry with pause-stop"
```

---

### Task 6: i18n キー + スタイル追加

**Files:**
- Modify: `src/core/i18n.ts`
- Modify: `styles.css`

**Interfaces:**
- Produces: ボタン表示用 i18n キー `ttsMuteBtnIdle` / `ttsMuteBtnPlaying` / `ttsMuteBtnMuted` / `ttsFullTextBtnOn` / `ttsFullTextBtnOff`（ja/zh/en 全ロケール）
- Produces: `.claude-tts-mute-btn.is-playing` 点滅アニメーション

- [ ] **Step 1: i18n インターフェースにキー追加**

`src/core/i18n.ts` の `LocaleStrings` interface 内、`ttsAutoReadScopeFull: string;`（89行目付近）の直後に追加:

```typescript
  // v0.12.0: ツールバーボタン
  ttsMuteBtnIdle: string;
  ttsMuteBtnPlaying: string;
  ttsMuteBtnMuted: string;
  ttsFullTextBtnOn: string;
  ttsFullTextBtnOff: string;
```

- [ ] **Step 2: 各ロケールに値を追加**

ja ロケール（`ttsAutoReadScopeFull: '📄 メッセージ全文',` 294行目付近の直後）:

```typescript
    ttsMuteBtnIdle: '🔊 ミュート',
    ttsMuteBtnPlaying: '🔊 停止',
    ttsMuteBtnMuted: '🔇 ミュート解除',
    ttsFullTextBtnOn: '📖 全文',
    ttsFullTextBtnOff: '📄 ヘッダー',
```

en ロケール（`ttsAutoReadScopeFull: '📄 Full message',` 497行目付近の直後）:

```typescript
    ttsMuteBtnIdle: '🔊 Mute',
    ttsMuteBtnPlaying: '🔊 Stop',
    ttsMuteBtnMuted: '🔇 Unmute',
    ttsFullTextBtnOn: '📖 Full',
    ttsFullTextBtnOff: '📄 Header',
```

zh ロケール（`ttsAutoReadScopeFull: '📄 全文',` 695行目付近の直後）:

```typescript
    ttsMuteBtnIdle: '🔊 静音',
    ttsMuteBtnPlaying: '🔊 停止',
    ttsMuteBtnMuted: '🔇 取消静音',
    ttsFullTextBtnOn: '📖 全文',
    ttsFullTextBtnOff: '📄 摘要',
```

- [ ] **Step 3: styles.css に点滅アニメーション追加**

`styles.css` 末尾に追加:

```css
/* v0.12.0: ツールバーボタン（ミュート/全文） */
.claude-tts-mute-btn.is-playing {
  animation: cb-tts-blink 1s ease-in-out infinite;
}

@keyframes cb-tts-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.claude-tts-mute-btn,
.claude-tts-fulltext-btn {
  min-width: 5em;
  justify-content: center;
}
```

- [ ] **Step 4: 型検査 + i18n テストで検証**

Run: `npm run typecheck && npx vitest run tests/core/i18n.test.ts`
Expected: 全 PASS（i18n キー整合性テストがある場合も満たす）

- [ ] **Step 5: コミット**

```bash
git add src/core/i18n.ts styles.css
git commit -m "feat(i18n): add toolbar button labels + blink animation styles"
```

---

### Task 7: ツールバー統合モジュール（ミュートボタン）

**Files:**
- Create: `src/features/tts/toolbar-buttons.ts`
- Test: `tests/features/tts/toolbar-buttons.test.ts`

**Interfaces:**
- Consumes: `ConfigStore` / `getLocaleStrings` / `getUILanguage` / `isTtsPlaying` / `stopAllPlayback` / `onPlaybackChange`
- Produces: `setupToolbarButtons(store: ConfigStore): () => void`（cleanup 関数）。`data-cb-mute` 属性でミュートボタンを注入。`computeMuteState(enabled, playing): MuteState` を export（テスト容易性）

- [ ] **Step 1: 失敗テストを書く**

Create `tests/features/tts/toolbar-buttons.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupToolbarButtons } from '../../../src/features/tts/toolbar-buttons';
import { registerPlayback, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';
import type { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
}));

function makeStore(tts: Partial<{ enabled: boolean; scope: 'header' | 'full'; fullText: boolean }> = {}) {
  const state = {
    tts: {
      enabled: tts.enabled ?? true,
      cli: { full_text: tts.fullText ?? false, max_chars: 100, debounce_ms: 2000, speech_filter: {} },
      autoRead: { enabled: true, scope: tts.scope ?? 'header' as const },
    },
  };
  const saves: unknown[] = [];
  const listeners: Array<(c: unknown) => void> = [];
  return {
    store: {
      load: () => state,
      save: (next: unknown) => { Object.assign(state, next); saves.push(next); listeners.forEach((l) => l(next)); },
      onSave: (l: (c: unknown) => void) => { listeners.push(l); },
    } as unknown as ConfigStore,
    saves,
    state,
  };
}

function addToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  document.body.appendChild(toolbar);
  return toolbar;
}

async function waitForBtn(toolbar: HTMLElement, mark: string): Promise<HTMLButtonElement> {
  let btn: Element | null = null;
  await vi.waitFor(() => {
    btn = toolbar.querySelector(mark);
    expect(btn).not.toBeNull();
  });
  return btn as unknown as HTMLButtonElement;
}

describe('setupToolbarButtons (mute)', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => { document.body.innerHTML = ''; resetPlaybackRegistry(); });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('ツールバーにミュートボタンを注入する（有効・非再生 = 🔊）', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    expect(btn.textContent).toContain('ミュート');
    expect(btn.classList.contains('is-muted')).toBe(false);
    expect(btn.classList.contains('is-playing')).toBe(false);
  });

  it('非再生時クリックで tts.enabled=false 保存 → 🔇 表示', async () => {
    const { store, saves } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    btn.click();
    expect(saves).toHaveLength(1);
    expect((saves[0] as { tts: { enabled: boolean } }).tts.enabled).toBe(false);
    expect(btn.textContent).toContain('ミュート解除');
    expect(btn.classList.contains('is-muted')).toBe(true);
  });

  it('ミュート状態クリックで tts.enabled=true 保存 → 🔊 表示', async () => {
    const { store, saves } = makeStore({ enabled: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    expect(btn.classList.contains('is-muted')).toBe(true);
    btn.click();
    expect(saves).toHaveLength(1);
    expect((saves[0] as { tts: { enabled: boolean } }).tts.enabled).toBe(true);
    expect(btn.textContent).toContain('ミュート');
    expect(btn.classList.contains('is-muted')).toBe(false);
  });

  it('再生中は 🔊 停止（点滅）表示になり、クリックで stop のみ（enabled 不変）', async () => {
    const { store, saves } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    await vi.waitFor(() => expect(btn.classList.contains('is-playing')).toBe(true));
    expect(btn.textContent).toContain('停止');
    btn.click();
    expect(saves).toHaveLength(0); // enabled は変更されない
    unregister();
  });

  it('store.onSave で外部変更がボタンへ即時反映される', async () => {
    const { store, state } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    state.tts.enabled = false; // 設定タブ相当の外部変更
    store.save(state as never);
    expect(btn.classList.contains('is-muted')).toBe(true);
  });

  it('二重注入しない / cleanup で削除する', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    await waitForBtn(toolbar, '[data-cb-mute]');
    document.body.appendChild(document.createElement('div'));
    expect(toolbar.querySelectorAll('[data-cb-mute]')).toHaveLength(1);
    cleanup!();
    cleanup = undefined;
    expect(toolbar.querySelector('[data-cb-mute]')).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/toolbar-buttons.test.ts`
Expected: FAIL（モジュール不存在）

- [ ] **Step 3: 実装**

Create `src/features/tts/toolbar-buttons.ts`:

```typescript
/**
 * v0.12.0: Claudian チャット入力ツールバーへの操作ボタン注入。
 * 旧 claude-tts-settings の claudianMuteButton / claudianFullTextButton の後継。
 *
 * ボタン:
 * - ミュート（3状態）: 🔊 ミュート / 🔊 停止（点滅）/ 🔇 ミュート解除
 * - 全文読み上げ: 📖 全文 / 📄 ヘッダー（v0.12.0 で autoRead.scope と統一同期）
 *
 * 状態同期は store.onSave（設定変更）と onPlaybackChange（再生開始/終了）による
 * イベント駆動。旧プラグインの 3 秒ポーリングは不要。
 */
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { isTtsPlaying, stopAllPlayback, onPlaybackChange } from './playback-registry';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const MUTE_MARK = 'data-cb-mute';
const FULLTEXT_MARK = 'data-cb-fulltext';

export type MuteState = 'enabled-idle' | 'enabled-playing' | 'disabled';

export function computeMuteState(enabled: boolean, playing: boolean): MuteState {
  if (!enabled) return 'disabled';
  return playing ? 'enabled-playing' : 'enabled-idle';
}

function renderMute(btn: HTMLButtonElement, state: MuteState): void {
  const s = getLocaleStrings(getUILanguage());
  btn.classList.remove('is-muted', 'is-playing');
  if (state === 'disabled') {
    btn.textContent = s.ttsMuteBtnMuted;
    btn.title = s.ttsMuteBtnMuted;
    btn.classList.add('is-muted');
  } else if (state === 'enabled-playing') {
    btn.textContent = s.ttsMuteBtnPlaying;
    btn.title = s.ttsMuteBtnPlaying;
    btn.classList.add('is-playing');
  } else {
    btn.textContent = s.ttsMuteBtnIdle;
    btn.title = s.ttsMuteBtnIdle;
  }
}

function makeMuteButton(store: ConfigStore, refreshAll: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claude-tts-mute-btn', 'claudian-action-btn');
  btn.setAttribute('aria-label', 'Mute');
  btn.setAttribute(MUTE_MARK, 'true');
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const cfg = store.load();
      const playing = isTtsPlaying();
      if (cfg.tts.enabled && playing) {
        // 再生中 → 停止のみ（enabled は変更しない）
        const n = stopAllPlayback();
        new Notice(n > 0 ? `🔇 再生停止 (${n})` : '🔇 再生停止');
      } else {
        const next = !cfg.tts.enabled;
        store.save({ ...cfg, tts: { ...cfg.tts, enabled: next } });
        if (!next) stopAllPlayback();
        new Notice(next ? '🔊 ミュート解除' : '🔇 ミュート');
      }
    } catch (e) {
      refreshAll();
      new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });

  return btn;
}

export function setupToolbarButtons(store: ConfigStore): () => void {
  const refreshAll = (): void => {
    const cfg = store.load();
    const playing = isTtsPlaying();
    document.querySelectorAll(`[${MUTE_MARK}]`).forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderMute(b, computeMuteState(cfg.tts.enabled, playing));
    });
  };

  // アプリ内の設定変更を即時反映（設定タブ・CLI 同期等の全 save を捕捉）
  store.onSave(refreshAll);
  // 再生開始/終了を即時反映（点滅⇄固定切替）
  const offPlayback = onPlaybackChange(refreshAll);

  const inject = (toolbar: Element): void => {
    if (!toolbar.querySelector(`[${MUTE_MARK}]`)) {
      toolbar.appendChild(makeMuteButton(store, refreshAll));
    }
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      // Array.from 必須: NodeList は for...of だと TS2488 になる（tsconfig lib 構成）
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && (node.matches(TOOLBAR_SELECTOR) || node.querySelector(TOOLBAR_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    offPlayback();
    observer.disconnect();
    document.querySelectorAll(`[${MUTE_MARK}], [${FULLTEXT_MARK}]`).forEach((el) => el.remove());
  };
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run tests/features/tts/toolbar-buttons.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/toolbar-buttons.ts tests/features/tts/toolbar-buttons.test.ts
git commit -m "feat(tts): add unified toolbar-buttons module with 3-state mute button"
```

---

### Task 8: 📖 全文ボタン追加 + main.ts 差し替え + 旧モジュール削除

**Files:**
- Modify: `src/features/tts/toolbar-buttons.ts`（全文ボタン追加）
- Modify: `tests/features/tts/toolbar-buttons.test.ts`（全文テスト追加）
- Delete: `src/features/tts/toolbar-fulltext-button.ts`
- Delete: `tests/features/tts/toolbar-fulltext-button.test.ts`
- Modify: `src/main.ts`（import + 呼び出し差し替え）

**Interfaces:**
- Consumes: `withFullTextState` / `isFullTextState` from `../../core/settings`（Task 1）
- Produces: `data-cb-fulltext` ボタン。クリックで `store.save(withFullTextState(cfg, !isFullTextState(cfg)))`。`inject` がミュート→全文の順で両ボタンを追加

- [ ] **Step 1: 全文テストを追加**

`tests/features/tts/toolbar-buttons.test.ts` に describe ブロックを追加:

```typescript
describe('setupToolbarButtons (fulltext)', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => { document.body.innerHTML = ''; resetPlaybackRegistry(); });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('scope=header → 📄 ヘッダー 表示', async () => {
    const { store } = makeStore({ scope: 'header', fullText: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    expect(btn.textContent).toContain('ヘッダー');
    expect(btn.classList.contains('is-fulltext')).toBe(false);
  });

  it('クリックで autoRead.scope と cli.full_text が同時トグル保存される', async () => {
    const { store, saves } = makeStore({ scope: 'header', fullText: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    btn.click();
    expect(saves).toHaveLength(1);
    const saved = saves[0] as { tts: { autoRead: { scope: string }; cli: { full_text: boolean } } };
    expect(saved.tts.autoRead.scope).toBe('full');
    expect(saved.tts.cli.full_text).toBe(true);
    expect(btn.textContent).toContain('全文');
    expect(btn.classList.contains('is-fulltext')).toBe(true);
  });

  it('再クリックで OFF（scope=header / full_text=false）に戻る', async () => {
    const { store } = makeStore({ scope: 'full', fullText: true });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    btn.click();
    const tts = (store.load() as unknown as { tts: { autoRead: { scope: string }; cli: { full_text: boolean } } }).tts;
    expect(tts.autoRead.scope).toBe('header');
    expect(tts.cli.full_text).toBe(false);
  });

  it('両ボタンが順に注入される（ミュート → 全文）', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const mute = await waitForBtn(toolbar, '[data-cb-mute]');
    const full = await waitForBtn(toolbar, '[data-cb-fulltext]');
    expect(toolbar.querySelectorAll('[data-cb-mute]')).toHaveLength(1);
    expect(toolbar.querySelectorAll('[data-cb-fulltext]')).toHaveLength(1);
    expect(Array.from(toolbar.children).indexOf(mute)).toBeLessThan(Array.from(toolbar.children).indexOf(full));
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/toolbar-buttons.test.ts`
Expected: 全文テストのみ FAIL（`data-cb-fulltext` ボタン未注入）

- [ ] **Step 3: 実装（toolbar-buttons.ts に全文ボタン追加）**

`src/features/tts/toolbar-buttons.ts` の import に追加:

```typescript
import { withFullTextState, isFullTextState } from '../../core/settings';
```

`renderMute` の直後に `renderFullText` と `makeFullTextButton` を追加:

```typescript
function renderFullText(btn: HTMLButtonElement, on: boolean): void {
  const s = getLocaleStrings(getUILanguage());
  if (on) {
    btn.textContent = s.ttsFullTextBtnOn;
    btn.title = s.ttsFullTextBtnOn;
    btn.classList.add('is-fulltext');
  } else {
    btn.textContent = s.ttsFullTextBtnOff;
    btn.title = s.ttsFullTextBtnOff;
    btn.classList.remove('is-fulltext');
  }
}

function makeFullTextButton(store: ConfigStore, _refreshAll: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claude-tts-fulltext-btn', 'claudian-action-btn');
  btn.setAttribute('aria-label', 'Full-text');
  btn.setAttribute(FULLTEXT_MARK, 'true');
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const cfg = store.load();
      const next = !isFullTextState(cfg);
      store.save(withFullTextState(cfg, next));
      renderFullText(btn, next);
      new Notice(next ? '📖 全文読み上げ ON（全文を読み上げます）' : '📄 ヘッダーのみ読み上げ');
    } catch (e) {
      renderFullText(btn, isFullTextState(store.load()));
      new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });

  return btn;
}
```

`refreshAll` 内に全文ボタンの更新を追加:

```typescript
  const refreshAll = (): void => {
    const cfg = store.load();
    const playing = isTtsPlaying();
    document.querySelectorAll(`[${MUTE_MARK}]`).forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderMute(b, computeMuteState(cfg.tts.enabled, playing));
    });
    document.querySelectorAll(`[${FULLTEXT_MARK}]`).forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderFullText(b, isFullTextState(cfg));
    });
  };
```

`inject` を全文ボタン追加に対応:

```typescript
  const inject = (toolbar: Element): void => {
    if (!toolbar.querySelector(`[${MUTE_MARK}]`)) {
      toolbar.appendChild(makeMuteButton(store, refreshAll));
    }
    if (!toolbar.querySelector(`[${FULLTEXT_MARK}]`)) {
      toolbar.appendChild(makeFullTextButton(store, refreshAll));
    }
  };
```

- [ ] **Step 4: main.ts 差し替え + 旧モジュール削除**

`src/main.ts`:

1) import を差し替え:

```typescript
// 旧: import { setupToolbarFullTextButton } from './features/tts/toolbar-fulltext-button';
import { setupToolbarButtons } from './features/tts/toolbar-buttons';
```

2) 呼び出しを差し替え（v0.11.1 コメント付きブロック）:

```typescript
      // ★ v0.12.0: チャット入力ツールバーの操作ボタン（ミュート + 📖 全文読み上げ）
      // （旧 claude-tts-settings の claudianMuteButton / claudianFullTextButton の後継。
      //   📖 ボタンは tts.autoRead.scope と tts.cli.full_text を統一同期）
      this.register(setupToolbarButtons(this.store));
```

3) 旧ファイルを削除:

```bash
git rm src/features/tts/toolbar-fulltext-button.ts tests/features/tts/toolbar-fulltext-button.test.ts
```

- [ ] **Step 5: テスト + 型検査で検証**

Run: `npm run typecheck && npx vitest run tests/features/tts/toolbar-buttons.test.ts`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat(tts): unify fulltext button with autoRead.scope, swap to setupToolbarButtons, drop old module"
```

---

### Task 9: 設定タブの統一同期（SettingTabTts.ts）

**Files:**
- Modify: `src/settings/SettingTabTts.ts`

**Interfaces:**
- Consumes: `withFullTextState` from `../core/settings`（Task 1）
- Produces: 自動読み上げ範囲ドロップダウン / CLI 全文トグルが `withFullTextState` 経由で保存（scope ⟺ full_text 不変条件を維持）

- [ ] **Step 1: import 追加**

`src/settings/SettingTabTts.ts` の import に追加:

```typescript
import { withFullTextState } from '../core/settings';
```

- [ ] **Step 2: 自動読み上げ範囲ドロップダウンを同期化**

現在のコード（`d.onChange((v) => saveAutoRead({ scope: v as 'header' | 'full' }));`）を差し替え:

```typescript
          d.onChange((v) => {
            try {
              // v0.12.0: cli.full_text と統一同期（scope ⟺ full_text）
              store.save(withFullTextState(store.load(), (v as 'header' | 'full') === 'full'));
              draw();
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          });
```

> `saveAutoRead` 自体は `enabled` トグル用に残す（scope のみ直接変更しない）。

- [ ] **Step 3: CLI 全文トグルを同期化**

現在のコード（`saveCli({ full_text: v })` のトグル）を差し替え:

```typescript
      new Setting(cliBox)
        .setName(s.ttsCliFullText)
        .setDesc(s.ttsCliFullTextDesc)
        .addToggle((t) => t.setValue(cfg.tts.cli?.full_text ?? false).onChange((v) => {
          try {
            // v0.12.0: autoRead.scope と統一同期（full_text ⟺ scope）
            store.save(withFullTextState(store.load(), v));
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }));
```

> `saveCli` は max_chars / debounce / speech_filter 用に残す。

- [ ] **Step 4: 全テスト + 型検査で検証**

Run: `npm run typecheck && npm test`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add src/settings/SettingTabTts.ts
git commit -m "feat(settings): keep autoRead.scope and cli.full_text in sync via withFullTextState"
```

---

## 自己レビュー結果（spec 照合）

| 設計書要件 | 対応タスク |
|-----------|-----------|
| 統一「全文読み上げ」状態（scope ⟺ full_text） | Task 1, 8, 9 |
| 再生レジストリ（isTtsPlaying / stopAllPlayback / onPlaybackChange） | Task 2 |
| edge 停止ハンドル（kill + 意図的停止でエラー抑制） | Task 3 |
| webspeech 停止ハンドル（synth.cancel） | Task 4 |
| plachta 停止ハンドル（audio.pause + resolve） | Task 5 |
| アイコン＋テキスト表示 / 点滅アニメーション | Task 6 |
| ミュート3状態ボタン | Task 7 |
| 📖 全文ボタン統一同期 + main.ts 差し替え + 旧モジュール削除 | Task 8 |
| 設定タブ相互反映 | Task 9 |

## 最終確認（Task 9 完了後）

```bash
npm run typecheck
npm test
npm run build   # Obsidian へのデプロイ（deploy.mjs が自動検証）
```

*📅 2026-08-15 · MiuMiu 🐾 · 設計書: 2026-08-15-claudian-chat-toolbar-buttons-design.md に基づく*
