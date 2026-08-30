# ClaudeTTS設定融合とTTS長文対応 実装計画

> 📂 路径：`80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/13_ClaudeTTS設定融合とTTS長文対応実装計画.md`
> 📅 作成日：2026-08-14
> 🐕 担当：MiuMiu 🐾
> 🔗 設計書：[[../02_設計文書/2026-08-14-claude-tts-settings-merger-design|設定融合設計]] / [[../02_設計文書/2026-08-14-tts-long-text-chunking-design|長文チャンキング設計]]

---

## 🎯 Goal

Claudian Bridge v0.9.0 に **①ClaudeTTS設定融合（voice-config.json 同期）** と **②エンジン別チャンキング** と **③WebSpeech API修正** を統合実装し、v0.10.0 としてリリースする。

## 🏗️ Architecture

- **設定融合**: `VoiceConfigSync` が Claudian Bridge の `data.json` を SSOT とし、`~/.claude/skills/claude-tts/voice-config.json` へ自動エクスポート。初回のみ既存 `voice-config.json` をインポート（`general.migratedFrom.claudeTtsSettings` フラグで 1 回だけ）。
- **チャンキング**: `chunkText` / `speakChunks` を `src/features/tts/chunking.ts` に新規作成。`addTextToTTS` ディスパッチャがエンジン別制限値（Plachta 900 / WebSpeech 200 / Edge なし）に基づき分割・連続再生する。
- **WebSpeech修正**: `webSpeechSpeak` が `onend` イベントで完了判定するよう変更（従来の 100ms setTimeout を廃止）。タイムアウトガード併用。

## 🧰 Tech Stack

- TypeScript（Obsidian Plugin, esbuild + vitest）
- テスト: `npm test` = `vitest run`、単一ファイルは `npx vitest run <path>`
- 対象コードベース: `D:/AI-Agent/ClaudianBridge`

## ⚠️ Global Constraints

- **未コミット変更の保護**: `src/features/tts/plachta-tts.ts` と `tests/features/tts/plachta-tts.test.ts` には Gradio 5.x queue API リファクタリングの未コミット変更がある。この作業を破壊しないこと（`git diff` で確認してから編集）。
- 設定スキーマは `src/core/settings.ts` の `normalizeClaudianBridgeSettings` / `validateClaudianBridgeSettings` で必ず正規化・検証する（既存パターン踏襲）。
- テストは TDD（先に失敗テスト → 最小実装 → グリーン確認 → commit）。
- 各コミットは `Co-Authored-By: Claude <noreply@anthropic.com>` を末尾に付与。
- 既存の i18n（`src/core/i18n.ts`）パターンを踏襲し、新規 UI 文言は i18n キーを追加する。
- vault 側 MD ドキュメントは日本語・下線区切り命名に従う。

## 📁 File Structure

| ファイル | 責務 | 種別 |
|---------|------|------|
| `src/core/settings.ts` | `tts.cli` スキーマ追加 + `migratedFrom.claudeTtsSettings` | 修正 |
| `src/core/config-store.ts` | `onSave` サブスクライバ追加 | 修正 |
| `src/features/tts/chunking.ts` | `chunkText` / `speakChunks` | 新規 |
| `src/features/tts/core.ts` | WebSpeech `onend` 修正 + ディスパッチャ・チャンキング | 修正 |
| `src/features/tts/voice-config-sync.ts` | `VoiceConfigSync`（import/export） | 新規 |
| `src/main.ts` | VoiceConfigSync 初期化 + onSave 配線 | 修正 |
| `src/settings/SettingTabTts.ts` | CLI 用設定 UI 追加 | 修正 |
| `src/core/i18n.ts` | CLI 用設定の文言キー追加 | 修正 |
| `tests/features/tts/chunking.test.ts` | chunkText/speakChunks 単体テスト | 新規 |
| `tests/features/tts/voice-config-sync.test.ts` | VoiceConfigSync 単体テスト | 新規 |
| `tests/core/settings.test.ts` | tts.cli 正規化テスト | 修正 |
| `tests/core/config-store.test.ts` | onSave テスト | 修正 |
| `tests/features/tts/core.test.ts` | WebSpeech onend / ディスパッチャ・チャンキング | 修正 |

---

## Task 1: 設定スキーマ拡張（tts.cli + migratedFrom.claudeTtsSettings）

**Files:**
- Modify: `src/core/settings.ts`
- Modify: `tests/core/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface TtsCliSettings { full_text: boolean; max_chars: number; debounce_ms: number; speech_filter: { emoji: boolean; kaomoji: boolean; ascii_emoticon: boolean; emoji_shortcode: boolean } }`
  - `DEFAULT_TTS_CLI_SETTINGS: TtsCliSettings`
  - `ClaudianBridgeSettings.tts.cli?: TtsCliSettings`（optional）
  - `ClaudianBridgeSettings.general.migratedFrom.claudeTtsSettings: boolean`

- [ ] **Step 1: 失敗テストを書く**

`tests/core/settings.test.ts` の末尾に追加：

```typescript
describe('tts.cli (v0.10.0)', () => {
  it('DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.cli はデフォルト値を持つ', () => {
    const cfg = DEFAULT_CLAUDIAN_BRIDGE_SETTINGS;
    expect(cfg.tts.cli).toEqual({
      full_text: false,
      max_chars: 300,
      debounce_ms: 2000,
      speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
    });
  });

  it('normalize は tts.cli の欠落キーをデフォルトで埋める', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { cli: { max_chars: 500 } } });
    expect(cfg.tts.cli?.max_chars).toBe(500);
    expect(cfg.tts.cli?.full_text).toBe(false);
    expect(cfg.tts.cli?.debounce_ms).toBe(2000);
    expect(cfg.tts.cli?.speech_filter?.emoji).toBe(true);
  });

  it('normalize は tts.cli.max_chars を正の整数にクランプする', () => {
    const cfg = normalizeClaudianBridgeSettings({ tts: { cli: { max_chars: -5 } } });
    expect(cfg.tts.cli?.max_chars).toBe(300);
  });

  it('migratedFrom.claudeTtsSettings はデフォルト false', () => {
    const cfg = normalizeClaudianBridgeSettings({});
    expect(cfg.general.migratedFrom.claudeTtsSettings).toBe(false);
  });

  it('validate は tts.cli 型違反を返す（full_text が boolean でない）', () => {
    const bad = {
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      tts: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts, cli: { ...DEFAULT_TTS_CLI_SETTINGS, full_text: 'yes' as unknown as boolean } },
    };
    expect(validateClaudianBridgeSettings(bad)).toContain('tts.cli.full_text');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`tts.cli` が存在しない / `claudeTtsSettings` が存在しない）

- [ ] **Step 3: 最小実装**

`src/core/settings.ts` に追加：

```typescript
// === v0.10.0: Claude Code CLI 用 TTS 設定（voice-config.json と同期） ===
export interface TtsCliSpeechFilter {
  emoji: boolean;
  kaomoji: boolean;
  ascii_emoticon: boolean;
  emoji_shortcode: boolean;
}

export interface TtsCliSettings {
  full_text: boolean;
  max_chars: number;
  debounce_ms: number;
  speech_filter: TtsCliSpeechFilter;
}

export const DEFAULT_TTS_CLI_SPEECH_FILTER: TtsCliSpeechFilter = {
  emoji: true,
  kaomoji: true,
  ascii_emoticon: true,
  emoji_shortcode: true,
};

export const DEFAULT_TTS_CLI_SETTINGS: TtsCliSettings = {
  full_text: false,
  max_chars: 300,
  debounce_ms: 2000,
  speech_filter: { ...DEFAULT_TTS_CLI_SPEECH_FILTER },
};

export function normalizeTtsCliSettings(raw: unknown): TtsCliSettings {
  const r = (raw ?? {}) as Partial<TtsCliSettings>;
  const maxChars = Number(r.max_chars);
  const debounceMs = Number(r.debounce_ms);
  const sf = (r.speech_filter ?? {}) as Partial<TtsCliSpeechFilter>;
  return {
    full_text: typeof r.full_text === 'boolean' ? r.full_text : DEFAULT_TTS_CLI_SETTINGS.full_text,
    max_chars: Number.isInteger(maxChars) && maxChars > 0 ? maxChars : DEFAULT_TTS_CLI_SETTINGS.max_chars,
    debounce_ms: Number.isInteger(debounceMs) && debounceMs >= 0 ? debounceMs : DEFAULT_TTS_CLI_SETTINGS.debounce_ms,
    speech_filter: {
      emoji: typeof sf.emoji === 'boolean' ? sf.emoji : DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji,
      kaomoji: typeof sf.kaomoji === 'boolean' ? sf.kaomoji : DEFAULT_TTS_CLI_SETTINGS.speech_filter.kaomoji,
      ascii_emoticon: typeof sf.ascii_emoticon === 'boolean' ? sf.ascii_emoticon : DEFAULT_TTS_CLI_SETTINGS.speech_filter.ascii_emoticon,
      emoji_shortcode: typeof sf.emoji_shortcode === 'boolean' ? sf.emoji_shortcode : DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji_shortcode,
    },
  };
}
```

`ClaudianBridgeSettings` の `general.migratedFrom` に `claudeTtsSettings: boolean` を追加：

```typescript
migratedFrom: { claudianSelectionBridge: boolean; extensionWhitelist: boolean; vaultOfficeBridge: boolean; chromaInspector: boolean; claudeTtsSettings: boolean };
```

`ClaudianBridgeSettings.tts` に `cli?: TtsCliSettings;` を追加。

`DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general.migratedFrom` に `claudeTtsSettings: false` を追加し、`tts` に `cli: { ...DEFAULT_TTS_CLI_SETTINGS }` を追加。

`normalizeClaudianBridgeSettings` の general セクションに追加：

```typescript
claudeTtsSettings: r.general?.migratedFrom?.claudeTtsSettings ?? false,
```

`normalizeClaudianBridgeSettings` の tts セクション末尾に追加：

```typescript
cli: normalizeTtsCliSettings(r.tts?.cli),
```

`validateClaudianBridgeSettings` に追加：

```typescript
if (cfg.tts.cli !== undefined) {
  if (typeof cfg.tts.cli.full_text !== 'boolean') return 'tts.cli.full_text は boolean である必要があります';
  if (!Number.isInteger(cfg.tts.cli.max_chars) || cfg.tts.cli.max_chars <= 0) return 'tts.cli.max_chars は正の整数である必要があります';
  if (!Number.isInteger(cfg.tts.cli.debounce_ms) || cfg.tts.cli.debounce_ms < 0) return 'tts.cli.debounce_ms は 0 以上の整数である必要があります';
  for (const k of ['emoji', 'kaomoji', 'ascii_emoticon', 'emoji_shortcode'] as const) {
    if (typeof cfg.tts.cli.speech_filter?.[k] !== 'boolean') return `tts.cli.speech_filter.${k} は boolean である必要があります`;
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS

- [ ] **Step 5: 既存の migratedFrom 参照を更新**

`tests/core/settings.test.ts` の 25 行目ほか既存テストが `migratedFrom` を直接構築している箇所は `claudeTtsSettings` が欠けても normalize が補完するため通る。ただし `validate` テストで `{ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, general: { ... } }` と手組みしている箇所はスプレッドで new フィールドが入るため問題なし。テストを実行して既存 5 件が通ることを確認。

Run: `npx vitest run tests/core/settings.test.ts`
Expected: 全 PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(settings): add tts.cli schema + migratedFrom.claudeTtsSettings

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: チャンキングユーティリティ（chunkText / speakChunks）

**Files:**
- Create: `src/features/tts/chunking.ts`
- Create: `tests/features/tts/chunking.test.ts`

**Interfaces:**
- Consumes: （なし）
- Produces:
  - `chunkText(text: string, maxChunkSize: number, delimiters?: string[]): string[]`
  - `speakChunks(chunks: string[], speakFn: (text: string) => Promise<boolean>, onCancel?: () => boolean): Promise<boolean>`

- [ ] **Step 1: 失敗テストを書く**

`tests/features/tts/chunking.test.ts` を作成：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { chunkText, speakChunks } from '../../../src/features/tts/chunking';

describe('chunkText', () => {
  it('短文はそのまま返す', () => {
    expect(chunkText('こんにちは', 100)).toEqual(['こんにちは']);
  });

  it('句読点で分割する', () => {
    const text = 'こんにちは。お元気ですか？今日は。';
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(['こんにちは。', 'お元気ですか？', '今日は。']);
  });

  it('区切り文字がない場合は強制分割する', () => {
    const text = 'あ'.repeat(100);
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBe(4); // 30+30+30+10
    expect(chunks.every((c) => c.length <= 30)).toBe(true);
  });

  it('単一セグメントが max 超ならハード分割する', () => {
    const text = 'あ'.repeat(50);
    const chunks = chunkText(text, 20);
    expect(chunks).toEqual(['あ'.repeat(20), 'あ'.repeat(20), 'あ'.repeat(10)]);
  });

  it('改行も区切りとして扱う', () => {
    const text = '一行目\n二行目\n三行目';
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(['一行目\n', '二行目\n', '三行目']);
  });
});

describe('speakChunks', () => {
  it('全チャンクを順に speak する', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    const ok = await speakChunks(['a', 'b', 'c'], speak);
    expect(ok).toBe(true);
    expect(speak).toHaveBeenCalledTimes(3);
    expect(speak.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('speak が false を返したら中断して false', async () => {
    const speak = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const ok = await speakChunks(['a', 'b', 'c'], speak);
    expect(ok).toBe(false);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('onCancel が true なら中断して false', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    let calls = 0;
    const ok = await speakChunks(['a', 'b', 'c'], speak, () => ++calls > 1);
    expect(ok).toBe(false);
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/chunking.test.ts`
Expected: FAIL（`chunking` モジュールが存在しない）

- [ ] **Step 3: 最小実装**

`src/features/tts/chunking.ts` を作成：

```typescript
/**
 * TTS チャンキングユーティリティ
 *
 * エンジン別の文字数制限（Plachta 1000 / WebSpeech ~250）に対応するため、
 * テキストを自然な区切り（句読点・改行）で分割する。
 */

/** デフォルト区切り文字（日本語・英語の句読点 + 改行） */
export const DEFAULT_DELIMITERS = ['。', '！', '？', '.', '!', '?', '\n'];

/**
 * テキストを maxChunkSize 以下にチャンキングする。
 * 句読点・改行を優先し、それでも超える場合は強制分割する。
 */
export function chunkText(text: string, maxChunkSize: number, delimiters: string[] = DEFAULT_DELIMITERS): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let current = '';
  // 文字クラス内では . ? ! 等はリテラル扱いのためエスケープ不要
  const segments = text.split(new RegExp(`([${delimiters.join('')}])`, 'g'));

  for (const seg of segments) {
    if (seg.length === 0) continue;

    if (current.length + seg.length > maxChunkSize) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      // セグメント自体が max 超ならハード分割
      let rest = seg;
      while (rest.length > maxChunkSize) {
        chunks.push(rest.slice(0, maxChunkSize));
        rest = rest.slice(maxChunkSize);
      }
      current = rest;
    } else {
      current += seg;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * チャンク配列を順に speak し、全チャンク成功で true を返す。
 * speakFn が false を返すか onCancel() が true を返したら中断して false。
 */
export async function speakChunks(
  chunks: string[],
  speakFn: (text: string) => Promise<boolean>,
  onCancel?: () => boolean,
): Promise<boolean> {
  for (const chunk of chunks) {
    if (onCancel?.()) return false;
    const ok = await speakFn(chunk);
    if (!ok) return false;
  }
  return true;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/chunking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/chunking.ts tests/features/tts/chunking.test.ts
git commit -m "feat(tts): add chunkText + speakChunks utilities

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: WebSpeech API onend 修正

**Files:**
- Modify: `src/features/tts/core.ts`（`webSpeechSpeak` 関数 116-160 行目）
- Modify: `tests/features/tts/core.test.ts`

**Interfaces:**
- Consumes: `TtsSettings`（既存）、`pickWebSpeechLang`（既存）
- Produces: `webSpeechSpeak(text, settings, noticeFn): Promise<boolean>` が **onend ベース**で解決

- [ ] **Step 1: 失敗テストを書く**

`tests/features/tts/core.test.ts` の `describe('claudettsHttpSpeak ...')` の後に追加：

```typescript
describe('webSpeechSpeak (v0.10.0 onend fix)', () => {
  // Node には window が無いため、最小の window モックを作る
  function mockWindowWithSpeech() {
    const listeners: Record<string, Array<() => void>> = {};
    const utter = {
      voice: null,
      lang: '',
      onend: null as (() => void) | null,
      onerror: null as ((e: unknown) => void) | null,
    };
    const synth = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(() => {
        // speak 直後に onend を非同期発火
        setTimeout(() => utter.onend?.(), 0);
      }),
    };
    (globalThis as unknown as { window: unknown }).window = {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: class {
        voice: { name?: string } | null = null;
        lang = '';
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        constructor(_t: string) { /* noop */ }
      },
    };
    return { synth, utter };
  }

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('onend 発火後に true を返す（100ms 待たない）', async () => {
    const { synth } = mockWindowWithSpeech();
    const notice = vi.fn();
    const result = await webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice);
    expect(result).toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(notice).not.toHaveBeenCalled();
  });

  it('onerror 発火時は false を返す', async () => {
    mockWindowWithSpeech();
    // 上書きして onerror を発火させる
    const { synth } = mockWindowWithSpeech();
    const notice = vi.fn();
    // SpeechSynthesisUtterance の onerror を発火するため、speak を上書き
    const orig = synth.speak;
    synth.speak = vi.fn((_u: unknown) => {
      const u = _u as { onerror?: (e: unknown) => void };
      u.onerror?.(new Error('boom'));
    });
    const result = await webSpeechSpeak('こんにちは', makeSettings('webspeech'), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Web Speech 再生エラー'));
    orig.mockClear();
  });
});
```

また import に `webSpeechSpeak` を追加：

```typescript
import { addTextToTTS, webSpeechSpeak } from '../../../src/features/tts/core';
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（現実装は setTimeout 100ms 後に resolve し、onend を待たないため / onerror ケースで false になる前に 100ms 後 true になる）

- [ ] **Step 3: 最小実装**

`src/features/tts/core.ts` の `webSpeechSpeak` を修正。`synth.speak` 後の `setTimeout(() => resolve(true), 100)` を廃止し、`onend` で解決 + タイムアウトガード：

```typescript
export async function webSpeechSpeak(text: string, settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  if (typeof window === 'undefined' || !window || !('speechSynthesis' in window)) {
    noticeFn('⚠️ Web SpeechSynthesis API が利用できません');
    return false;
  }
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { /* ignore */ }
  try {
    const Ctor = (window as unknown as { SpeechSynthesisUtterance?: new (t: string) => unknown }).SpeechSynthesisUtterance;
    if (!Ctor) { noticeFn('⚠️ SpeechSynthesisUtterance 未定義'); return false; }
    const u = new Ctor(text) as {
      voice?: { name?: string } | null;
      lang?: string;
      onend?: (() => void) | null;
      onerror?: ((e: unknown) => void) | null;
    };
    const lang = pickWebSpeechLang(text);
    const voiceName = settings.voices.webspeech[lang as 'zh' | 'ja' | 'en'];
    if (voiceName) {
      const voices = synth.getVoices();
      const matched = voices.find((v) => v.name === voiceName);
      if (matched) u.voice = matched;
      else u.lang = lang;
    } else if (!u.voice && !u.lang) {
      u.lang = lang;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (v: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      u.onend = () => settle(true);
      u.onerror = (e) => {
        console.error('[WebSpeech error]', e);
        noticeFn('⚠️ Web Speech 再生エラー');
        settle(false);
      };
      // ブラウザによっては onend が発火しない環境があるため 30 秒ガード
      const timeout = setTimeout(() => {
        console.warn('[WebSpeech] 30s timeout, resolving false');
        settle(false);
      }, 30_000);

      try {
        synth.speak(u as unknown as SpeechSynthesisUtterance);
        // タイムアウトより先に settle したらクリア
        const origSettle = settle;
        (u as unknown as { __orig?: () => void }).__orig = () => clearTimeout(timeout);
        // 上記は使わず、Promise 解決後 clearTimeout
        void Promise.resolve().then(() => { /* noop */ });
      } catch (e) {
        clearTimeout(timeout);
        noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
        settle(false);
      }
    });
  } catch (e) {
    noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
    return false;
  }
}
```

> ⚠️ 実装注意: `clearTimeout` を解決時に確実に呼ぶため、`settle` 内で `clearTimeout(timeout)` を呼ぶ形に変えてよい（下記 Step 4 後に簡潔版へリファクタ）。

**推奨の最終形（settle 内で clearTimeout）**:

```typescript
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => { settle(false); }, 30_000);
      const settle = (v: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(v);
      };
      u.onend = () => settle(true);
      u.onerror = (e) => {
        console.error('[WebSpeech error]', e);
        noticeFn('⚠️ Web Speech 再生エラー');
        settle(false);
      };
      try {
        synth.speak(u as unknown as SpeechSynthesisUtterance);
      } catch (e) {
        noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
        settle(false);
      }
    });
```

（`const timeout` が `settle` より先に宣言されている点に注意 — JS の TDZ に引っかからないよう、`let timeout: ReturnType<typeof setTimeout>;` で宣言してから `settle` を定義し、`timeout = setTimeout(...)` を代入する形が安全。）

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: PASS（新規 2 件 + 既存 8 件）

- [ ] **Step 5: 既存の `setTimeout(() => resolve(true), 100)` 系が残っていないか grep**

Run: `grep -n "resolve(true), 100" src/features/tts/core.ts`
Expected: 0 件

- [ ] **Step 6: Commit**

```bash
git add src/features/tts/core.ts tests/features/tts/core.test.ts
git commit -m "fix(tts): WebSpeech resolves on onend event instead of 100ms timeout

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: エンジン別チャンキングをディスパッチャに適用

**Files:**
- Modify: `src/features/tts/core.ts`（`addTextToTTS` 関数 166-176 行目）
- Modify: `tests/features/tts/core.test.ts`

**Interfaces:**
- Consumes: `chunkText`, `speakChunks`（Task 2）、`ENGINE_CHUNK_LIMITS`
- Produces: `ENGINE_CHUNK_LIMITS: Record<TtsEngine, number | null>`（plachta: 900, edge: null, webspeech: 200）

- [ ] **Step 1: 失敗テストを書く**

`tests/features/tts/core.test.ts` の plachta describe ブロックに追加：

```typescript
describe('addTextToTTS chunking (v0.10.0)', () => {
  it('TC-L01: plachta 1001文字 → 900字チャンクに分割して複数回 plachtaTtsSpeak を呼ぶ', async () => {
    const longText = 'あ'.repeat(1001);
    const p = addTextToTTS(null as never, longText, makePlachtaSettings());
    await p;
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(2);
    const first = vi.mocked(plachtaTtsSpeak).mock.calls[0][0];
    const second = vi.mocked(plachtaTtsSpeak).mock.calls[1][0];
    expect(first.length).toBe(900);
    expect(second.length).toBe(101);
  });

  it('TC-L02: plachta 500文字以下は分割しない（1回だけ）', async () => {
    const shortText = 'あ'.repeat(500);
    await addTextToTTS(null as never, shortText, makePlachtaSettings());
    expect(plachtaTtsSpeak).toHaveBeenCalledTimes(1);
  });

  it('TC-L03: edge はチャンキングしない（制限 null）', async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    const longText = 'a'.repeat(5000);
    const p = addTextToTTS(null as never, longText, makeSettings('edge'));
    child.emit('close', 0);
    await p;
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith(longText);
  });

  it('TC-L04: webspeech は 201文字以上を 200字チャンクに分割する（Node では false で終わる）', async () => {
    // Node 環境では webSpeechSpeak が false を返すため、2 チャンク目で false になる
    const longText = 'こ'.repeat(450);
    await expect(addTextToTTS(null as never, longText, makeSettings('webspeech'))).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（TC-L01 で 1 回しか呼ばれない / TC-L03 で分割される）

- [ ] **Step 3: 最小実装**

`src/features/tts/core.ts` の import に追加：

```typescript
import { chunkText, speakChunks } from './chunking';
```

`addTextToTTS` の前に定数とヘルパーを追加：

```typescript
/**
 * エンジン別チャンク上限（文字数）。null = チャンキングしない。
 * - plachta: HF Space の 1000 文字制限に対し余裕を持たせ 900
 * - webspeech: Chrome の実効制限 ~250 文字に対し安全側 200
 * - edge: ClaudeTTS HTTP ブリッジ側で処理（制限なし）
 */
const ENGINE_CHUNK_LIMITS: Record<TtsEngine, number | null> = {
  plachta: 900,
  edge: null,
  webspeech: 200,
};
```

`addTextToTTS` を置換：

```typescript
export async function addTextToTTS(_app: App | null, text: string, settings: TtsSettings): Promise<boolean> {
  const noticeFn = (m: string): void => { new Notice(m); };

  const limit = ENGINE_CHUNK_LIMITS[settings.engine];
  const chunks = limit !== null && text.length > limit ? chunkText(text, limit) : [text];
  if (chunks.length > 1) {
    console.log(`[claudian-bridge TTS] chunking: ${text.length} chars → ${chunks.length} chunks (engine: ${settings.engine})`);
  }

  return speakChunks(chunks, async (chunk) => {
    if (settings.engine === 'plachta') {
      return plachtaTtsSpeak(chunk, settings, noticeFn);
    }
    if (settings.engine === 'edge') {
      return claudettsHttpSpeak(chunk, settings, noticeFn);
    }
    return webSpeechSpeak(chunk, settings, noticeFn);
  });
}
```

> `TtsEngine` は `../../core/settings` から import 済み（`import type { TtsEngine, PlachtaLanguage } from '../../core/settings'` ではなく `TtsEngine` が import されているか確認。されていなければ `import type { TtsEngine } from '../../core/settings';` を追加）。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: PASS（新規 4 件 + 既存 全件）

- [ ] **Step 5: 既存の plachta テストとの整合を確認**

`tests/features/tts/plachta-tts.test.ts` の TC-P07（1001文字 → false）は `plachtaTtsSpeak` を**直接**呼んでおり、ディスパッチャ経由ではないため変更不要。実行して PASS を確認：

Run: `npx vitest run tests/features/tts/plachta-tts.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/tts/core.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): engine-specific chunking in addTextToTTS dispatcher

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: ConfigStore.onSave サブスクライバ追加

**Files:**
- Modify: `src/core/config-store.ts`
- Modify: `tests/core/config-store.test.ts`

**Interfaces:**
- Produces: `ConfigStore.onSave(listener: (cfg: ClaudianBridgeSettings) => void): void` — `save()` 成功時に listener を同期呼び出し

- [ ] **Step 1: 失敗テストを書く**

`tests/core/config-store.test.ts` を読み、既存パターンに合わせて追加：

```typescript
describe('onSave subscriber (v0.10.0)', () => {
  it('save() 成功時に listener が呼ばれる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-config-'));
    const file = join(dir, 'data.json');
    const store = new ConfigStore(file);
    const listener = vi.fn();
    store.onSave(listener);
    store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ general: expect.objectContaining({ enabled: true }) }));
  });

  it('listener が throw しても save は成功する', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-config-'));
    const file = join(dir, 'data.json');
    const store = new ConfigStore(file);
    store.onSave(() => { throw new Error('listener boom'); });
    expect(() => store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS })).not.toThrow();
    expect(fs.existsSync(file)).toBe(true);
  });
});
```

> 既存のテストファイル冒頭の import を確認し、`vi`, `mkdtempSync`, `tmpdir`, `join`, `DEFAULT_CLAUDIAN_BRIDGE_SETTINGS` が import 済みか確認。足りなければ追加。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/core/config-store.test.ts`
Expected: FAIL（`onSave` が存在しない）

- [ ] **Step 3: 最小実装**

`src/core/config-store.ts` に追加：

```typescript
private saveListeners: Array<(cfg: ClaudianBridgeSettings) => void> = [];

onSave(listener: (cfg: ClaudianBridgeSettings) => void): void {
  this.saveListeners.push(listener);
}
```

`save()` の最後（`this.lastSelfWrite = Date.now();` の後）に追加：

```typescript
for (const l of this.saveListeners) {
  try { l(cfg); } catch { /* listener エラーは保存動作を妨げない */ }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/core/config-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config-store.ts tests/core/config-store.test.ts
git commit -m "feat(config-store): add onSave subscriber hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: VoiceConfigSync（voice-config.json 双方向同期）

**Files:**
- Create: `src/features/tts/voice-config-sync.ts`
- Create: `tests/features/tts/voice-config-sync.test.ts`

**Interfaces:**
- Consumes: `ClaudianBridgeSettings`（`tts` 構造）、`ConfigStore`
- Produces:
  - `class VoiceConfigSync`
  - `constructor(store: ConfigStore, voiceConfigPath?: string)`（テスト用に path 注入可能）
  - `importFromVoiceConfig(): Promise<Partial<ClaudianBridgeSettings> | null>`
  - `exportToVoiceConfig(cfg: ClaudianBridgeSettings): Promise<void>`
  - `static readonly VOICE_CONFIG_PATH: string`

- [ ] **Step 1: 失敗テストを書く**

`tests/features/tts/voice-config-sync.test.ts` を作成：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VoiceConfigSync } from '../../../src/features/tts/voice-config-sync';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, type ClaudianBridgeSettings } from '../../../src/core/settings';
import { ConfigStore } from '../../../src/core/config-store';

function makeStore(tmp: string): ConfigStore {
  return new ConfigStore(path.join(tmp, 'data.json'));
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vc-sync-'));
}

describe('VoiceConfigSync', () => {
  let tmp: string;
  let vcPath: string;

  beforeEach(() => {
    tmp = tmpdir();
    vcPath = path.join(tmp, 'voice-config.json');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('importFromVoiceConfig', () => {
    it('ファイルが無ければ null を返す', async () => {
      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      expect(await sync.importFromVoiceConfig()).toBeNull();
    });

    it('既存 voice-config.json から tts 設定へ変換する', async () => {
      fs.writeFileSync(vcPath, JSON.stringify({
        enabled: true,
        voice: 'xiaoxiao',
        max_chars: 500,
        debounce_ms: 1000,
        lang_strategy: 'auto',
        engine_priority: ['edge-tts', 'pyttsx3', 'system'],
        voice_overrides: { 'zh-CN': 'xiaoxiao', 'ja-JP': 'keita', 'en-US': 'guy' },
        speech_filter: { emoji: false, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
        full_text: true,
      }));

      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      const partial = await sync.importFromVoiceConfig();
      expect(partial).not.toBeNull();
      expect(partial?.tts?.enabled).toBe(true);
      expect(partial?.tts?.engine).toBe('edge');
      expect(partial?.tts?.voices?.edge.ja).toBe('keita');
      expect(partial?.tts?.voices?.edge.en).toBe('guy');
      expect(partial?.tts?.cli?.max_chars).toBe(500);
      expect(partial?.tts?.cli?.full_text).toBe(true);
      expect(partial?.tts?.cli?.speech_filter?.emoji).toBe(false);
    });

    it('engine_priority が pyttsx3 先頭なら webspeech に変換', async () => {
      fs.writeFileSync(vcPath, JSON.stringify({
        enabled: true,
        voice: 'nanami',
        max_chars: 300,
        debounce_ms: 2000,
        lang_strategy: 'auto',
        engine_priority: ['pyttsx3', 'system'],
        voice_overrides: { 'zh-CN': 'xiaoxiao', 'ja-JP': 'nanami', 'en-US': 'aria' },
        speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true },
        full_text: false,
      }));
      const sync = new VoiceConfigSync(makeStore(tmp), vcPath);
      const partial = await sync.importFromVoiceConfig();
      expect(partial?.tts?.engine).toBe('webspeech');
    });
  });

  describe('exportToVoiceConfig', () => {
    it('Claudian Bridge 設定を voice-config.json 形式で出力する', async () => {
      const store = makeStore(tmp);
      store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      const cfg: ClaudianBridgeSettings = {
        ...store.load(),
        tts: {
          enabled: true,
          engine: 'edge',
          voices: { edge: { zh: 'xiaoxiao', ja: 'keita', en: 'guy' }, webspeech: { zh: '', ja: '', en: '' } },
          cli: { full_text: true, max_chars: 500, debounce_ms: 1000, speech_filter: { emoji: false, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
        },
      };
      const sync = new VoiceConfigSync(store, vcPath);
      await sync.exportToVoiceConfig(cfg);

      const written = JSON.parse(fs.readFileSync(vcPath, 'utf-8'));
      expect(written.enabled).toBe(true);
      expect(written.engine_priority).toEqual(['edge-tts', 'pyttsx3', 'system']);
      expect(written.voice_overrides).toEqual({ 'zh-CN': 'xiaoxiao', 'ja-JP': 'keita', 'en-US': 'guy' });
      expect(written.full_text).toBe(true);
      expect(written.max_chars).toBe(500);
      expect(written.debounce_ms).toBe(1000);
      expect(written.speech_filter.emoji).toBe(false);
    });

    it('engine=plachta は edge-tts 優先で出力する', async () => {
      const store = makeStore(tmp);
      store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      const cfg: ClaudianBridgeSettings = {
        ...store.load(),
        tts: { ...store.load().tts, engine: 'plachta' },
      };
      const sync = new VoiceConfigSync(store, vcPath);
      await sync.exportToVoiceConfig(cfg);
      const written = JSON.parse(fs.readFileSync(vcPath, 'utf-8'));
      expect(written.engine_priority[0]).toBe('edge-tts');
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/features/tts/voice-config-sync.test.ts`
Expected: FAIL（`voice-config-sync` が存在しない）

- [ ] **Step 3: 最小実装**

`src/features/tts/voice-config-sync.ts` を作成：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings, TtsCliSettings, TtsEngine } from '../../core/settings';
import { DEFAULT_TTS_CLI_SETTINGS } from '../../core/settings';

/** voice-config.json（Claude Code CLI 側）のスキーマ */
interface VoiceConfigJson {
  enabled: boolean;
  voice: string;
  max_chars: number;
  debounce_ms: number;
  lang_strategy: string;
  engine_priority: string[];
  voice_overrides: Record<string, string>;
  speech_filter: { emoji: boolean; kaomoji: boolean; ascii_emoticon: boolean; emoji_shortcode: boolean };
  full_text: boolean;
}

/** エンジン別 engine_priority マッピング */
const ENGINE_PRIORITY: Record<TtsEngine, string[]> = {
  edge: ['edge-tts', 'pyttsx3', 'system'],
  webspeech: ['pyttsx3', 'system'],
  plachta: ['edge-tts', 'pyttsx3', 'system'],
};

/**
 * Claudian Bridge と Claude Code CLI（voice-config.json）の双方向同期。
 * Claudian Bridge を SSOT とし、保存時に export、初回起動時に import する。
 */
export class VoiceConfigSync {
  static readonly VOICE_CONFIG_PATH = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'voice-config.json');

  constructor(
    private readonly store: ConfigStore,
    private readonly voiceConfigPath: string = VoiceConfigSync.VOICE_CONFIG_PATH,
  ) {}

  /** 既存 voice-config.json を Claudian Bridge 設定へ変換（無ければ null） */
  async importFromVoiceConfig(): Promise<Partial<ClaudianBridgeSettings> | null> {
    if (!fs.existsSync(this.voiceConfigPath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(this.voiceConfigPath, 'utf-8')) as Partial<VoiceConfigJson>;
      const priority = raw.engine_priority ?? ['edge-tts', 'pyttsx3', 'system'];
      const engine: TtsEngine = priority[0] === 'edge-tts' ? 'edge' : priority[0] === 'pyttsx3' ? 'webspeech' : 'edge';
      const overrides = raw.voice_overrides ?? {};
      const cli: TtsCliSettings = {
        full_text: raw.full_text ?? DEFAULT_TTS_CLI_SETTINGS.full_text,
        max_chars: typeof raw.max_chars === 'number' ? raw.max_chars : DEFAULT_TTS_CLI_SETTINGS.max_chars,
        debounce_ms: typeof raw.debounce_ms === 'number' ? raw.debounce_ms : DEFAULT_TTS_CLI_SETTINGS.debounce_ms,
        speech_filter: {
          emoji: raw.speech_filter?.emoji ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji,
          kaomoji: raw.speech_filter?.kaomoji ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.kaomoji,
          ascii_emoticon: raw.speech_filter?.ascii_emoticon ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.ascii_emoticon,
          emoji_shortcode: raw.speech_filter?.emoji_shortcode ?? DEFAULT_TTS_CLI_SETTINGS.speech_filter.emoji_shortcode,
        },
      };
      return {
        tts: {
          enabled: raw.enabled ?? true,
          engine,
          voices: {
            edge: {
              zh: overrides['zh-CN'] ?? raw.voice ?? 'xiaoxiao',
              ja: overrides['ja-JP'] ?? raw.voice ?? 'nanami',
              en: overrides['en-US'] ?? raw.voice ?? 'aria',
            },
            webspeech: { zh: '', ja: '', en: '' },
          },
          cli,
        },
      };
    } catch {
      return null;
    }
  }

  /** Claudian Bridge 設定を voice-config.json に出力 */
  async exportToVoiceConfig(cfg: ClaudianBridgeSettings): Promise<void> {
    const tts = cfg.tts;
    const cli = tts.cli ?? DEFAULT_TTS_CLI_SETTINGS;
    const vc: VoiceConfigJson = {
      enabled: tts.enabled,
      voice: tts.voices.edge.zh || 'xiaoxiao',
      max_chars: cli.max_chars,
      debounce_ms: cli.debounce_ms,
      lang_strategy: 'auto',
      engine_priority: ENGINE_PRIORITY[tts.engine],
      voice_overrides: {
        'zh-CN': tts.voices.edge.zh || 'xiaoxiao',
        'ja-JP': tts.voices.edge.ja || 'nanami',
        'en-US': tts.voices.edge.en || 'aria',
      },
      speech_filter: { ...cli.speech_filter },
      full_text: cli.full_text,
    };
    await fs.promises.mkdir(path.dirname(this.voiceConfigPath), { recursive: true });
    await fs.promises.writeFile(this.voiceConfigPath, JSON.stringify(vc, null, 2) + '\n', 'utf-8');
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/features/tts/voice-config-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/voice-config-sync.ts tests/features/tts/voice-config-sync.test.ts
git commit -m "feat(tts): add VoiceConfigSync for voice-config.json bidirectional sync

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: main.ts 統合（VoiceConfigSync 初期化 + onSave 配線）

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `VoiceConfigSync`, `ConfigStore.onSave`（Task 5/6）
- Produces: 起動時 import（1 回のみ）+ 保存時 export

- [ ] **Step 1: import 追加**

`src/main.ts` に追加：

```typescript
import { VoiceConfigSync } from './features/tts/voice-config-sync';
```

- [ ] **Step 2: onload 内に初期化処理を追加**

`onload()` 内、`runTtsMigration`（69 行目付近）の後、`general.enabled` 判定（109 行目）の前に追加：

```typescript
// ★ v0.10.0: Claude Code CLI 用 voice-config.json 同期
const voiceSync = new VoiceConfigSync(this.store);

// 初回のみ既存 voice-config.json をインポート（その後は Claudian Bridge が SSOT）
try {
  const cfgBefore = this.store.load();
  if (!cfgBefore.general.migratedFrom.claudeTtsSettings) {
    const imported = await voiceSync.importFromVoiceConfig();
    if (imported) {
      const current = this.store.load();
      // 既存 tts.enabled がデフォルトのままならインポート値を採用（それ以外は既存優先）
      const merged = {
        ...current,
        tts: {
          ...current.tts,
          ...imported.tts,
          // voices は current を優先（ユーザー設定を壊さない）
          voices: current.tts.voices,
        },
      };
      this.store.save(merged);
      const cfgAfter = this.store.load();
      this.store.save({
        ...cfgAfter,
        general: {
          ...cfgAfter.general,
          migratedFrom: { ...cfgAfter.general.migratedFrom, claudeTtsSettings: true },
        },
      });
      console.log('[claudian-bridge] imported voice-config.json → tts settings');
    } else {
      // voice-config.json が無い場合もフラグだけ立てる（再試行しない）
      const cfgNo = this.store.load();
      this.store.save({
        ...cfgNo,
        general: {
          ...cfgNo.general,
          migratedFrom: { ...cfgNo.general.migratedFrom, claudeTtsSettings: true },
        },
      });
    }
  }
} catch (e) {
  diag('voiceConfig import ERROR', e);
  console.warn('[claudian-bridge] voice-config import error:', e);
}
```

> ⚠️ 設計上の注意: `general.enabled === false` のときはこの処理をスキップしたい。109 行目の判定より前に置くと、無効時も import が走る。**109 行目の判定の後、機能登録セクションの先頭**（117 行目 `setupSelectionWatcher` の前）に置くほうが安全。実装時は `if (!this.store.load().general.enabled) { ... return; }` の**後**に配置すること。

- [ ] **Step 3: onSave 配線を追加**

機能登録セクションの `setupSelectionWatcher` 登録（123 行目）の後あたりに追加：

```typescript
// ★ v0.10.0: 保存時に voice-config.json へエクスポート（Claudian Bridge が SSOT）
this.store.onSave((cfg) => {
  void voiceSync.exportToVoiceConfig(cfg).catch((e) => {
    console.warn('[claudian-bridge] voice-config export error:', e);
  });
});
```

- [ ] **Step 4: 型チェックとビルド**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: エラーなし

Run: `npm run build`
Expected: ビルド成功（`main.js` が生成される）

- [ ] **Step 5: 手動検証（Obsidian 再読み込み）**

Obsidian でプラグインを再読み込みし、以下を確認：
1. `~/.claude/skills/claude-tts/voice-config.json` が存在する
2. 設定タブで TTS 音色を変更 → `voice-config.json` の `voice_overrides` が更新される
3. `general.migratedFrom.claudeTtsSettings` が `data.json` で true になる

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire VoiceConfigSync import/export into lifecycle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 設定タブに CLI 用設定セクション追加 + i18n

**Files:**
- Modify: `src/settings/SettingTabTts.ts`
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Consumes: `TtsCliSettings`, `ConfigStore.save`
- Produces: 設定タブの「🖥️ Claude Code CLI 用設定」セクション

- [ ] **Step 1: i18n キー追加**

`src/core/i18n.ts` の `LocaleStrings` に追加（3 言語 `ja` / `zh` / `en` それぞれ）：

```typescript
ttsCliHeading: string;
ttsCliFullText: string;
ttsCliFullTextDesc: string;
ttsCliMaxChars: string;
ttsCliMaxCharsDesc: string;
ttsCliDebounceMs: string;
ttsCliDebounceMsDesc: string;
ttsCliFilterHeading: string;
ttsCliFilterEmoji: string;
ttsCliFilterKaomoji: string;
ttsCliFilterAscii: string;
ttsCliFilterShortcode: string;
```

ja 値:

```typescript
ttsCliHeading: '🖥️ Claude Code CLI 用設定',
ttsCliFullText: '📖 全文読み上げ',
ttsCliFullTextDesc: 'ON で最大文字数制限なし（voice-config.json に同期）',
ttsCliMaxChars: '📏 最大文字数',
ttsCliMaxCharsDesc: 'これを超えるテキストは CLI 側で読み上げない',
ttsCliDebounceMs: '⏱️ 防抖窓 (ms)',
ttsCliDebounceMsDesc: 'CLI 連続応答時の読み上げ抑制時間',
ttsCliFilterHeading: '🔇 朗读文案优化',
ttsCliFilterEmoji: 'Emoji 絵文字',
ttsCliFilterKaomoji: '颜文字 (kaomoji)',
ttsCliFilterAscii: 'ASCII 表情',
ttsCliFilterShortcode: 'Emoji 短碼',
```

zh 値:

```typescript
ttsCliHeading: '🖥️ Claude Code CLI 用设置',
ttsCliFullText: '📖 全文朗读',
ttsCliFullTextDesc: '开启后无最大字数限制（同步到 voice-config.json）',
ttsCliMaxChars: '📏 最大字数',
ttsCliMaxCharsDesc: '超过该字数的文本 CLI 端不朗读',
ttsCliDebounceMs: '⏱️ 防抖窗口 (ms)',
ttsCliDebounceMsDesc: 'CLI 连续响应的朗读抑制时间',
ttsCliFilterHeading: '🔇 朗读文案优化',
ttsCliFilterEmoji: 'Emoji 表情',
ttsCliFilterKaomoji: '颜文字 (kaomoji)',
ttsCliFilterAscii: 'ASCII 表情',
ttsCliFilterShortcode: 'Emoji 短代码',
```

en 值:

```typescript
ttsCliHeading: '🖥️ Claude Code CLI Settings',
ttsCliFullText: '📖 Full-text reading',
ttsCliFullTextDesc: 'Read full text ignoring max_chars (synced to voice-config.json)',
ttsCliMaxChars: '📏 Max chars',
ttsCliMaxCharsDesc: 'Texts longer than this are not read by CLI',
ttsCliDebounceMs: '⏱️ Debounce (ms)',
ttsCliDebounceMsDesc: 'Debounce window for consecutive CLI responses',
ttsCliFilterHeading: '🔇 Speech text optimization',
ttsCliFilterEmoji: 'Emoji',
ttsCliFilterKaomoji: 'Kaomoji',
ttsCliFilterAscii: 'ASCII emoticon',
ttsCliFilterShortcode: 'Emoji shortcode',
```

- [ ] **Step 2: SettingTabTts にセクション追加**

`src/settings/SettingTabTts.ts` の `draw()` 内、エンジン別 UI の後（plachta ブロックの後 / 削除注意文の前）に追加：

```typescript
// 6. v0.10.0: Claude Code CLI 用設定（voice-config.json と同期）
{
  const cliBox = containerEl.createDiv({ cls: 'cb-tts-cli' });
  cliBox.createEl('h3', { text: s.ttsCliHeading });

  const saveCli = (patch: Partial<TtsCliSettings>): void => {
    const latest = store.load();
    const base = latest.tts.cli ?? { full_text: false, max_chars: 300, debounce_ms: 2000, speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } };
    store.save({ ...latest, tts: { ...latest.tts, cli: { ...base, ...patch } } });
    draw();
  };

  new Setting(cliBox)
    .setName(s.ttsCliFullText)
    .setDesc(s.ttsCliFullTextDesc)
    .addToggle((t) => t.setValue(cfg.tts.cli?.full_text ?? false).onChange((v) => saveCli({ full_text: v })));

  new Setting(cliBox)
    .setName(s.ttsCliMaxChars)
    .setDesc(s.ttsCliMaxCharsDesc)
    .addText((t) => t
      .setValue(String(cfg.tts.cli?.max_chars ?? 300))
      .onChange((v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) return;
        saveCli({ max_chars: n });
      }),
    );

  new Setting(cliBox)
    .setName(s.ttsCliDebounceMs)
    .setDesc(s.ttsCliDebounceMsDesc)
    .addText((t) => t
      .setValue(String(cfg.tts.cli?.debounce_ms ?? 2000))
      .onChange((v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return;
        saveCli({ debounce_ms: n });
      }),
    );

  const sf = cfg.tts.cli?.speech_filter ?? { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true };
  cliBox.createEl('h4', { text: s.ttsCliFilterHeading });
  const filterItems: Array<[keyof typeof sf, string]> = [
    ['emoji', s.ttsCliFilterEmoji],
    ['kaomoji', s.ttsCliFilterKaomoji],
    ['ascii_emoticon', s.ttsCliFilterAscii],
    ['emoji_shortcode', s.ttsCliFilterShortcode],
  ];
  for (const [key, label] of filterItems) {
    new Setting(cliBox)
      .setName(`🔇 ${label}`)
      .addToggle((t) => t.setValue(sf[key]).onChange((v) => saveCli({ speech_filter: { ...sf, [key]: v } })));
  }
}
```

import に追加：

```typescript
import type { TtsCliSettings } from '../core/settings';
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: エラーなし

- [ ] **Step 4: ビルド**

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 5: 手動検証**

Obsidian で設定タブ → TTS を開き、「🖥️ Claude Code CLI 用設定」セクションが表示されること。値を変更すると `~/.claude/skills/claude-tts/voice-config.json` が更新されること。

- [ ] **Step 6: Commit**

```bash
git add src/settings/SettingTabTts.ts src/core/i18n.ts
git commit -m "feat(settings): add Claude Code CLI TTS settings section

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 全テスト実行 + ドキュメント更新 + リリース

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/00_アーキテクチャ総覧.md`（vault 側）
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/03_リリースノート/リリースノート.md`（vault 側）

- [ ] **Step 1: 全テスト実行**

Run: `npm test`
Expected: 全 PASS（新規 + 既存）

- [ ] **Step 2: manifest バージョン更新**

`manifest.json` の `version` を `0.9.0` → `0.10.0` に更新。`versions.json` にも追加。

```bash
git add manifest.json versions.json
git commit -m "chore(version): bump to 0.10.0"
```

- [ ] **Step 3: CHANGELOG 追記**

`CHANGELOG.md` に追加：

```markdown
## [0.10.0] - 2026-08-14
### Added
- ClaudeTTS（voice-config.json）設定融合: Claudian Bridge を SSOT として CLI 設定と双方向同期
- エンジン別チャンキング: Plachta（900字）/ WebSpeech（200字）で長文を自動分割
### Fixed
- WebSpeech API が onend を待たず 100ms で成功判定していた問題
```

- [ ] **Step 4: vault 側ドキュメント更新**

`00_アーキテクチャ総覧.md` の構造ツリーに以下を追記：
- `src/features/tts/chunking.ts`（新規）
- `src/features/tts/voice-config-sync.ts`（新規）

`08_説明書/03_リリースノート/リリースノート.md` に v0.10.0 セクションを追加。

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: update CHANGELOG for v0.10.0

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 6: 統合検証チェックリスト**

| # | 検証項目 | 方法 |
|:--:|---------|------|
| 1 | 全テストグリーン | `npm test` |
| 2 | 既存 voice-config.json が import される | data.json に tts.cli が反映 |
| 3 | 設定変更が voice-config.json に反映 | 設定タブ変更 → ファイル更新 |
| 4 | 長文（>1000字）が Plachta で読める | テストボタン + 長文 |
| 5 | 長文（>200字）が WebSpeech で途切れない | 実機確認 |
| 6 | claude-tts-settings なしで完結 | プラグイン無効化後も動作 |

---

## Self-Review 結果

| チェック | 結果 |
|:-------|:----:|
| **Spec 網羅** | ①設定融合=Task 1/5/6/7/8、②チャンキング=Task 2/4、③WebSpeech=Task 3、Docs=Task 9 ✅ |
| **Placeholder スキャン** | 全コード手順に実コードを記載（`__orig` 参照は Step 3 内で「推奨の最終形」に置換する旨を明記） ✅ |
| **型整合性** | `TtsCliSettings` / `chunkText` / `speakChunks` / `VoiceConfigSync` は全タスクで同一シグネチャを使用 ✅ |
| **未コミット変更保護** | Task 2 の plachta-tts 触らず、Task 4 は core.ts のみ。Task 5 で plachta-tts.test.ts の TC-P07 が維持されることを確認 ✅ |

---

## 実装後の修正（v0.12.1 〜 v0.12.2）

> 📅 2026-08-15 追記。設定融合・TTS 実行経路に関わる後続修正を記録する。

### v0.12.1: CLI stop_hook の full_text 対応 + tts-speak.py 復元（KB-010）

- `~/.claude/hooks/tts-speak.py` が欠落しており、CLI タスク完了時の読み上げが**静かに失敗**していた。claude-tts スキルの `stop_hook.py` を呼ぶラッパーとして復元
- `voice-config.json` の `full_text: true` を stop_hook が尊重するよう修正（`max_chars` 制限を無効化 → 全文読み上げ）
- `tts_core/extractor.py` の `max_chars <= 0` を「無制限」として扱うよう修正

### v0.12.2: speech_filter を全読み上げ経路に適用（KB-011 / KB-012）

`tts.cli.speech_filter`（emoji/顔文字/ASCII表情/短コード除去）が**定義・UI 表示・CLI 同期のみで、実際の読み上げに未適用**だった問題を修正。

| 経路 | 対応 |
|------|------|
| チャット自動読み上げ / 手動 Add to TTS | `core.ts` に `filterSpeechText()` を実装し、`addTextToTTS` 冒頭で適用 |
| CLI stop_hook | claude-tts スキル `tts_core/extractor.py` に POC_015 由来の speech_filter 実装を**復元** + `pipeline.py` で config から配線 |

### 関連設定の所在

| 設定 | 場所 | 適用経路 |
|------|------|---------|
| `speech_filter` | `tts.cli.speech_filter`（ClaudianBridge data.json）| `addTextToTTS` / `voice-config.json` 経由で CLI にも同期 |
| `full_text` | `tts.cli.full_text` ⟺ `autoRead.scope` | チャットは抽出範囲、CLI は stop_hook の文字数制限無効化 |

---

*📋 ClaudeTTS設定融合とTTS長文対応 実装計画 v1.0 · MiuMiu 🐾 · 2026-08-14（v0.12.2 追記）*
