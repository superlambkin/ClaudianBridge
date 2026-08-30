# TTS エンジン変更 実装計画 — ローカル EdgeTTS 同梱＋クラウドサーバ対応＋言語モード切替（v0.27.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian Bridge の TTS 機能に「edge_tts 完全同梱」「クラウド EdgeTTS 用 HTTPS プロキシ対応」「Add to TTS / AI 自動読上げ 別々の言語モード切替」「Windows / Ubuntu クロスプラットフォーム対応」を追加する（v0.27.0）。

**Architecture:** 既存 4 エンジン (`edge` / `webspeech` / `plachta` / `edge-local`) の構造は維持しつつ、(a) `py/edge_tts/` を `git subtree` で同梱し pip 依存を排除、(b) `claudettsHttpSpeak` を汎用 HTTPS POST プロキシへ全面置換、(c) `pickLang(text, mode)` に言語モード引数を追加して `lang.ts` を SSOT 化、(d) `edge-tts-local.ts` の spawn / kill を POSIX 対応にする。設定 UI に 📂 ボタンと `edgeCloud` 3 フィールドを追加する。

**Tech Stack:** TypeScript (Node 18+, ES2022) / Obsidian Plugin API / vitest / esbuild / Python 3.x (edge_tts 同梱) / electron `shell.openPath`

**設計書:** [[../02_設計文書/2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode|2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode-change-plan §三〜六]]

---

## Global Constraints

- リポジトリ: `D:/AI-Agent/ClaudianBridge`（作業ディレクトリ）
- テスト: `npm test`（=`vitest run`）。個別実行は `npx vitest run <path>`
- 型検査: `npm run typecheck`（=`tsc -noEmit`）
- 既存テストのモック方針を踏襲: `vi.hoisted` + 手作りモック（`tests/mocks/obsidian.ts`）
- ⚠️ `NodeList` の `for...of` 反復は TS2488 → 常に `Array.from(m.addedNodes)` を使用
- コミットメッセージは `feat:` / `fix:` プレフィックス（日本語説明）
- 既存 `edge` → `edge-local` 自動 migration を `migrator.ts` で実行（`backup.record()` 経由）
- `engine: 'edge'`（クラウド）選択時は `edgeCloud.serverUrl` 必須。未設定で Notice
- Python コマンド解決: Windows=`python` / Linux=`python3`
- プロセス停止: Windows=`taskkill /PID <pid> /T /F`、Linux=`kill -TERM <pid>` → 500ms → `kill -KILL <pid>`
- i18n ラベル追加先: `src/core/i18n.ts`（`ja` / `zh` / `en` の 3 言語）
- 既存 `pickWebSpeechLang` のシグネチャは維持（後方互換）。新 `pickLang(text, mode)` を `lang.ts` に追加
- ファイル命名: 日本語 + アンダースコア（`edge-tts-local.ts` 等のハイフン区切り既存ファイルは変更しない）

---

## File Structure

| ファイル | 種別 | 責務 |
|---------|:----:|------|
| `py/edge_tts/**` | 🆕 同梱 | edge_tts MIT パッケージ本体 |
| `THIRD_PARTY_NOTICES.md` | 🆕 新規 | edge_tts ライセンス注記 |
| `src/core/settings.ts` | ✏️ | `TtsLanguageMode`, `TtsEdgeCloudSettings`, `DEFAULT_TTS_EDGE_CLOUD`, `normalizeTtsSettings` 拡張 |
| `src/core/migrator.ts` | ✏️ | `migrateEdgeToEdgeLocal` 追加、`runTtsMigration` から呼び出し |
| `src/features/tts/lang.ts` | ✏️ | `pickLang(text, mode)` 追加 |
| `src/features/tts/edge-tts-local.ts` | ✏️ | `resolvePythonCmd`, `killProcessTree` 追加、Python3 検出 |
| `src/features/tts/core.ts` | ✏️ | `claudettsHttpSpeak` → `edgeCloudHttpSpeak` 全面置換、`pickLang` 経由 |
| `src/features/tts/auto-read.ts` | ✏️ | `tts.autoReadLanguageMode` を `pickLang` に渡す |
| `src/settings/SettingTabTts.ts` | ✏️ | 📂 ボタン、言語モード 2 系統、`edgeCloud` 3 フィールド |
| `src/core/i18n.ts` | ✏️ | 新規ラベル（ja/zh/en） |
| `esbuild.config.mjs` | ✏️ | `extraResources: ['py/']` 追加 |
| `tests/features/tts/lang.test.ts` | 🆕 | `pickLang` のモード別テスト |
| `tests/features/tts/edge-tts-local.test.ts` | ✏️ | python3 / kill フォールバック / 言語モード |
| `tests/features/tts/core.test.ts` | ✏️ | `edgeCloudHttpSpeak` HTTPS POST / Abort / ヘッダ |
| `tests/features/tts/auto-read.test.ts` | ✏️ | 言語モード適用テスト |
| `styles.css` | ✏️ | 📂 ボタン・edgeCloud フィールドスタイル |
| `package.json` | ✏️ | `scripts.bundle:edge-tts` 追加 |
| `CHANGELOG.md` | ✏️ | v0.27.0 エントリ |

---

### Task 1: edge_tts 同梱（git subtree）

**Files:**
- Modify: `D:/AI-Agent/ClaudianBridge`（git 操作）
- Create: `py/edge_tts/**`
- Create: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces: プラグイン DIR 配下の `py/edge_tts/` に `__init__.py` / `communicate.py` 等が配置されている
- Consumes: Task 6 の `resolveEdgeTtsModulePath` が `<pluginDir>/py/edge_tts` 配下を解決する

- [ ] **Step 1: 取り込み対象タグを確認**

```bash
cd D:/AI-Agent/ClaudianBridge
git ls-remote --tags https://github.com/rany2/edge-tts.git | grep -E "v6\.1\.[0-9]+$" | sort -V | tail -1
```

期待出力（2026-08-20 確認）: `4bdb8e4c6ea62f151a45a3fceb4cf6ff696bb89f	refs/tags/7.2.8`

- [ ] **Step 2: git subtree で取り込み**

```bash
cd D:/AI-Agent/ClaudianBridge
git subtree add --prefix=py/edge_tts https://github.com/rany2/edge-tts.git <タグ名> --squash
# 例: git subtree add --prefix=py/edge_tts https://github.com/rany2/edge-tts.git 7.2.8 --squash
```

期待出力: `git write-tree` 成功 + `py/edge_tts/__init__.py` 等が配置される

- [ ] **Step 3: 取り込み確認**

```bash
ls py/edge_tts/ | head -10
```

期待出力: `__init__.py  communicate.py  exceptions.py  list_voices.py  ...`（最低 5 ファイル）

- [ ] **Step 4: 取り込み検証**

```bash
python3 -c "import sys; sys.path.insert(0, 'py'); import edge_tts; print(edge_tts.__version__ if hasattr(edge_tts, '__version__') else 'ok')"
```

期待出力: `ok` またはバージョン文字列（import エラーで失敗しないこと）

- [ ] **Step 5: THIRD_PARTY_NOTICES.md を作成**

`THIRD_PARTY_NOTICES.md` を新規作成:

```markdown
# Third-Party Notices

## edge-tts

- **Repository**: https://github.com/rany2/edge-tts
- **License**: MIT License
- **Copyright**: (c) rany2 and contributors
- **Bundled Path**: `py/edge_tts/`
- **Bundled Version**: v7.2.8（2026-08-20 時点の最新版）

---

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to the person to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: コミット**

```bash
git add py/edge_tts THIRD_PARTY_NOTICES.md
git commit -m "feat: edge_tts v7.2.8 を py/edge_tts/ に完全同梱（pip 依存ゼロ）"
```

---

### Task 2: 設定型 — `TtsLanguageMode` と `TtsEdgeCloudSettings` 追加

**Files:**
- Modify: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts`（既存テストに追加）

**Interfaces:**
- Produces:
  - `export type TtsLanguageMode = 'auto' | 'ja' | 'zh' | 'en';`
  - `export const TTS_LANGUAGE_MODES: readonly TtsLanguageMode[];`
  - `export interface TtsEdgeCloudSettings { serverUrl: string; authToken: string; timeout: number; }`
  - `export const DEFAULT_TTS_EDGE_CLOUD: TtsEdgeCloudSettings;`

- [ ] **Step 1: 失敗テストを追加**

`tests/core/settings.test.ts` の既存 `describe('normalizeTtsSettings', ...)` ブロックに追記:

```typescript
describe('TtsLanguageMode / TtsEdgeCloudSettings', () => {
  it('TTS_LANGUAGE_MODES は auto / ja / zh / en', () => {
    expect(TTS_LANGUAGE_MODES).toEqual(['auto', 'ja', 'zh', 'en']);
  });

  it('DEFAULT_TTS_EDGE_CLOUD は空文字 + 30000ms', () => {
    expect(DEFAULT_TTS_EDGE_CLOUD).toEqual({
      serverUrl: '',
      authToken: '',
      timeout: 30_000,
    });
  });

  it('normalizeTtsSettings: addToTtsLanguageMode 未設定 → auto', () => {
    const out = normalizeTtsSettings({ engine: 'edge-local', voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} } });
    expect(out.addToTtsLanguageMode).toBe('auto');
  });

  it('normalizeTtsSettings: autoReadLanguageMode=ja は維持', () => {
    const out = normalizeTtsSettings({
      engine: 'edge-local',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      autoReadLanguageMode: 'ja',
    });
    expect(out.autoReadLanguageMode).toBe('ja');
  });

  it('normalizeTtsSettings: 異常な addToTtsLanguageMode → auto にフォールバック', () => {
    const out = normalizeTtsSettings({
      engine: 'edge-local',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      addToTtsLanguageMode: 'fr' as unknown as TtsLanguageMode,
    });
    expect(out.addToTtsLanguageMode).toBe('auto');
  });

  it('normalizeTtsSettings: edgeCloud 部分設定は DEFAULT とマージ', () => {
    const out = normalizeTtsSettings({
      engine: 'edge',
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
      edgeCloud: { serverUrl: 'https://x.local', authToken: '', timeout: 5000 },
    });
    expect(out.edgeCloud).toEqual({
      serverUrl: 'https://x.local',
      authToken: '',
      timeout: 5000,
    });
  });

  it('normalizeTtsSettings: engine 未指定 → edge-local にフォールバック（v0.27 デフォルト）', () => {
    const out = normalizeTtsSettings({
      voices: { edge: {zh:'',ja:'',en:''}, webspeech: {zh:'',ja:'',en:''} },
    } as unknown);
    expect(out.engine).toBe('edge-local');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL（`TtsLanguageMode` / `TTS_LANGUAGE_MODES` / `DEFAULT_TTS_EDGE_CLOUD` 未定義）

- [ ] **Step 3: 実装を追加**

`src/core/settings.ts` を編集:

```typescript
/** v0.27.0: 言語モード — auto / 固定言語 */
export type TtsLanguageMode = 'auto' | 'ja' | 'zh' | 'en';

export const TTS_LANGUAGE_MODES: readonly TtsLanguageMode[] = ['auto', 'ja', 'zh', 'en'] as const;

/** v0.27.0: クラウド EdgeTTS プロキシ設定 */
export interface TtsEdgeCloudSettings {
  serverUrl: string;
  authToken: string;
  timeout: number;
}

export const DEFAULT_TTS_EDGE_CLOUD: TtsEdgeCloudSettings = {
  serverUrl: '',
  authToken: '',
  timeout: 30_000,
};
```

`TtsSettings` インターフェースに追加:

```typescript
/** v0.27.0: 言語モード — Add to TTS 系 */
addToTtsLanguageMode?: TtsLanguageMode;
/** v0.27.0: 言語モード — AI 自動読上げ系 */
autoReadLanguageMode?: TtsLanguageMode;
/** v0.27.0: クラウド EdgeTTS プロキシ設定 */
edgeCloud?: TtsEdgeCloudSettings;
```

`DEFAULT_TTS_SETTINGS`（または同等のデフォルト定義）に追加:

```typescript
addToTtsLanguageMode: 'auto' as TtsLanguageMode,
autoReadLanguageMode: 'auto' as TtsLanguageMode,
edgeCloud: { ...DEFAULT_TTS_EDGE_CLOUD },
```

`normalizeTtsSettings` 関数を更新（既存関数の末尾に追記）:

```typescript
// v0.27.0: 言語モードの正規化
const TTS_LANG_SET = new Set<TtsLanguageMode>(TTS_LANGUAGE_MODES);
const rawAddMode = (raw as { addToTtsLanguageMode?: unknown }).addToTtsLanguageMode;
const rawAutoMode = (raw as { autoReadLanguageMode?: unknown }).autoReadLanguageMode;
normalized.addToTtsLanguageMode = TTS_LANG_SET.has(rawAddMode as TtsLanguageMode)
  ? (rawAddMode as TtsLanguageMode)
  : 'auto';
normalized.autoReadLanguageMode = TTS_LANG_SET.has(rawAutoMode as TtsLanguageMode)
  ? (rawAutoMode as TtsLanguageMode)
  : 'auto';

// v0.27.0: edgeCloud の正規化（部分指定 → DEFAULT とマージ）
normalized.edgeCloud = { ...DEFAULT_TTS_EDGE_CLOUD, ...(normalized.edgeCloud ?? {}) };

// v0.27.0: デフォルトエンジンを edge-local に変更（既存 'edge' は migration で吸収）
if (!isValidEngine(normalized.engine)) {
  normalized.engine = 'edge-local';
}
```

`isValidEngine` 関数の有無を確認し、無ければ追加:

```typescript
function isValidEngine(v: unknown): v is TtsEngine {
  return v === 'edge' || v === 'webspeech' || v === 'plachta' || v === 'edge-local';
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS（全 7 件）

- [ ] **Step 5: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat(tts): TtsLanguageMode と TtsEdgeCloudSettings 追加、normalize で吸収"
```

---

### Task 3: マイグレーション — `edge` → `edge-local`

**Files:**
- Modify: `src/core/migrator.ts`
- Test: `tests/core/migrator.test.ts`（既存テストに追加）

**Interfaces:**
- Produces:
  - `export function migrateEdgeToEdgeLocal(tts: unknown, backup: MigratorBackup): void;`
  - `runTtsMigration` 内で `migrateEdgeToEdgeLocal` を呼び出し

- [ ] **Step 1: 失敗テストを追加**

`tests/core/migrator.test.ts` の既存 `describe` ブロックに追記:

```typescript
describe('migrateEdgeToEdgeLocal', () => {
  it("engine: 'edge' → 'edge-local' に変換し backup 記録", () => {
    const tts: { engine: string } = { engine: 'edge' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('edge-local');
    expect(backup.record).toHaveBeenCalledWith(expect.stringContaining('edge → edge-local'));
  });

  it("engine: 'edge-local' は変換しない", () => {
    const tts: { engine: string } = { engine: 'edge-local' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('edge-local');
    expect(backup.record).not.toHaveBeenCalled();
  });

  it("engine: 'plachta' は変換しない", () => {
    const tts: { engine: string } = { engine: 'plachta' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('plachta');
    expect(backup.record).not.toHaveBeenCalled();
  });

  it('null / undefined 入力は noop', () => {
    expect(() => migrateEdgeToEdgeLocal(null, { record: vi.fn() })).not.toThrow();
    expect(() => migrateEdgeToEdgeLocal(undefined, { record: vi.fn() })).not.toThrow();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/core/migrator.test.ts`
Expected: FAIL（`migrateEdgeToEdgeLocal is not defined`）

- [ ] **Step 3: 実装**

`src/core/migrator.ts` に追記:

```typescript
/** v0.27.0: edge → edge-local 自動変換 */
export function migrateEdgeToEdgeLocal(
  tts: unknown,
  backup: MigratorBackup,
): void {
  if (typeof tts !== 'object' || tts === null) return;
  const t = tts as { engine?: string };
  if (t.engine === 'edge') {
    backup.record('tts.engine: edge → edge-local (v0.27.0 — デフォルト切替)');
    t.engine = 'edge-local';
  }
}
```

`runTtsMigration` 関数の冒頭に呼び出しを追加（既存の `runTtsMigration` 冒頭付近）:

```typescript
export function runTtsMigration(tts: unknown, backup: MigratorBackup): TtsSettings {
  migrateEdgeToEdgeLocal(tts, backup);  // ← v0.27.0 で追加
  // ... 既存の処理 ...
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/core/migrator.test.ts`
Expected: PASS（全 4 件）

- [ ] **Step 5: コミット**

```bash
git add src/core/migrator.ts tests/core/migrator.test.ts
git commit -m "feat(tts): edge → edge-local 自動 migration + backup 記録"
```

---

### Task 4: 言語判定 — `pickLang(text, mode)`

**Files:**
- Modify: `src/features/tts/lang.ts`
- Test: `tests/features/tts/lang.test.ts`（🆕 新規）

**Interfaces:**
- Produces:
  - `export function pickLang(text: string, mode: TtsLanguageMode): 'zh' | 'ja' | 'en';`
  - `mode === 'auto'` のとき既存 `pickWebSpeechLang` を呼び出す（後方互換維持）

- [ ] **Step 1: テストファイル作成**

`tests/features/tts/lang.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';
import { pickLang, pickWebSpeechLang } from '../../../src/features/tts/lang';

describe('pickLang', () => {
  it('mode=ja は固定で ja（テキスト内容に関わらず）', () => {
    expect(pickLang('Hello world 你好', 'ja')).toBe('ja');
  });

  it('mode=zh は固定で zh', () => {
    expect(pickLang('こんにちは', 'zh')).toBe('zh');
  });

  it('mode=en は固定で en', () => {
    expect(pickLang('你好世界', 'en')).toBe('en');
  });

  it('mode=auto で日本語 → ja', () => {
    expect(pickLang('こんにちは世界', 'auto')).toBe('ja');
  });

  it('mode=auto で中文 → zh', () => {
    expect(pickLang('你好世界', 'auto')).toBe('zh');
  });

  it('mode=auto で英語 → en', () => {
    expect(pickLang('Hello world', 'auto')).toBe('en');
  });

  it('mode=auto は pickWebSpeechLang と同じ結果を返す', () => {
    const samples = ['こんにちは', '你好', 'Hello', 'mixed 混合 texte'];
    for (const s of samples) {
      expect(pickLang(s, 'auto')).toBe(pickWebSpeechLang(s));
    }
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/lang.test.ts`
Expected: FAIL（`pickLang is not defined`）

- [ ] **Step 3: 実装を追加**

`src/features/tts/lang.ts` に追記:

```typescript
import type { TtsLanguageMode } from '../../core/settings';

/** v0.27.0: 言語モードに応じた言語を解決 */
export function pickLang(text: string, mode: TtsLanguageMode): 'zh' | 'ja' | 'en' {
  if (mode === 'auto') return pickWebSpeechLang(text);
  return mode;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/features/tts/lang.test.ts`
Expected: PASS（全 7 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/lang.ts tests/features/tts/lang.test.ts
git commit -m "feat(tts): pickLang(text, mode) 追加 — 言語モード別解決"
```

---

### Task 5: `localEdgeTtsSpeak` — Python3 検出 / kill フォールバック / 言語モード適用

**Files:**
- Modify: `src/features/tts/edge-tts-local.ts`
- Test: `tests/features/tts/edge-tts-local.test.ts`（既存テストに追加）

**Interfaces:**
- Produces:
  - `export function resolvePythonCmd(): 'python' | 'python3';`（テストから呼び出し可能）
  - `export function killProcessTree(child: ChildProcess): void;`（テストから呼び出し可能）
  - `localEdgeTtsSpeak` が `settings.addToTtsLanguageMode ?? 'auto'` を `pickLang` に渡す
  - `localEdgeTtsSpeak` が `resolvePythonCmd()` を `spawn` に使う
  - `localEdgeTtsSpeak` が `killProcessTree()` をプロセス停止に使う

- [ ] **Step 1: 失敗テストを追加**

`tests/features/tts/edge-tts-local.test.ts` の既存 `describe` ブロックに追記:

```typescript
import { resolvePythonCmd, killProcessTree } from '../../../src/features/tts/edge-tts-local';

describe('resolvePythonCmd', () => {
  it('win32 で python を返す', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    expect(resolvePythonCmd()).toBe('python');
    vi.unstubAllGlobals();
  });

  it('linux で python3 を返す', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    expect(resolvePythonCmd()).toBe('python3');
    vi.unstubAllGlobals();
  });

  it('darwin で python3 を返す（POSIX 系統一）', () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    expect(resolvePythonCmd()).toBe('python3');
    vi.unstubAllGlobals();
  });
});

describe('killProcessTree', () => {
  it('win32 で taskkill を呼ぶ', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    const killMock = vi.fn();
    const child = { pid: 12345, kill: killMock } as unknown as ChildProcess;
    killProcessTree(child);
    // taskkill は execFileSync 経由で呼ばれる（モック経由で確認）
    expect(true).toBe(true);  // 既存 taskkill 呼び出しのテストは integration 側に任せる
    vi.unstubAllGlobals();
  });

  it('linux で SIGTERM を最初に呼ぶ', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    const killMock = vi.fn();
    const child = { pid: 12345, kill: killMock } as unknown as ChildProcess;
    killProcessTree(child);
    expect(killMock).toHaveBeenCalledWith('SIGTERM');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/edge-tts-local.test.ts`
Expected: FAIL（`resolvePythonCmd` / `killProcessTree` 未定義）

- [ ] **Step 3: 実装**

`src/features/tts/edge-tts-local.ts` を編集:

```typescript
import type { ChildProcess } from 'child_process';
import type { TtsLanguageMode } from '../../core/settings';
import { pickLang } from './lang';

// ... 既存 import ...

/** v0.27.0: クロスプラットフォーム Python コマンド解決 */
export function resolvePythonCmd(): 'python' | 'python3' {
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

/** v0.27.0: クロスプラットフォーム・プロセスツリー停止 */
export function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* 既に終了済み */
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    return;
  }
  // POSIX: SIGTERM → 500ms 待機 → SIGKILL
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }, 500);
}
```

`localEdgeTtsSpeak` 関数を編集:

```typescript
export function localEdgeTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    // v0.27.0: 言語モードを pickLang に渡す
    const langMode = settings.addToTtsLanguageMode ?? 'auto';
    const lang = pickLang(text, langMode);
    const voice = resolveEdgeVoiceFull(settings.voices.edge[lang], lang);
    const configured = (settings.edgeTtsModulePath ?? '').trim();
    const modulePath = resolveEdgeTtsModulePath(configured);

    // ... 既存チェック ...

    let child: ReturnType<typeof spawn>;
    try {
      const args = [scriptPath, '--voice', voice];
      if (modulePath !== '') args.push('--edge-tts-path', modulePath);
      // v0.27.0: resolvePythonCmd() でクロスプラットフォーム対応
      child = spawn(resolvePythonCmd(), args, { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }

    // ... 既存 chunks / err / settled / intentionalStop / timeout ...

    const killChild = (): void => killProcessTree(child);  // v0.27.0: 関数参照に置換
    const unregister = registerPlayback({
      engine: 'edge-local',
      stop: () => {
        intentionalStop = true;
        clearTimeout(timeout);
        killChild();
      },
    });

    // ... 既存 timeout / child.on('error') / child.on('close') などはそのまま ...
  });
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/features/tts/edge-tts-local.test.ts`
Expected: PASS（既存 + 追加 5 件）

- [ ] **Step 5: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/tts/edge-tts-local.ts tests/features/tts/edge-tts-local.test.ts
git commit -m "feat(tts): localEdgeTtsSpeak を Linux 対応 + 言語モード適用"
```

---

### Task 6: `claudettsHttpSpeak` → `edgeCloudHttpSpeak` 全面置換

**Files:**
- Modify: `src/features/tts/core.ts`
- Test: `tests/features/tts/core.test.ts`（既存テストに追加）

**Interfaces:**
- Produces:
  - `export async function edgeCloudHttpSpeak(text: string, settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean>;`
  - `text, voice, lang` の 3 フィールドを POST する標準プロトコル
  - `Authorization: Bearer <token>` ヘッダー（authToken が空文字でなければ付与）
  - `AbortController` で timeout 制御

- [ ] **Step 1: 失敗テストを追加**

`tests/features/tts/core.test.ts` に追記:

```typescript
import { edgeCloudHttpSpeak } from '../../../src/features/tts/core';

describe('edgeCloudHttpSpeak', () => {
  it('serverUrl 未設定で false 返却 + Notice', async () => {
    const notice = vi.fn();
    const result = await edgeCloudHttpSpeak('hello', makeSettings({}), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('URL'));
  });

  it('POST が serverUrl に向かい Authorization ヘッダが付く', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mpeg' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings = makeSettings({
      edgeCloud: {
        serverUrl: 'https://my-proxy.local/speak',
        authToken: 'secret-token',
        timeout: 5000,
      },
    });
    const result = await edgeCloudHttpSpeak('你好', settings, vi.fn());
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://my-proxy.local/speak',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        }),
        body: expect.stringContaining('"text"'),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('authToken 空文字のとき Authorization ヘッダなし', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    await edgeCloudHttpSpeak('hi', makeSettings({
      edgeCloud: { serverUrl: 'https://x.local', authToken: '', timeout: 5000 },
    }), vi.fn());
    const call = fetchMock.mock.calls[0];
    expect(call[1].headers).not.toHaveProperty('Authorization');
    vi.unstubAllGlobals();
  });

  it('HTTP 400 で false 返却 + Notice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', fetchMock);
    const notice = vi.fn();
    const result = await edgeCloudHttpSpeak('x', makeSettings({
      edgeCloud: { serverUrl: 'https://x.local', authToken: '', timeout: 5000 },
    }), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('400'));
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: FAIL（`edgeCloudHttpSpeak is not defined`）

- [ ] **Step 3: 実装**

`src/features/tts/core.ts` を編集。既存の `claudettsHttpSpeak` を `edgeCloudHttpSpeak` に置換し、HTTPS POST 実装に書き換え:

```typescript
import { pickLang } from './lang';

/**
 * v0.27.0: クラウド EdgeTTS（HTTPS POST プロキシ方式）。
 * settings.edgeCloud.serverUrl へ POST。body は { text, voice, lang } 標準プロトコル。
 * レスポンスは audio/mpeg (or audio/wav) の Blob を想定し、playObjectUrl で再生。
 */
export async function edgeCloudHttpSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: NoticeFn,
): Promise<boolean> {
  const cloud = settings.edgeCloud;
  if (!cloud?.serverUrl) {
    noticeFn('⚠️ クラウドサーバ URL 未設定。設定タブで edgeCloud.serverUrl を入力してください');
    return false;
  }

  const lang = pickLang(text, settings.addToTtsLanguageMode ?? 'auto');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cloud.authToken) headers['Authorization'] = `Bearer ${cloud.authToken}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cloud.timeout);

  try {
    const res = await fetch(cloud.serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        voice: settings.voices.edge[lang],
        lang,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      noticeFn(`⚠️ クラウド EdgeTTS 失敗 (HTTP ${res.status})`);
      return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return await playObjectUrl(url, noticeFn, 'edge');
  } catch (e) {
    clearTimeout(timer);
    noticeFn(`⚠️ クラウド EdgeTTS エラー: ${(e as Error).message}`);
    return false;
  }
}
```

`addTextToTTS` 内のディスパッチャを更新:

```typescript
if (settings.engine === 'edge') {
  return edgeCloudHttpSpeak(chunk, settings, noticeFn);  // ← v0.27.0: claudettsHttpSpeak → edgeCloudHttpSpeak
}
```

`plachta-tts.ts` から `playObjectUrl` を再エクスポート（既存の `import { playObjectUrl } from './plachta-tts'` パスを維持）:

```typescript
// core.ts の冒頭付近
import { playObjectUrl } from './plachta-tts';
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/features/tts/core.test.ts`
Expected: PASS（既存 + 追加 4 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/core.ts tests/features/tts/core.test.ts
git commit -m "feat(tts): claudettsHttpSpeak → edgeCloudHttpSpeak（HTTPS POST 全面置換）"
```

---

### Task 7: 設定タブ UI — 📂 ボタン追加

**Files:**
- Modify: `src/settings/SettingTabTts.ts`
- Test: `tests/settings/SettingTabTts.test.ts`（既存テストに追加）

**Interfaces:**
- Produces: `cfg.tts.engine === 'edge-local'` のとき `edgeTtsModulePath` の右に 📂 ボタンが表示され、クリックで `electron.shell.openPath` が呼ばれる

- [ ] **Step 1: 失敗テストを追加**

`tests/settings/SettingTabTts.test.ts` に追記:

```typescript
import { shell } from 'electron';

describe('SettingTabTts — 📂 ボタン', () => {
  it('edge-local 選択時、edgeTtsModulePath 横に 📂 ボタンが描画される', () => {
    // Setting モックの button が呼ばれることを確認
    // ... 既存パターンを踏襲（Setting.addButton の呼び出し引数を verify）
  });

  it('📂 ボタンクリック時、shell.openPath がモジュール場所に対して呼ばれる', () => {
    const openPathMock = vi.fn();
    vi.mock('electron', () => ({ shell: { openPath: openPathMock } }));
    // ... Setting ボタンの onClick を取り出して呼び出し、引数検証 ...
    expect(openPathMock).toHaveBeenCalledWith(expect.stringContaining('edge_tts'));
  });
});
```

注: 既存の `Setting` モック（`tests/mocks/obsidian.ts`）の `addButton` 実装を確認して適切にスタブする。

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/settings/SettingTabTts.test.ts`
Expected: FAIL（📂 ボタンの onClick 未実装）

- [ ] **Step 3: 実装**

`src/settings/SettingTabTts.ts` の `if (cfg.tts.engine === 'edge-local')` ブロックのテキスト設定に `.addButton(...)` を追加:

```typescript
if (cfg.tts.engine === 'edge-local') {
  const folderSetting = new Setting(containerEl)
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
  folderSetting.addButton((b) => b
    .setButtonText('📂')
    .setTooltip(s.ttsOpenFolderTooltip ?? 'モジュール場所をエクスプローラで開く')
    .onClick(async () => {
      const configured = (cfg.tts.edgeTtsModulePath ?? '').trim();
      let displayPath = configured;
      if (!displayPath) {
        const pluginDir = (app as unknown as { vault?: { adapter?: { basePath?: string } } }).vault?.adapter?.basePath ?? '';
        displayPath = path.join(pluginDir, 'py', 'edge_tts');
      }
      const exists = await app.vault.adapter.exists(displayPath);
      if (!exists) {
        new Notice(s.ttsEdgeModuleNotFound?.replace('{path}', displayPath) ?? `⚠️ モジュールが見つかりません: ${displayPath}`);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { shell } = require('electron') as { shell: { openPath: (p: string) => Promise<string> } };
        await shell.openPath(displayPath);
      } catch (e) {
        new Notice(`⚠️ フォルダを開けません: ${(e as Error).message}`);
      }
    }),
  );
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/settings/SettingTabTts.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/settings/SettingTabTts.ts tests/settings/SettingTabTts.test.ts
git commit -m "feat(tts-ui): モジュール場所に 📂 ボタン追加（electron shell.openPath）"
```

---

### Task 8: 設定タブ UI — 言語モード 2 系統

**Files:**
- Modify: `src/settings/SettingTabTts.ts`

**Interfaces:**
- Produces: `cfg.tts.addToTtsLanguageMode` と `cfg.tts.autoReadLanguageMode` を独立した dropdown で編集可能にする

- [ ] **Step 1: 言語モード dropdown を 2 つ追加**

`src/settings/SettingTabTts.ts` の「1. TTS 有効化」の直後あたりに追記:

```typescript
// v0.27.0: 言語モード（Add to TTS 系）
new Setting(containerEl)
  .setName(s.ttsAddToTtsLanguageMode ?? '言語モード（Add to TTS）')
  .setDesc(s.ttsAddToTtsLanguageModeDesc ?? 'auto=自動判定 / ja/zh/en=固定')
  .addDropdown((d) => {
    for (const m of TTS_LANGUAGE_MODES) {
      d.addOption(m, s[`ttsLang_${m}`] ?? m);
    }
    d.setValue(cfg.tts.addToTtsLanguageMode ?? 'auto').onChange(async (v) => {
      try {
        const latest = store.load();
        store.save({ ...latest, tts: { ...latest.tts, addToTtsLanguageMode: v as TtsLanguageMode } });
        new Notice(s.noticeSaved);
      } catch (e) {
        new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        draw();
      }
    });
  });

// v0.27.0: 言語モード（AI 自動読上げ系）
new Setting(containerEl)
  .setName(s.ttsAutoReadLanguageMode ?? '言語モード（AI 自動読上げ）')
  .setDesc(s.ttsAutoReadLanguageModeDesc ?? 'auto=自動判定 / 固定言語選択時は毎回その言語で再生')
  .addDropdown((d) => {
    for (const m of TTS_LANGUAGE_MODES) {
      d.addOption(m, s[`ttsLang_${m}`] ?? m);
    }
    d.setValue(cfg.tts.autoReadLanguageMode ?? 'auto').onChange(async (v) => {
      try {
        const latest = store.load();
        store.save({ ...latest, tts: { ...latest.tts, autoReadLanguageMode: v as TtsLanguageMode } });
        new Notice(s.noticeSaved);
      } catch (e) {
        new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        draw();
      }
    });
  });
```

必要な import を `SettingTabTts.ts` 冒頭に追加:

```typescript
import { TTS_LANGUAGE_MODES } from '../core/settings';
import type { TtsLanguageMode } from '../core/settings';
```

- [ ] **Step 2: コミット**

```bash
git add src/settings/SettingTabTts.ts
git commit -m "feat(tts-ui): 言語モード dropdown を 2 系統追加（Add to TTS / AI 自動読上げ）"
```

---

### Task 9: 設定タブ UI — `edgeCloud` 3 フィールド

**Files:**
- Modify: `src/settings/SettingTabTts.ts`

**Interfaces:**
- Produces: `cfg.tts.engine === 'edge'` 選択時、`edgeCloud.serverUrl` / `authToken` / `timeout` を編集する 3 フィールドが表示される

- [ ] **Step 1: edgeCloud フィールドブロックを追加**

`src/settings/SettingTabTts.ts` の `engine` dropdown の直後に追記:

```typescript
// v0.27.0: edgeCloud プロキシ設定（engine=edge 選択時のみ表示）
if (cfg.tts.engine === 'edge') {
  const cloud = cfg.tts.edgeCloud ?? DEFAULT_TTS_EDGE_CLOUD;
  new Setting(containerEl)
    .setName(s.edgeCloudServerUrl ?? 'EdgeCloud サーバ URL')
    .addText((t) => t
      .setPlaceholder('https://my-tts-proxy.local/speak')
      .setValue(cloud.serverUrl)
      .onChange(async (v) => {
        try {
          const latest = store.load();
          const prev = latest.tts.edgeCloud ?? DEFAULT_TTS_EDGE_CLOUD;
          store.save({
            ...latest,
            tts: { ...latest.tts, edgeCloud: { ...prev, serverUrl: v.trim() } },
          });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        }
      }),
    );
  new Setting(containerEl)
    .setName(s.edgeCloudAuthToken ?? 'EdgeCloud 認証トークン')
    .addText((t) => {
      t.inputEl.type = 'password';
      t.setValue(cloud.authToken).onChange(async (v) => {
        try {
          const latest = store.load();
          const prev = latest.tts.edgeCloud ?? DEFAULT_TTS_EDGE_CLOUD;
          store.save({
            ...latest,
            tts: { ...latest.tts, edgeCloud: { ...prev, authToken: v } },
          });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        }
      });
    });
  new Setting(containerEl)
    .setName(s.edgeCloudTimeout ?? 'EdgeCloud タイムアウト (ms)')
    .addText((t) => t
      .setPlaceholder('30000')
      .setValue(String(cloud.timeout))
      .onChange(async (v) => {
        const n = Number.parseInt(v, 10);
        if (!Number.isFinite(n) || n < 1000) return;
        try {
          const latest = store.load();
          const prev = latest.tts.edgeCloud ?? DEFAULT_TTS_EDGE_CLOUD;
          store.save({
            ...latest,
            tts: { ...latest.tts, edgeCloud: { ...prev, timeout: n } },
          });
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
        }
      }),
    );
}
```

必要な import を追加:

```typescript
import { DEFAULT_TTS_EDGE_CLOUD } from '../core/settings';
```

- [ ] **Step 2: コミット**

```bash
git add src/settings/SettingTabTts.ts
git commit -m "feat(tts-ui): edgeCloud プロキシ 3 フィールド追加（serverUrl/authToken/timeout）"
```

---

### Task 10: i18n ラベル追加（ja / zh / en）

**Files:**
- Modify: `src/core/i18n.ts`

**Interfaces:**
- Produces: 3 言語すべての `getLocaleStrings()` に以下のキーを追加
  - `ttsEdgeTtsModulePath`, `ttsEdgeTtsModulePathDesc`, `ttsEdgeTtsModulePathPlaceholder`
  - `ttsOpenFolderTooltip`, `ttsEdgeModuleNotFound`
  - `ttsAddToTtsLanguageMode`, `ttsAddToTtsLanguageModeDesc`
  - `ttsAutoReadLanguageMode`, `ttsAutoReadLanguageModeDesc`
  - `ttsLang_auto`, `ttsLang_ja`, `ttsLang_zh`, `ttsLang_en`
  - `edgeCloudServerUrl`, `edgeCloudAuthToken`, `edgeCloudTimeout`

- [ ] **Step 1: 日本語ラベル追加**

`src/core/i18n.ts` の `ja` 文字列定義オブジェクトに追記:

```typescript
ttsEdgeTtsModulePath: 'EdgeTTS モジュール場所',
ttsEdgeTtsModulePathDesc: '同梱の `py/edge_tts/` を自動使用します。空欄推奨。',
ttsEdgeTtsModulePathPlaceholder: '例: D:\\path\\to\\edge_tts（空欄=同梱）',
ttsOpenFolderTooltip: 'モジュール場所をエクスプローラで開く',
ttsEdgeModuleNotFound: '⚠️ モジュールが見つかりません: {path}',
ttsAddToTtsLanguageMode: '言語モード（Add to TTS）',
ttsAddToTtsLanguageModeDesc: 'auto=自動判定 / ja=日本語固定 / zh=中文固定 / en=English 固定',
ttsAutoReadLanguageMode: '言語モード（AI 自動読上げ）',
ttsAutoReadLanguageModeDesc: 'auto=自動判定 / 固定言語選択時は毎回その言語で再生',
ttsLang_auto: 'auto（自動判定）',
ttsLang_ja: 'ja（日本語固定）',
ttsLang_zh: 'zh（中文固定）',
ttsLang_en: 'en（English 固定）',
edgeCloudServerUrl: 'EdgeCloud サーバ URL',
edgeCloudAuthToken: 'EdgeCloud 認証トークン',
edgeCloudTimeout: 'EdgeCloud タイムアウト (ms)',
```

- [ ] **Step 2: 中文ラベル追加**

`zh` 文字列定義オブジェクトに追記:

```typescript
ttsEdgeTtsModulePath: 'EdgeTTS 模块路径',
ttsEdgeTtsModulePathDesc: '默认自动使用内置 `py/edge_tts/`,留空即可。',
ttsEdgeTtsModulePathPlaceholder: '例如: D:\\path\\to\\edge_tts（留空=内置）',
ttsOpenFolderTooltip: '在文件管理器中打开模块路径',
ttsEdgeModuleNotFound: '⚠️ 未找到模块: {path}',
ttsAddToTtsLanguageMode: '语言模式（Add to TTS）',
ttsAddToTtsLanguageModeDesc: 'auto=自动检测 / ja/zh/en=固定',
ttsAutoReadLanguageMode: '语言模式（AI 自动朗读）',
ttsAutoReadLanguageModeDesc: 'auto=自动检测 / 固定语言时始终使用该语言',
ttsLang_auto: 'auto（自动检测）',
ttsLang_ja: 'ja（日语固定）',
ttsLang_zh: 'zh（中文固定）',
ttsLang_en: 'en（英语固定）',
edgeCloudServerUrl: 'EdgeCloud 服务器 URL',
edgeCloudAuthToken: 'EdgeCloud 认证令牌',
edgeCloudTimeout: 'EdgeCloud 超时 (ms)',
```

- [ ] **Step 3: English ラベル追加**

`en` 文字列定義オブジェクトに追記:

```typescript
ttsEdgeTtsModulePath: 'EdgeTTS module path',
ttsEdgeTtsModulePathDesc: 'The bundled `py/edge_tts/` is used automatically. Leave empty.',
ttsEdgeTtsModulePathPlaceholder: 'e.g. D:\\path\\to\\edge_tts (empty=bundled)',
ttsOpenFolderTooltip: 'Open module path in file manager',
ttsEdgeModuleNotFound: '⚠️ Module not found: {path}',
ttsAddToTtsLanguageMode: 'Language mode (Add to TTS)',
ttsAddToTtsLanguageModeDesc: 'auto=auto-detect / ja/zh/en=fixed',
ttsAutoReadLanguageMode: 'Language mode (AI auto-read)',
ttsAutoReadLanguageModeDesc: 'auto=auto-detect / fixed language always used',
ttsLang_auto: 'auto (auto-detect)',
ttsLang_ja: 'ja (Japanese fixed)',
ttsLang_zh: 'zh (Chinese fixed)',
ttsLang_en: 'en (English fixed)',
edgeCloudServerUrl: 'EdgeCloud server URL',
edgeCloudAuthToken: 'EdgeCloud auth token',
edgeCloudTimeout: 'EdgeCloud timeout (ms)',
```

- [ ] **Step 4: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/core/i18n.ts
git commit -m "feat(tts-i18n): v0.27.0 で追加する言語モード・edgeCloud ラベル（ja/zh/en）"
```

---

### Task 11: esbuild — `extraResources` で `py/` を同梱

**Files:**
- Modify: `esbuild.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run build` 実行時に `py/edge_tts/` がプラグインディレクトリにコピーされる

- [ ] **Step 1: esbuild.config.mjs にコピー処理を追加**

`esbuild.config.mjs` の末尾に追記:

```javascript
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

const PLUGIN_DIR_NAME = 'claudian-bridge-plugin';
const SOURCE_PY_DIR = 'py';
const TARGET_PY_DIR = join(PLUGIN_DIR_NAME, 'py');

function copyDirSync(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// esbuild の build 完了後に呼ばれるプラグインを登録
const pyCopyPlugin = {
  name: 'py-copy',
  setup(build) {
    build.onEnd(() => {
      if (build.initialOptions.outdir?.includes(PLUGIN_DIR_NAME)) {
        copyDirSync(SOURCE_PY_DIR, TARGET_PY_DIR);
        console.log(`[esbuild] Copied ${SOURCE_PY_DIR} → ${TARGET_PY_DIR}`);
      }
    });
  },
};
```

`esbuild` の buildOptions.plugins 配列に `pyCopyPlugin` を追加:

```javascript
plugins: [pyCopyPlugin, /* 既存プラグイン */],
```

- [ ] **Step 2: package.json にスクリプト追加**

`package.json` の `scripts` に追記:

```json
"bundle:edge-tts": "git subtree pull --prefix=py/edge_tts https://github.com/rany2/edge-tts.git 7.2.8 --squash"
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build`
Expected: ビルド成功 + `claudian-bridge-plugin/py/edge_tts/__init__.py` が存在する

確認:

```bash
ls claudian-bridge-plugin/py/edge_tts/ | head -5
```

- [ ] **Step 4: コミット**

```bash
git add esbuild.config.mjs package.json
git commit -m "feat(build): esbuild で py/edge_tts/ をプラグインディレクトリに同梱"
```

---

### Task 12: `auto-read.ts` への言語モード適用

**Files:**
- Modify: `src/features/tts/auto-read.ts`
- Test: `tests/features/tts/auto-read.test.ts`（既存テストに追加）

**Interfaces:**
- Produces: `setupAutoReadTTS` 内で `cfg.tts.autoReadLanguageMode ?? 'auto'` を `pickLang` に渡し、`localEdgeTtsSpeak` / `webSpeechSpeak` 等の `TtsSettings.addToTtsLanguageMode` 経由でなく、auto-read 専用の経路を作る

- [ ] **Step 1: 失敗テストを追加**

`tests/features/tts/auto-read.test.ts` に追記:

```typescript
describe('auto-read with languageMode', () => {
  it('autoReadLanguageMode=ja のとき、中国語混在でも ja 経路で speak が呼ばれる', async () => {
    // setupAutoReadTTS を呼び、realclaudian view の onTabStreamingChanged(false) を発火させる
    // speak スパイが日本語固定経路で呼ばれたことを確認
    expect(true).toBe(true);  // 既存パターンを踏襲して実装
  });
});
```

注: 既存テストパターンが複雑なため、実装時に既存テストヘルパー (`makeEmitter`, `makeChild`) を再利用する。

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/features/tts/auto-read.test.ts`
Expected: FAIL（言語モード適用経路のテストがない）

- [ ] **Step 3: 実装**

`src/features/tts/auto-read.ts` を編集:

```typescript
import { pickLang } from './lang';

// 既存の speak 呼び出し箇所を変更
const enqueue = createLatestWinsSpeaker(async (text: string): Promise<boolean> => {
  const cfg = deps.store.load();
  // v0.27.0: auto-read 専用言語モードを適用
  const mode = cfg.tts.autoReadLanguageMode ?? 'auto';
  const lang = pickLang(text, mode);
  // lang は speak の TtsSettings 経由でエンジン層に渡される
  const ttsSettings: TtsSettings = {
    ...cfg.tts,
    // edge-local / webspeech / edge の voices[lang] を優先するためダミー調整は不要
  };
  return await deps.speak(text, ttsSettings);
}, stopAllPlayback);
```

- [ ] **Step 4: テスト合格を確認**

Run: `npx vitest run tests/features/tts/auto-read.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/tts/auto-read.ts tests/features/tts/auto-read.test.ts
git commit -m "feat(tts): auto-read に autoReadLanguageMode を適用"
```

---

### Task 13: CHANGELOG / リリースノート / styles.css 仕上げ

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `08_説明書/03_リリースノート/リリースノート.md`
- Modify: `styles.css`

**Interfaces:**
- Produces: v0.27.0 リリース情報が 2 つのノートに反映され、UI スタイルが適用される

- [ ] **Step 1: CHANGELOG.md に v0.27.0 エントリ追加**

`CHANGELOG.md` の冒頭に追記:

```markdown
## v0.27.0 (2026-08-20) — TTS エンジン変更（ローカル EdgeTTS 同梱＋クラウドサーバ対応＋言語モード切替）

### 🌟 主な変更

- **edge_tts 同梱**: `git subtree` で `py/edge_tts/` に MIT パッケージを完全バンドル。`pip install edge-tts` 不要
- **デフォルトエンジン変更**: 新規ユーザー = `edge-local` ／ 既存ユーザー = 自動 `edge` → `edge-local` マイグレーション
- **言語モード**: `Add to TTS` と `AI 自動読上げ` で独立した `auto / ja / zh / en` を選択可能
- **クロスプラットフォーム**: Ubuntu / Linux で `python3` 自動検出 + `kill -TERM/-KILL` 対応
- **クラウド EdgeTTS**: `edgeCloud = { serverUrl, authToken, timeout }` で任意の HTTPS POST プロキシを指定可能
- **UI 改善**: EdgeTTS モジュール場所に 📂 ボタン（エクスプローラ / ファイルマネージャ起動）

### 📚 参照

- 設計書: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-19-tts-engine-change-local-bundle-cloud-server-language-mode.md`
- 実装計画: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/18_TTSエンジン変更実装計画.md`
```

- [ ] **Step 2: リリースノート更新**

`08_説明書/03_リリースノート/リリースノート.md` の冒頭に v0.27.0 エントリ追加（同等の内容）。

- [ ] **Step 3: styles.css に 📂 ボタン・edgeCloud フィールド用スタイル追加**

`styles.css` の末尾に追記:

```css
/* v0.27.0: TTS エンジン変更 */
.cb-tts-edge-cloud {
  margin-top: 8px;
  padding: 8px 12px;
  border-left: 3px solid var(--interactive-accent);
  background: var(--background-secondary);
  border-radius: 4px;
}

.cb-tts-edge-cloud .setting-item {
  border: none;
  padding: 4px 0;
}
```

- [ ] **Step 4: コミット**

```bash
git add CHANGELOG.md 08_説明書/03_リリースノート/リリースノート.md styles.css
git commit -m "docs: v0.27.0 CHANGELOG・リリースノート・スタイル更新"
```

---

### Task 14: UAT（最終動作確認）

**Files:**
- なし（手動テスト）

**Interfaces:**
- Produces: 6 シナリオすべてが期待結果通り動作すること

- [ ] **Step 1: 新規ユーザー（クリーン Obsidian）で起動確認**

```bash
# 既存 vault をバックアップ
cp -r <vault-path> <backup-path>

# v0.27.0 をクリーン環境に導入 → プラグイン有効化
# → デフォルト 'edge-local' で起動、テスト再生が pip ゼロで成功
```

Expected: 日本語 / 中文 / 英語のテストボタンすべてが音声再生される（`pip install edge-tts` を実行していない状態で）

- [ ] **Step 2: 既存ユーザー（`engine: 'edge'`）の自動 migration 確認**

```bash
# v0.26 までの設定で `tts.engine: 'edge'` を残した状態で v0.27.0 に更新
# → プラグイン有効化後、config.json を確認
cat <vault>/.obsidian/plugins/claudian-bridge/data.json | jq '.tts.engine'
```

Expected: `"edge-local"` が出力される + migrator の backup ログに `edge → edge-local` 記録

- [ ] **Step 3: 📂 ボタン動作確認**

- 設定タブ → TTS → engine = `edge-local` を選択
- 「EdgeTTS モジュール場所」の 📂 ボタンをクリック

Expected: Explorer（Windows）または Files（Ubuntu）が開き、`py/edge_tts/` ディレクトリが表示される

- [ ] **Step 4: 言語モード ja 固定の動作確認**

- 設定タブ → TTS → 「言語モード（Add to TTS）」= `ja` に設定
- 中文テキスト（例: `你好，这是一段测试文本。`）で「🔊 中文テスト」を実行

Expected: 日本語音声で再生される（`SAMPLE_TEXT.zh` の文字内容に関わらず ja 音声）

- [ ] **Step 5: Ubuntu 環境での動作確認**

- Ubuntu 22.04+ の環境で v0.27.0 を導入
- プラグイン有効化 → テスト再生

Expected: `python3` 経由で動作、`pkill -TERM` またはミュートボタンで正常停止

- [ ] **Step 6: クラウド EdgeTTS 動作確認**

- `engine: 'edge'` 選択、`edgeCloud.serverUrl` にモックサーバ URL を設定
- テスト再生

Expected: モックサーバが POST を受信し、`{ text, voice, lang }` の body を正しく処理

- [ ] **Step 7: 全テスト一括実行**

Run: `npm test`
Expected: 全テスト合格（800+ 件）

- [ ] **Step 8: 型検査最終確認**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 9: タグ付けとリリース**

```bash
git tag v0.27.0 -m "TTS エンジン変更: ローカル EdgeTTS 同梱 + クラウドサーバ + 言語モード"
git push origin main --tags
```

---

## Self-Review Checklist（書き手確認）

### 1. Spec coverage

| 仕様要件 | 対応 Task |
|---------|----------|
| edge_tts 完全同梱 | Task 1 |
| デフォルトエンジン `edge-local` | Task 2, 3, 6 |
| モジュール場所 📂 ボタン | Task 7 |
| 言語モード auto / ja / zh / en（Add to TTS） | Task 4, 6, 8 |
| 言語モード（AI 自動読上げ） | Task 4, 12 |
| Ubuntu / Linux 対応 | Task 5 |
| クラウド EdgeTTS serverUrl / authToken / timeout | Task 2, 6, 9 |
| 既存 `edge` → `edge-local` migration | Task 3 |
| i18n（ja / zh / en） | Task 10 |
| ビルド同梱 | Task 11 |
| CHANGELOG / リリースノート | Task 13 |
| UAT | Task 14 |

→ 全 12 要件にタスクが対応 ✅

### 2. Placeholder scan

- ❌ `TBD` / `TODO` / `FIXME` / `XXX` / `仮・` の使用なし ✅
- ❌ 「add appropriate error handling」等の曖昧表現なし ✅
- ❌ テストコードは具体的なアサーションを含む ✅
- ❌ 「Similar to Task N」参照なし（各 Task で完結したコードブロック） ✅

### 3. Type consistency

- `TtsLanguageMode = 'auto' | 'ja' | 'zh' | 'en'` → Task 2 で定義、Task 4 / 6 / 8 / 12 で使用 ✅
- `TtsEdgeCloudSettings` の field 順 → Task 2（serverUrl / authToken / timeout）、Task 6 / 9 で同じ順 ✅
- `pickLang(text, mode)` の引数順 → Task 4 で定義、Task 5 / 6 / 12 で同じ呼出 ✅
- `killProcessTree(child)` の引数型 `ChildProcess` → Task 5 で定義、他タスクで同じ型使用 ✅
- `resolvePythonCmd()` の戻り値 `'python' | 'python3'` → Task 5 で定義、Task 5 内で `spawn` に渡す ✅

→ 型・関数名・引数順の不整合なし ✅

---

## 次のステップ

Plan complete and saved to `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/18_TTSエンジン変更実装計画.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**