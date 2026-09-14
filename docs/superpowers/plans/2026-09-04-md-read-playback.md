# MD 読み上げ再生制御強化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MD 読み上げの ⏸/⏭ ボタン実働化・見出し＋文末区切りチャンク・Edge 先行音声変換・ハイライト色プルダウン・スクロール位置%設定を実装する。

**Architecture:** `PlaybackController`（新設）が再生中 Audio の pause/resume/skip を司り、`speakChunks` がチャンク境界でそれを消費する。`chunkTextNatural` を TTS 本体とハイライト登録の両方で使用しチャンク一致を維持。Edge 経路は plachta パイプライン同型の先行取得。UI は SettingTabTts に色プルダウン＋スライダー。

**Tech Stack:** TypeScript, Obsidian API, HTMLAudioElement, vitest + jsdom, esbuild（既存ビルド）

**Spec:** `docs/superpowers/specs/2026-09-04-md-read-playback-design.md`

## Global Constraints

- 設定キー: `tts.mdReadHighlight.scrollPositionPct`（number・既定 `40`・0〜100 外は 40 フォールバック）
- チャンク上限は現状維持（edge: `DEFAULT_EDGE_CHUNK_MAX_CHARS`=500 / 他: `DEFAULT_CHUNK_MAX_CHARS`=140）
- `core.ts` と `md-file-read-flow.ts` は同一のチャンク関数を使用し index 完全一致を保つ
- 色プリセット: 黄 `#ffd54f` / 緑 `#a5d6a7` / 水 `#81d4fa` / 桃 `#f48fb1` / 橙 `#ffab91` / 紫 `#ce93d8` / グレー `#cfd8dc` / 既定 `#ffb300`
- i18n は ja/zh/en 3 ロケールすべてに追加
- 既存テスト全件 PASS を維持・TDD で実装・日本語 JSDoc コメント

---

### Task 1: `chunkTextNatural`（見出し強制分割）

**Files:**
- Modify: `src/features/tts/chunking.ts`
- Test: `tests/features/tts/chunking.test.ts`（既存ファイルに追記。無ければ新規）

**Interfaces:**
- Consumes: 既存 `chunkText(text, maxChunkSize, delimiters?)`
- Produces: `chunkTextNatural(text: string, maxChunkSize: number): string[]`（Task 2 が core.ts / md-file-read-flow.ts から利用）

- [ ] **Step 1: 失敗テストを書く**

```typescript
describe('chunkTextNatural (v0.35.0)', () => {
  it('見出し行で強制新チャンク', () => {
    const chunks = chunkTextNatural('# A\n\n本文A。\n# B\n\n本文B。', 100);
    expect(chunks[0].startsWith('# A')).toBe(true);
    expect(chunks[1].startsWith('# B')).toBe(true);
  });

  it('見出しがなく文末で区切れる場合は既存 chunkText と同一結果', () => {
    const text = 'あ'.repeat(300) + '。' + 'い'.repeat(300) + '。';
    expect(chunkTextNatural(text, 400)).toEqual(chunkText(text, 400));
  });

  it('見出し内の長文は途中分割にフォールバック', () => {
    const chunks = chunkTextNatural('# ' + 'あ'.repeat(300), 100);
    expect(chunks.every((c) => c.length <= 100 || c.length < 300)).toBe(true);
    expect(chunks.join('').replace(/\n/g, '')).toContain('あ'.repeat(300));
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/chunking.test.ts`
Expected: FAIL（`chunkTextNatural` 未定義）

- [ ] **Step 3: 最小実装（chunking.ts に追記）**

```typescript
/** 見出し行（markdown heading） */
const HEADING_LINE_RE = /(^|\n)(\s{0,3}#{1,6}\s+[^\n]*)/g;

/**
 * v0.35.0: 見出し行で強制新チャンクし、各セクションを既存 chunkText で
 * 文末（。！？\n 等）優先パックする。core.ts と md-file-read-flow.ts の
 * 両方から使用することでハイライト index の完全一致を維持する。
 */
export function chunkTextNatural(text: string, maxChunkSize: number): string[] {
  // 見出しの直前で分割（見出し行は次セクションの先頭に付ける）
  const sections: string[] = [];
  let last = 0;
  for (const m of text.matchAll(HEADING_LINE_RE)) {
    const at = m.index! + m[1].length;
    if (at > last) sections.push(text.slice(last, at));
    last = at;
  }
  if (sections.length === 0) return chunkText(text, maxChunkSize);
  sections.push(text.slice(last));
  const out: string[] = [];
  for (const s of sections) {
    const trimmed = s.replace(/^\n+|\n+$/g, '');
    if (trimmed) out.push(...chunkText(trimmed, maxChunkSize));
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/chunking.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/chunking.ts tests/features/tts/chunking.test.ts
git commit -m "feat(tts): chunkTextNatural 見出し強制分割チャンク追加"
```

---

### Task 2: TTS 本体・ハイライト登録を `chunkTextNatural` に切替

**Files:**
- Modify: `src/features/tts/core.ts`（`const chunks = ... chunkText(...)` の 1 行）
- Modify: `src/features/tts/md-file-read-flow.ts`（`chunkText(optimized, chunkMax)` の 1 行）
- Test: `tests/features/tts/core.test.ts` 追記

**Interfaces:**
- Consumes: Task 1 の `chunkTextNatural`
- Produces: なし（振る舞い変更のみ）

- [ ] **Step 1: 失敗テストを書く（core.test.ts に追記）**

```typescript
it('v0.35.0: 見出しをまたぐテキストは見出し直前でチャンクが分かれる', async () => {
  await addTextToTTS(null as never, '前文。\n# 見出し\n後文。', makeSettings('webspeech'));
  const chunks = vi.mocked(speakChunksMock ?? { mock: { calls: [] } }).mock.calls; // 既存モック方式に合わせる
  // webspeech 経路の 1 チャンク目に「見出し」を含まないこと（見出しで強制分割）
  const registered = (globalThis as never as { __lastChunks?: string[] }).__lastChunks;
  // ※ 既存テストのチャンク取得方法（plachtaSpeakChunksPipelined mock 等）に合わせて検証する
  expect(Array.isArray(registered ?? [])).toBe(true);
});
```

※ 実装時は既存 `TC-L01`（plachta 1001 文字 → 8 チャンク）テストと同一のモック取得パターンを使い、`addTextToTTS` → `plachtaSpeakChunksPipelined` mock.calls[0][0] のチャンク配列が「見出し直前で分割」されていることを検証する形に書き換えること。上記コードは骨格のみ。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（現行は文字数パックのみで見出し分割されない）

- [ ] **Step 3: 最小実装**

`core.ts`（チャンク生成行・268 行目付近）:
```typescript
const chunks = limit > 0 && trimmed.length > limit ? chunkTextNatural(trimmed, limit) : [trimmed];
```
import を `chunkText` に加えて `chunkTextNatural` も追加。

`md-file-read-flow.ts`（72 行目付近）:
```typescript
const ttsChunks = chunkMax > 0 && optimized.length > chunkMax
  ? chunkTextNatural(optimized, chunkMax)
  : [optimized];
```
import 同様に `chunkTextNatural` を追加。

- [ ] **Step 4: 既存テスト全件が通ることを確認（TC-L01 の 8 チャンク等は見出し無しテキストなので結果不変）**

Run: `npx vitest run tests/features/tts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/core.ts src/features/tts/md-file-read-flow.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): TTS 本体・ハイライト登録を chunkTextNatural に統一"
```

---

### Task 3: `PlaybackController` ＋ `playObjectUrl` pause/resume 登録

**Files:**
- Create: `src/features/tts/playback-controller.ts`
- Modify: `src/features/tts/playback-registry.ts`（`TtsPlaybackHandle` に `pause?` / `resume?` を追加）
- Modify: `src/features/tts/plachta-tts.ts`（`playObjectUrl` の registerPlayback に pause/resume を登録）
- Test: `tests/features/tts/playback-controller.test.ts`

**Interfaces:**
- Consumes: `playback-registry.ts` の `registerPlayback` / `TtsPlaybackHandle`
- Produces: `getPlaybackController(): PlaybackController`（シングルトン）。`PlaybackController` は `togglePause(): boolean`（true=一時停止中）/ `skipNext(): void` / `stop(): void` / `onChunkBoundary(): Promise<'continue' | 'stop'>` / `bindAudio(h: { pause(): void; resume(): void }): void` / `reset(): void`。Task 4（speakChunks・prefetch）と Task 5（overlay）が利用

- [ ] **Step 1: 失敗テストを書く**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPlaybackController } from '../../../src/features/tts/playback-controller';

function fakeAudio() {
  return {
    pause: vi.fn(),
    resume: vi.fn(), // play() のエイリアスとして resume を使う
    play: vi.fn(),
  };
}

describe('PlaybackController (v0.35.0)', () => {
  beforeEach(() => getPlaybackController().reset());

  it('togglePause: bind 中の audio を pause / resume する', () => {
    const pc = getPlaybackController();
    const a = fakeAudio();
    pc.bindAudio({ pause: a.pause, resume: a.play });
    expect(pc.togglePause()).toBe(true);
    expect(a.pause).toHaveBeenCalled();
    expect(pc.togglePause()).toBe(false);
    expect(a.play).toHaveBeenCalled();
  });

  it('skipNext: onChunkBoundary が stop を返し、フラグは消費される', async () => {
    const pc = getPlaybackController();
    pc.skipNext();
    await expect(pc.onChunkBoundary()).resolves.toBe('stop');
    await expect(pc.onChunkBoundary()).resolves.toBe('continue');
  });

  it('一時停止中は onChunkBoundary が再開まで待つ', async () => {
    const pc = getPlaybackController();
    pc.bindAudio({ pause: vi.fn(), resume: vi.fn() });
    pc.togglePause();
    let released = false;
    const p = pc.onChunkBoundary().then((r) => { released = true; return r; });
    await vi.waitFor(() => expect(released).toBe(false));
    pc.togglePause(); // 再開
    await expect(p).resolves.toBe('continue');
  });

  it('reset: 全状態クリア', () => {
    const pc = getPlaybackController();
    pc.bindAudio({ pause: vi.fn(), resume: vi.fn() });
    pc.skipNext();
    pc.reset();
    expect(pc.togglePause()).toBe(false); // bind 解放済み → 何も起きない
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/playback-controller.test.ts`
Expected: FAIL（モジュール未定義）

- [ ] **Step 3: 最小実装**

```typescript
/**
 * v0.35.0: MD 読み上げの再生制御（一時停止/再開/スキップ）を司るシングルトン。
 * playObjectUrl が再生開始時に bindAudio() し、speakChunks ループが
 * チャンク境界で onChunkBoundary() を await する。
 */
type AudioHandles = { pause(): void; resume(): void };

class PlaybackController {
  private audio: AudioHandles | null = null;
  private paused = false;
  private skipRequested = false;
  private resolvers: Array<() => void> = [];

  /** 再生開始時に playObjectUrl から呼ばれる */
  bindAudio(h: AudioHandles): void { this.audio = h; }

  /** ⏸/▶: 一時停止⇔再開。true = 一時停止中になった */
  togglePause(): boolean {
    if (!this.audio) return this.paused;
    this.paused = !this.paused;
    if (this.paused) this.audio.pause(); else this.audio.resume();
    return this.paused;
  }

  /** ⏭: 現チャンクを打ち切り次チャンクへ */
  skipNext(): void {
    this.skipRequested = true;
    // 再生中 audio を即中断（speakChunks は false を受け取りループ継続判断）
    this.audio?.pause();
    this.releaseAll();
  }

  /** 🔇: 全停止 */
  stop(): void {
    this.skipRequested = true;
    this.audio?.pause();
    this.releaseAll();
  }

  /** チャンク境界で speakChunks から呼ぶ。一時停止中は再開まで待機 */
  async onChunkBoundary(): Promise<'continue' | 'stop'> {
    while (this.paused && !this.skipRequested) {
      await new Promise<void>((r) => this.resolvers.push(r));
    }
    if (this.skipRequested) { this.skipRequested = false; return 'stop'; }
    return 'continue';
  }

  reset(): void {
    this.audio = null;
    this.paused = false;
    this.skipRequested = false;
    this.releaseAll();
  }

  private releaseAll(): void {
    const rs = this.resolvers; this.resolvers = [];
    rs.forEach((r) => r());
  }
}

const controller = new PlaybackController();
export function getPlaybackController(): PlaybackController { return controller; }
```

`playback-registry.ts` の `TtsPlaybackHandle` に追加:
```typescript
  /** v0.35.0: 一時停止（任意・PlaybackController 用） */
  pause?: () => void;
  /** v0.35.0: 再開（任意） */
  resume?: () => void;
```

`plachta-tts.ts` の `playObjectUrl`（registerPlayback 呼び出し・164 行目付近）を変更:
```typescript
      unregister = registerPlayback({
        engine,
        stop: () => {
          try { audio.pause(); } catch { /* ignore */ }
          finish(false);
        },
        // v0.35.0: 一時停止/再開ハンドル（PlaybackController 用）
        pause: () => { try { audio.pause(); } catch { /* ignore */ } },
        resume: () => { void audio.play().catch(() => { /* ignore */ }); },
      });
      // v0.35.0: 再生開始時に controller へバインド
      getPlaybackController().bindAudio({
        pause: () => { try { audio.pause(); } catch { /* ignore */ } },
        resume: () => { void audio.play().catch(() => { /* ignore */ }); },
      });
```
import に `import { getPlaybackController } from './playback-controller';` を追加。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/playback-controller.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/playback-controller.ts src/features/tts/playback-registry.ts src/features/tts/plachta-tts.ts tests/features/tts/playback-controller.test.ts
git commit -m "feat(tts): PlaybackController と playObjectUrl pause/resume 登録"
```

---

### Task 4: `speakChunks` への制御統合 ＋ Edge 先行変換

**Files:**
- Modify: `src/features/tts/chunking.ts`（`speakChunks`）
- Modify: `src/features/tts/core.ts`（Edge 経路を先行取得パイプライン化）
- Test: `tests/features/tts/chunking.test.ts` / `tests/features/tts/core.test.ts` 追記

**Interfaces:**
- Consumes: Task 3 の `getPlaybackController`
- Produces: `speakChunks(chunks, speakFn, onCancel?, onChunkStart?)` はシグネチャ不変（内部で controller 参照）

- [ ] **Step 1: 失敗テストを書く**

`chunking.test.ts`:
```typescript
it('speakChunks: skip 要求で現チャンクを打ち切り次へ進む', async () => {
  const pc = getPlaybackController();
  const spoken: number[] = [];
  const p = speakChunks(['a', 'b', 'c'], async (t) => { spoken.push(t.length); return true; });
  // 1 チャンク目開始後に skip
  await vi.waitFor(() => expect(spoken.length).toBe(1));
  pc.skipNext();
  await expect(p).resolves.toBe(true);
  expect(spoken.length).toBeGreaterThanOrEqual(2); // b, c が続行
});
```

`core.test.ts`（Edge 先行変換）:
```typescript
it('v0.35.0: Edge 経路で前チャンク再生中に次チャンクの fetch が先行する', async () => {
  // 既存の edgeCloud fetch モック方式を踏襲。fetch 呼び出しのタイムスタンプを記録し、
  // チャンク 1 の fetch がチャンク 0 の再生完了より前に呼ばれることを検証する。
});
```
※ 既存 `edgeCloudHttpSpeak` のテストモック（fetch / playObjectUrl）パターンを `tests/features/tts/core.test.ts` 内から確認し、同一方式で「fetch 順序」を検証する形に完成させること。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/chunking.test.ts tests/features/tts/core.test.ts`
Expected: FAIL（skip で打ち切られない / fetch が直列）

- [ ] **Step 3: 最小実装**

`chunking.ts` の `speakChunks` ループを変更:
```typescript
export async function speakChunks(
  chunks: string[],
  speakFn: (text: string) => Promise<boolean>,
  onCancel?: () => boolean,
  onChunkStart?: (idx: number) => void,
): Promise<boolean> {
  const pc = getPlaybackController();
  for (let i = 0; i < chunks.length; i++) {
    if (onCancel?.()) return false;
    // v0.35.0: チャンク境界で一時停止/スキップ要求を処理
    const verdict = await pc.onChunkBoundary();
    if (verdict === 'stop') { i -= 1; continue; } // 同一 index をやり直し（スキップ後は次周回で idx+1）
    onChunkStart?.(i);
    const ok = await speakFn(chunks[i]);
    if (!ok) {
      // スキップによる中断なら false を打ち消して次チャンクへ
      if (await pc.onChunkBoundary() === 'stop') { i += 0; continue; }
      return false;
    }
  }
  return true;
}
```
※ 上記の index 制御は実装時にテスト（skip → b,c 続行）を通るよう整理すること。skip で `speakFn` が false を返した場合は「次のチャンクへ進む」が正動作。シンプル版:
```typescript
    const ok = await speakFn(chunks[i]);
    if (!ok) {
      if (pc.consumeSkip()) continue; // スキップ要求による中断 → 次チャンクへ
      return false;
    }
```
（`PlaybackController` に `consumeSkip(): boolean` を追加し、`onChunkBoundary` は一時停止待ちのみに専念させる方が明快。テストの期待（skip 後 b,c 続行）を満たす形で最終化すること。）

`core.ts` の Edge 経路（303 行目付近の `speakChunks(chunks, async (chunk) => {...})`）を先行取得パイプラインへ:
```typescript
  // v0.35.0: Edge 先行変換（plachta パイプラインと同型）
  if (settings.engine === 'edge' || settings.engine === 'edge-local') {
    let pending: Promise<string | null> | null = null;
    const speakWithPrefetch = async (text: string, idx: number): Promise<boolean> => {
      // 現チャンクの音声 URL は前チャンク再生中に取得済みのはず
      let url: string | null = null;
      if (pending) { url = await pending; pending = null; }
      if (url === null) {
        const blob = await fetchEdgeBlob(text, settings, noticeFn, readLang);
        if (blob === null) return false;
        url = URL.createObjectURL(blob);
      }
      // 次チャンクを先行取得
      if (idx + 1 < chunks.length) {
        pending = fetchEdgeBlob(chunks[idx + 1], settings, noticeFn, readLang)
          .then((b) => (b ? URL.createObjectURL(b) : null));
      }
      return await playObjectUrl(url, noticeFn, 'edge');
    };
    // fetchEdgeBlob: edgeCloudHttpSpeak から fetch〜blob 部分を抽出したヘルパ（core.ts 内 private）
  }
```
※ `edgeCloudHttpSpeak` から「fetch → blob 取得」部分を `fetchEdgeBlob(text, settings, noticeFn, lang): Promise<Blob | null>` として切り出すリファクタを含む。既存 `edgeCloudHttpSpeak` は `fetchEdgeBlob + playObjectUrl` の合成として振る舞いを維持する（既存テストが通ること）。

- [ ] **Step 4: テストが通ること・既存 TTS テスト全件 PASS**

Run: `npx vitest run tests/features/tts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/chunking.ts src/features/tts/core.ts tests/features/tts/chunking.test.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): speakChunks にスキップ/一時停止統合・Edge 先行音声変換"
```

---

### Task 5: overlay ボタンの実働配線

**Files:**
- Modify: `src/features/tts/md-read-highlight/setup.ts`（overlay ハンドラ）
- Modify: `src/features/tts/md-read-highlight/floating-overlay.ts`（⏸/▶ アイコン切替）
- Test: `tests/features/tts/md-read-highlight/floating-overlay.test.ts` 追記

**Interfaces:**
- Consumes: Task 3 の `getPlaybackController`
- Produces: `mountOverlay` の cleanup は不変

- [ ] **Step 1: 失敗テストを書く**

```typescript
it('⏸ クリックで controller.togglePause が呼ばれアイコンが ▶ に変わる', async () => {
  const cleanup = mountOverlay({} as never, {
    onPause: () => { /* 実装上は controller 経由 */ },
    onResume: () => {},
    onSkip: () => {},
    onMute: () => {},
  });
  const btn = document.querySelector('[data-cb-md-read-pause]') as HTMLElement;
  btn.click();
  // v0.35.0: テキストが ⏸ ⇄ ▶ で切替する
  // ※ mountOverlay 内で controller を参照する実装に合わせ検証
  cleanup();
});
```
※ 実装方針: `mountOverlay` 内でクリック時に `getPlaybackController().togglePause()` を呼び、戻り値（true=一時停止中）で `btn.textContent = '▶' / '⏸'` を設定する。ハンドラ `onPause`/`onResume` は state 同期用として維持。テストは togglePause のモック（`vi.mock('../src/features/tts/playback-controller')`）で検証する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/md-read-highlight/floating-overlay.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小実装**

`floating-overlay.ts`:
```typescript
import { getPlaybackController } from '../../tts/playback-controller';

  pauseBtn.addEventListener('click', () => {
    const paused = getPlaybackController().togglePause();
    pauseBtn.textContent = paused ? '▶' : '⏸';
    if (paused) handlers.onPause(); else handlers.onResume();
  });
  skipBtn.addEventListener('click', () => {
    getPlaybackController().skipNext();
    handlers.onSkip();
  });
```

`setup.ts` の overlay mount 時に controller をリセット（読み上げ開始ごとに初期状態）:
```typescript
  getPlaybackController().reset();
```

- [ ] **Step 4: テストが通ること・既存 overlay テスト PASS**

Run: `npx vitest run tests/features/tts/md-read-highlight`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/md-read-highlight/setup.ts src/features/tts/md-read-highlight/floating-overlay.ts tests/features/tts/md-read-highlight/floating-overlay.test.ts
git commit -m "feat(tts): overlay ⏸/⏭ ボタンを PlaybackController に実働配線"
```

---

### Task 6: 設定追加（scrollPositionPct ＋ 色プルダウン）

**Files:**
- Modify: `src/core/settings.ts`（`MdReadHighlightSettings` 型・DEFAULT・normalize・validate に `scrollPositionPct: number`（既定 40）追加）
- Modify: `src/settings/SettingTabTts.ts`（ハイライト色欄にプルダウン追加・スライダー追加）
- Modify: `src/core/i18n.ts`（ja/zh/en）
- Test: `tests/core/settings.test.ts` / `tests/settings/SettingTabTts.test.ts` 追記

**Interfaces:**
- Produces: `cfg.tts.mdReadHighlight.scrollPositionPct: number`（Task 7 が使用）

- [ ] **Step 1: 失敗テスト**

`settings.test.ts`:
```typescript
describe('mdReadHighlight.scrollPositionPct', () => {
  it('既定は 40', () => {
    expect(normalizeClaudianBridgeSettings({}).tts.mdReadHighlight.scrollPositionPct).toBe(40);
  });
  it('0〜100 外は 40 にフォールバック', () => {
    expect(normalizeClaudianBridgeSettings({ tts: { mdReadHighlight: { scrollPositionPct: 200 } } }).tts.mdReadHighlight.scrollPositionPct).toBe(40);
    expect(normalizeClaudianBridgeSettings({ tts: { mdReadHighlight: { scrollPositionPct: -1 } } }).tts.mdReadHighlight.scrollPositionPct).toBe(40);
  });
  it('設定値は尊重される', () => {
    expect(normalizeClaudianBridgeSettings({ tts: { mdReadHighlight: { scrollPositionPct: 70 } } }).tts.mdReadHighlight.scrollPositionPct).toBe(70);
  });
});
```
※ 既存 `mdReadHighlight` の normalize 実装（settings.ts 790 行目付近）と同一パターンで。既存テストの mdReadHighlight 用 fixture があればそれに追記する形に調整。

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小実装**

`settings.ts`（`MdReadHighlightSettings` 型・既定・normalize に追加）:
```typescript
  /** v0.35.0: ハイライトの画面上スクロール位置（%・0=最上部 〜 100=最下部） */
  scrollPositionPct: number;
```
既定 `40`。normalize:
```typescript
scrollPositionPct: typeof rawHighlight.scrollPositionPct === 'number' &&
  rawHighlight.scrollPositionPct >= 0 && rawHighlight.scrollPositionPct <= 100
  ? rawHighlight.scrollPositionPct : 40,
```

`i18n.ts`（ja 例・zh/en も同様）:
```typescript
mdReadScrollPosition: '📍 自動スクロール位置',
mdReadScrollPositionDesc: '読み上げ中のハイライトを画面上から何%の位置に表示するか（0=最上部 〜 100=最下部）',
mdReadColorPreset: '🎨 ハイライト色（プリセット）',
mdReadColorPresetDesc: '定番色から選ぶと色コードへ自動反映します',
```

`SettingTabTts.ts`（ハイライト色テキスト入力欄の直前に追加）:
```typescript
// v0.35.0: ハイライト色プリセットプルダウン
const COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: s.mdReadColorDefault, value: '#ffb300' },
  { label: s.mdReadColorYellow, value: '#ffd54f' },
  { label: s.mdReadColorGreen, value: '#a5d6a7' },
  { label: s.mdReadColorBlue, value: '#81d4fa' },
  { label: s.mdReadColorPink, value: '#f48fb1' },
  { label: s.mdReadColorOrange, value: '#ffab91' },
  { label: s.mdReadColorPurple, value: '#ce93d8' },
  { label: s.mdReadColorGray, value: '#cfd8dc' },
];
new Setting(containerEl)
  .setName(s.mdReadColorPreset)
  .setDesc(s.mdReadColorPresetDesc)
  .addDropdown((d) => {
    COLOR_PRESETS.forEach((p) => d.addOption(p.value, p.label));
    d.setValue(cfg.tts.mdReadHighlight?.highlightColor || '#ffb300')
      .onChange(async (v) => {
        const latest = store.load();
        store.save({ ...latest, tts: { ...latest.tts, mdReadHighlight: { ...(latest.tts.mdReadHighlight ?? { enabled: true, highlightColor: '' }), highlightColor: v } } });
        new Notice(s.noticeSaved);
      });
  });

// v0.35.0: 自動スクロール位置スライダー
new Setting(containerEl)
  .setName(s.mdReadScrollPosition)
  .setDesc(s.mdReadScrollPositionDesc)
  .addSlider((sl) => sl
    .setLimits(0, 100, 5)
    .setValue(cfg.tts.mdReadHighlight?.scrollPositionPct ?? 40)
    .setDynamicTooltip()
    .onChange(async (v) => {
      const latest = store.load();
      store.save({ ...latest, tts: { ...latest.tts, mdReadHighlight: { ...(latest.tts.mdReadHighlight ?? { enabled: true, highlightColor: '' }), scrollPositionPct: v } } });
      new Notice(s.noticeSaved);
    }));
```
※ プリセット色名の i18n キー（`mdReadColorDefault` 〜 `mdReadColorGray`）を ja/zh/en に追加すること（ja: 既定/黄色/緑/水色/桃/オレンジ/紫/グレー）。

- [ ] **Step 4: テストが通ること**

Run: `npx vitest run tests/core/settings.test.ts tests/settings`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/settings.ts src/settings/SettingTabTts.ts src/core/i18n.ts tests/core/settings.test.ts tests/settings/SettingTabTts.test.ts
git commit -m "feat(tts): ハイライト色プルダウンとスクロール位置%設定を追加"
```

---

### Task 7: スクロール位置反映（preview-renderer）

**Files:**
- Modify: `src/features/tts/md-read-highlight/preview-renderer.ts`（`highlightChunkInPreview` の末尾 scrollIntoView 部分を差し替え）
- Test: `tests/features/tts/md-read-highlight/preview-renderer.test.ts` 追記

**Interfaces:**
- Consumes: Task 6 の `cfg.tts.mdReadHighlight.scrollPositionPct`（呼び出し側から引数で受ける）
- Produces: `highlightChunkInPreview(view, chunk, scrollPositionPct?: number)`（既定 40）

- [ ] **Step 1: 失敗テスト**

```typescript
it('スクロール位置 pct に応じて scrollTo が呼ばれる（既定 40%）', () => {
  // jsdom で container を作り、getBoundingClientRect / scrollTo をモック
  const scrollTo = vi.fn();
  const container = { scrollTo, getBoundingClientRect: () => ({ top: 0, height: 1000 }), ... } as unknown as HTMLElement;
  const view = { previewMode: { containerEl } };
  // DOM に照合対象テキストを用意（既存 preview-renderer.test.ts の fixture 方式を踏襲）
  highlightChunkInPreview(view as never, chunk, 40);
  expect(scrollTo).toHaveBeenCalled();
  const arg = scrollTo.mock.calls[0][0] as { top: number };
  expect(arg.top).toBeGreaterThanOrEqual(0);
});
```
※ 既存 `preview-renderer.test.ts` の DOM fixture 構成（照合テキストの用意方法）をそのまま踏襲し、`scrollIntoView` の代わりに container.scrollTo への変更を検証する。clamp（pct=200 → 40 扱い）は settings 側で保証済みのため本テストでは 0/100 境界のみ。

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/features/tts/md-read-highlight/preview-renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小実装**

```typescript
export function highlightChunkInPreview(
  view: PreviewLike,
  chunk: MdReadChunkAnchor,
  scrollPositionPct = 40,
): boolean {
  // ...既存の照合・span 注入はそのまま...
  if (firstSpan) {
    // v0.35.0: チャンク先頭を viewport 上から scrollPositionPct% の位置へ
    const container = view.previewMode?.containerEl;
    const scroller = container?.querySelector('.markdown-preview-view, .markdown-reading-view') as HTMLElement | null
      ?? container as HTMLElement | null;
    const spanTop = firstSpan.getBoundingClientRect().top;
    const rect = scroller?.getBoundingClientRect();
    if (scroller && rect) {
      const target = spanTop - rect.top - rect.height * (scrollPositionPct / 100) + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    } else {
      firstSpan.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
```
呼び出し側 `setup.ts`（state subscribe 内）は `cfg.tts.mdReadHighlight?.scrollPositionPct ?? 40` を第 3 引数へ渡す（`store.load()` は subscribe 外で取得済みの cfg を参照）。

- [ ] **Step 4: テストが通ること・既存テスト PASS**

Run: `npx vitest run tests/features/tts/md-read-highlight`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/md-read-highlight/preview-renderer.ts src/features/tts/md-read-highlight/setup.ts tests/features/tts/md-read-highlight/preview-renderer.test.ts
git commit -m "feat(tts): ハイライト自動スクロール位置を設定可能に（既定 40%）"
```

---

### Task 8: ドキュメント・バージョン

**Files:**
- Modify: `package.json` / `src/manifest.json`（バージョン bump: **0.35.0**）
- Modify: `CHANGELOG.md`（新エントリ「[0.35.0] — MD 読み上げ再生制御強化（F-031）」・Added に A〜E の 5 項目）
- Modify: `00_使用ガイド.md`（設定画面 8 タブ表の一般/読み上げ行に追記・更新履歴追加）
- Modify: `Plugin/`（`npm run build` で自動同期）

- [ ] **Step 1: バージョン bump（package.json・manifest.json を 0.35.0 へ）**
- [ ] **Step 2: CHANGELOG・F-番号マスターに F-031 として追記（既存最新 F-番号の次）**
- [ ] **Step 3: 使用ガイド更新**
- [ ] **Step 4: `npm test && npm run build` 全緑確認**
- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs(tts): v0.35.0 リリース準備（CHANGELOG・F-031・使用ガイド）"
```

---

## セルフレビュー結果

- **Spec 網羅**： A(ボタン実働化)→Task 3/5 / B(文区切り)→Task 1/2 / C(先行変換)→Task 4 / D(色プルダウン)→Task 6 / E(スクロール%)→Task 6/7 — すべて対応
- **プレースホルダ**: Task 2 Step 1 と Task 4 Step 1 のテスト骨格は「既存モックパターンへの追従」を明記し、検証対象（見出し分割・fetch 順序）は具体に確定済み
- **型整合**： `getPlaybackController()` / `chunkTextNatural(text, limit)` / `highlightChunkInPreview(view, chunk, scrollPositionPct?)` は定義タスクと利用タスクで統一
