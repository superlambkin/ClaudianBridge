// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * v0.32.6 統合 E2E: 「MD Add to TTS → チャンク進行 → amber 下線 span が
 * Preview DOM に生成・移動する」チェーン全体を実装モジュールのみで検証する。
 * モックは Obsidian API（Notice / workspace / vault）と TTS エンジン入口
 * （addTextToTTS）のみで、F-028 の実ロジック（flow / runtime / state /
 * setup subscriber / preview-renderer / match）はすべて実物を使う。
 */

const { mockAddTextToTTS } = vi.hoisted(() => ({
  mockAddTextToTTS: vi.fn(),
}));

const { mockRunPrompt } = vi.hoisted(() => ({
  mockRunPrompt: vi.fn(),
}));

// v0.37.2: Notice の hide() / setMessage() 呼び出し追跡（progress.hide() 漏れ検証用）
const { mockNoticeHide, mockNoticeSetMessage } = vi.hoisted(() => ({
  mockNoticeHide: vi.fn(),
  mockNoticeSetMessage: vi.fn(),
}));

vi.mock('obsidian', () => ({
  Notice: vi.fn().mockImplementation(() => ({
    hide: mockNoticeHide,
    setMessage: mockNoticeSetMessage,
  })),
}));
vi.mock('../../../../src/features/llm/claude-cli', () => ({
  runClaudePrompt: (...args: unknown[]) => (mockRunPrompt as unknown as (...a: unknown[]) => Promise<string | null>)(...args),
}));
vi.mock('../../../../src/features/tts/core', () => ({
  addTextToTTS: (...a: unknown[]) => (mockAddTextToTTS as unknown as (...args: unknown[]) => Promise<boolean>)(...a),
  SAMPLE_TEXT: { zh: '', ja: '', en: '' },
  voicesFor: () => '',
}));

import { addMdToTts } from '../../../../src/features/tts/md-file-read-flow';
import { setupMdReadHighlight } from '../../../../src/features/tts/md-read-highlight/setup';
import {
  mdReadState,
  __resetMdReadSubscribersForTesting,
} from '../../../../src/features/tts/md-read-highlight/state';
import { chunkText } from '../../../../src/features/tts/chunking';
import { filterSpeechText } from '../../../../src/features/tts/speech-filter';
import { extractMdText } from '../../../../src/features/tts/md-file-read';

const MD_CONTENT = [
  '# 大見出し',
  '最初の段落です。これは冒頭テキストです。',
  '## サブ見出し',
  '二番目の段落。こちらは後半のテキストです。',
].join('\n');

function makeApp(container: HTMLElement, mdContent: string = MD_CONTENT) {
  const view = {
    file: { path: '/a.md' },
    previewMode: { containerEl: container },
    getMode: () => 'preview',
    setState: vi.fn(),
  };
  return {
    app: {
      workspace: {
        openLinkText: vi.fn().mockResolvedValue(undefined),
        setActiveLeaf: vi.fn(),
        getLeavesOfType: vi.fn((t: string) => (t === 'markdown' ? [{ view }] : [])),
        on: vi.fn().mockReturnValue({}),
        offref: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue({ path: '/a.md' }),
        cachedRead: vi.fn().mockResolvedValue(mdContent),
      },
    } as never,
    view,
  };
}

function makeCfg() {
  return {
    tts: {
      enabled: true,
      engine: 'edge' as const,
      chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
      speechFilter: {
        selection: { code: false, callout: false, table: false, emoji: false, kaomoji: false, ascii: false, shortcode: false },
        autoRead: { code: false, callout: false, table: false, emoji: false, kaomoji: false, ascii: false, shortcode: false },
        message: { code: false, callout: false, table: false, emoji: false, kaomoji: false, ascii: false, shortcode: false },
        inputAi: { code: false, callout: false, table: false, emoji: false, kaomoji: false, ascii: false, shortcode: false },
      },
      mdReadHighlight: { enabled: true, highlightColor: '' },
    },
  } as never;
}

describe('E2E: Add to TTS → amber 下線が付き、チャンク進行で移動する（v0.32.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    // 実 TTS: 受信テキストを実際の chunkText（core.ts と同一ロジック）で分割し、
    // 各チャンク開始 hook を呼び出して成功を返す
    mockAddTextToTTS.mockImplementation(
      async (_app: unknown, text: string, _settings: unknown, onChunkStart?: (i: number) => void) => {
        const chunks = chunkText(text, 500);
        if (onChunkStart) chunks.forEach((_, i) => onChunkStart(i));
        return true;
      },
    );
  });

  it('チェーン全体で is-active 下線 span が生成され、最終チャンクに到達する', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>大見出し</h1><p>最初の段落です。これは冒頭テキストです。</p><h2>サブ見出し</h2><p>二番目の段落。こちらは後半のテキストです。</p>';
    document.body.appendChild(container);
    const { app } = makeApp(container, MD_CONTENT);

    // 実チェーン: subscriber 登録 → addMdToTts（内部で register + chunk hook）
    setupMdReadHighlight(app, {} as never);
    const ok = await addMdToTts(app, { path: '/a.md', extension: 'md' }, makeCfg());
    expect(ok).toBe(true);

    // 登録チャンク数と最終 active が整合（v0.32.9: TTS と同一分割）
    expect(mdReadState.get()).not.toBeNull();
    const total = mdReadState.get()!.chunks.length;
    expect(total).toBeGreaterThanOrEqual(1);

    // 最終チャンクが active: 下線 span が存在する
    // （anchor はチャンク先頭 24 正規化文字なので、短文 1 チャンクでは
    //   冒頭部分「大見出し 最初の段落…」に下線が付く）
    const active = container.querySelectorAll('.cb-md-read-chunk.is-active');
    expect(active.length).toBeGreaterThanOrEqual(1);
    const joined = Array.from(active).map((el) => el.textContent).join('');
    expect(joined).toContain('大見出し');

    // overlay が document.body に存在（下中央ボタン群）
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();
    // 進捗が N/N で最終チャンクを示す
    expect(document.body.querySelector('[data-cb-md-read-progress]')!.textContent).toBe(`${total}/${total}`);
  });

  it('v0.37.1: ファイル名読みは廃止し、本文から直接読み上げる', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>大見出し</h1><p>本文です。</p>';
    document.body.appendChild(container);
    const { app } = makeApp(container, '# 大見出し\n本文です。');

    setupMdReadHighlight(app, {} as never);
    await addMdToTts(app, { path: '/a.md', extension: 'md' }, makeCfg());

    const calls = mockAddTextToTTS.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toContain('大見出し');
  });

  it('v0.32.9: 登録 chunks は TTS と同一の chunkText 分割と一致する（マルチチャンク整合）', async () => {
    // 長文 MD（500 字超）で chunkText 分割との一致を検証
    const longParagraph = 'これは長い文です。'.repeat(60); // 540 字
    const longMd = `# 長文テスト\n${longParagraph}\n${longParagraph}`;
    const container = document.createElement('div');
    container.innerHTML = `<h1>長文テスト</h1><p>${longParagraph}</p><p>${longParagraph}</p>`;
    document.body.appendChild(container);
    const { app } = makeApp(container, longMd);

    setupMdReadHighlight(app, {} as never);
    await addMdToTts(app, { path: '/a.md', extension: 'md' }, makeCfg());

    // TTS 側（core.ts と同一ロジック）の分割結果を再現
    const filter = { code: false, callout: false, table: false, emoji: false, kaomoji: false, ascii: false, shortcode: false };
    // extractMdText の正規化後テキストを再現（見出しの # は除去されるが
    // 見出しテキスト「長文テスト」自体は本文に残る）
    const normalized = `長文テスト\n${longParagraph}\n${longParagraph}`;
    const expected = chunkText(filterSpeechText(normalized, filter), 500);

    const state = mdReadState.get()!;
    expect(state.chunks.length).toBe(expected.length);
    expect(state.chunks.map((c) => c.text)).toEqual(expected);
  });

  it('styles.css は is-active に amber 下線を定義している（背景色ではなく下線）', () => {
    // リポジトリの styles.css を直接読み、amber 下線ルールの存在を検証
    const cssPath = path.resolve(__dirname, '../../../../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = css.match(/\.cb-md-read-chunk\.is-active\s*\{[^}]+\}/);
    expect(rule).not.toBeNull();
    const body = rule![0];
    expect(body).toContain('text-decoration: underline');
    // amber 既定色（--cb-md-read-highlight のフォールバック #ffb300）
    expect(body).toContain('#ffb300');
    // 背景色は透明（下線方式のため）
    expect(body).toContain('background-color: transparent');
  });
});

describe('E2E: 聴き手プロファイル変換 (v0.36.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockAddTextToTTS.mockImplementation(
      async (_app: unknown, _text: string, _settings: unknown, onChunkStart?: (i: number) => void) => {
        onChunkStart?.(0);
        return true;
      },
    );
  });

  it('workplace プロファイル設定で略語が展開されて読み上げられる', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>API テスト</h1><p>API を使う。</p>';
    document.body.appendChild(container);
    const { app } = makeApp(container, '# API テスト\nAPI を使う。');

    setupMdReadHighlight(app, {} as never);
    const cfg = makeCfg();
    const c = cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } };
    c.tts.mdReadProfile = 'workplace';
    c.tts.llmRewriteCache = false;
    mockRunPrompt.mockResolvedValue(null); // LLM 失敗 → トークンフォールバック
    const result = await addMdToTts(app, { path: '/a.md', extension: 'md' }, cfg);
    expect(result).toBe(true);
    // 変換後本文（API がカタカナ展開される）
    const calls = mockAddTextToTTS.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toContain('エー ピー アイ');
  });

  it('original（既定）では変換されない', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>API テスト</h1><p>API を使う。</p>';
    document.body.appendChild(container);
    const { app } = makeApp(container, '# API テスト\nAPI を使う。');

    setupMdReadHighlight(app, {} as never);
    await addMdToTts(app, { path: '/a.md', extension: 'md' }, makeCfg());
    const calls = mockAddTextToTTS.mock.calls;
    expect(calls[0][1]).toContain('API');
    expect(calls[0][1]).not.toContain('エー ピー アイ');
  });
});

describe('E2E: LLM 原稿書き換え (v0.37.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockRunPrompt.mockResolvedValue('書き換え済みセクション');
    mockAddTextToTTS.mockImplementation(async () => true);
  });

  it('非 original でセクションごとに LLM 原稿が読まれ、見出し単位で粗ハイライト', async () => {
    const md = '# H1\n本文A。\n## H2\n本文B。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文A。</p><h2>H2</h2><p>本文B。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };
    const cfg = makeCfg();
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.mdReadProfile = 'boss';
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    const ok = await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);

    expect(ok).toBe(true);
    // 2 セクション = LLM 呼び出し 2 回
    expect(mockRunPrompt).toHaveBeenCalledTimes(2);
    // 各セクション本文が読み上げられる（ファイル名読みは廃止）
    const calls = mockAddTextToTTS.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][1]).toContain('書き換え済みセクション');
    // 粗ハイライト: セクション数だけ chunk 登録・最後に H2 を activeIdx
    const state = mdReadState.get();
    expect(state).not.toBeNull();
    expect(state!.chunks.length).toBe(2);
    expect(state!.chunks[1].anchor).toContain('H2');
    expect(state!.activeIdx).toBe(1);
  });

  it('LLM 失敗時はトークン変換へフォールバック（workplace 略語展開）', async () => {
    mockRunPrompt.mockResolvedValue(null);
    const md = '# API テスト\nAPI を使う。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>API テスト</h1><p>API を使う。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };
    const cfg = makeCfg();
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.mdReadProfile = 'workplace';
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);

    const calls = mockAddTextToTTS.mock.calls;
    expect(calls[0][1]).toContain('エー ピー アイ');
  });
});

describe('E2E: LLM 修正回帰 (v0.37.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockRunPrompt.mockResolvedValue('rew');
    mockAddTextToTTS.mockImplementation(async () => true);
  });

  function cfgWith(profile: string, cache: boolean) {
    const cfg = makeCfg();
    const t = cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } };
    t.tts.mdReadProfile = profile;
    t.tts.llmRewriteCache = cache;
    return cfg;
  }

  it('空（見出しのみ）セクションは LLM に渡さない', async () => {
    const md = '# A\n## B\n# C\n本文C。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>A</h1><h2>B</h2><h1>C</h1><p>本文C。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };

    setupMdReadHighlight(app as never, {} as never);
    await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfgWith('boss', false));

    expect(mockRunPrompt).toHaveBeenCalledTimes(1); // C のみ
    const state = mdReadState.get();
    expect(state!.chunks.length).toBe(1);
    expect(state!.chunks[0].heading ?? '').toBe('');
  });

  it('キャッシュヒット時は LLM を呼ばずキャッシュ原稿を読む', async () => {
    // 実キャッシュを用意
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-llm-cache-hit-'));
    const md = '# H1\n本文A。\n## H2\n本文B。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文A。</p><h2>H2</h2><p>本文B。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => tmp };

    const { rewriteCacheKey, RewriteCache } = await import('../../../../src/features/tts/llm-rewrite-cache');
    const cacheDir = `${tmp}/.obsidian-test/plugins/ClaudianBridge`;
    fs.mkdirSync(cacheDir, { recursive: true });
    const cache = new RewriteCache(cacheDir);
    await cache.put(rewriteCacheKey('/a.md', md, 'boss'), JSON.stringify(['cached1', 'cached2']));

    setupMdReadHighlight(app as never, {} as never);
    await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfgWith('boss', true));

    expect(mockRunPrompt).not.toHaveBeenCalled();
    const calls = mockAddTextToTTS.mock.calls;
    expect(calls[0][1]).toContain('cached1');
    expect(calls[1][1]).toContain('cached2');
  });
});

describe('E2E: LLM ストリーミング (v0.37.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockAddTextToTTS.mockImplementation(async () => true);
  });

  it('全セクション生成完了を待たず、先頭セクションから読上げを開始する', async () => {
    const md = '# H1\n本文A。\n## H2\n本文B。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文A。</p><h2>H2</h2><p>本文B。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };

    let releaseH2: (() => void) | null = null;
    const gate = new Promise<void>((r) => { releaseH2 = r; });
    mockRunPrompt.mockImplementation(async (p: string) => {
      if (p.includes('H2')) await gate; // H2 は H1 読み上げ開始まで生成を保留
      return 'rew';
    });
    const cfg = makeCfg();
    const c = cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } };
    c.tts.mdReadProfile = 'boss';
    c.tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    const running = addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);
    // 先頭セクション（rew）の読上げ開始を待つ = H2 生成がまだ完了していない段階
    await vi.waitFor(() => {
      const texts = mockAddTextToTTS.mock.calls.map((x) => String(x[1]));
      expect(texts.some((t) => t.includes('rew'))).toBe(true);
    });
    releaseH2!();
    const ok = await running;
    expect(ok).toBe(true);
    expect(mockRunPrompt).toHaveBeenCalledTimes(2);
  });
});

describe('E2E: 変換文の読上げ最適化仕上げ (v0.37.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockAddTextToTTS.mockImplementation(async () => true);
  });

  it('LLM 変換文から強調記号・スラッシュが除かれ原稿として読まれる', async () => {
    const md = '# H1\n本文です。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文です。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };
    mockRunPrompt.mockResolvedValue('**太字** 本文 / です。');
    const cfg = makeCfg();
    const c = cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } };
    c.tts.mdReadProfile = 'boss';
    c.tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);

    const texts = mockAddTextToTTS.mock.calls.map((x) => String(x[1]));
    const read = texts.find((t) => t.includes('太字'));
    expect(read).toBeDefined();
    expect(read).not.toContain('**');
    expect(read).not.toContain('/');
  });
});

// v0.37.2: 「チャンク2（3 番目）の読上げ中に下線が消失する」バグ再現
// 仮説: register 時 activeIdx=-1 だが、subscriber の lastHighlightIdx=-1 ガードで
// 早期リターン → スクロールリセットや view 取得タイミングが後続チャンクで崩れる。
describe('E2E: 多チャンク (3+) ハイライト回帰 (v0.37.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
    mockAddTextToTTS.mockImplementation(async () => true);
    mockRunPrompt.mockResolvedValue('rew');
  });

  it('3 セクション LLM: 各 setActiveIdx 呼び出し時点で該当 chunk に下線が付く', async () => {
    const md = '# H1\n本文A。\n## H2\n本文B。\n## H3\n本文C。';
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文A。</p><h2>H2</h2><p>本文B。</p><h3>H3</h3><p>本文C。</p>';
    document.body.appendChild(container);
    const built = makeApp(container, md);
    const app = built.app as { vault: { configDir?: string; adapter?: unknown } & Record<string, unknown> } & Record<string, unknown>;
    app.vault.configDir = '.obsidian-test';
    app.vault.adapter = { getBasePath: () => os.tmpdir() };
    const cfg = makeCfg();
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.mdReadProfile = 'boss';
    (cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } }).tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    const ok = await addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);
    expect(ok).toBe(true);

    // 最終チャンク (index=2) に下線がある
    const state = mdReadState.get()!;
    expect(state.chunks.length).toBe(3);
    expect(state.activeIdx).toBe(2);
    const active = container.querySelectorAll('.cb-md-read-chunk.is-active');
    expect(active.length).toBeGreaterThanOrEqual(1);
    // chunk 2 のテキスト「本文C」がハイライト範囲に含まれている
    const joined = Array.from(active).map((el) => el.textContent ?? '').join('');
    expect(joined).toContain('本文C');
    // chunk 0/1 のテキスト（本文A、本文B）は下線範囲に含まれない
    expect(joined).not.toContain('本文A');
    expect(joined).not.toContain('本文B');
  });
});

// v0.37.2: 全セクション生成完了時点（onProgress X/X）でも progress Notice は
// hide されないと、「📝 原稿生成中 10/10」が読上げ完了まで残ってしまう。
// （readSection → speakText → addTextToTTS の await が終わるまで while loop を
//  出ないため、生成完了 ≠ 読上げ完了 で Notice が居座る）
describe('E2E: 原稿生成完了時点の progress Notice クリーンアップ (v0.37.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
  });

  it('全セクション生成完了時（setMessage X/X）でも progress Notice は hide される（読上げ完了を待たない）', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文A。</p><h2>H2</h2><p>本文B。</p>';
    document.body.appendChild(container);
    const mdContent = '# H1\n本文A。\n## H2\n本文B。';
    const { app } = makeApp(container, mdContent);

    // LLM プロンプトは即座に resolve（生成は速い）
    mockRunPrompt.mockResolvedValue('rew');

    // 読上げ（addTextToTTS）は永続的に hang させる（最初のセクション以降に進まない）
    let releaseAudio: (() => void) | null = null;
    const audioGate = new Promise<void>((r) => { releaseAudio = r; });
    mockAddTextToTTS.mockImplementation(async () => {
      await audioGate;
      return true;
    });

    const cfg = makeCfg();
    const c = cfg as { tts: { mdReadProfile: string; llmRewriteCache: boolean } };
    c.tts.mdReadProfile = 'boss';
    c.tts.llmRewriteCache = false;

    setupMdReadHighlight(app as never, {} as never);
    const running = addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);

    // 原稿生成が完了する（2/2 進捗がセットされる）のを待つ
    await vi.waitFor(() => {
      expect(
        mockNoticeSetMessage.mock.calls.some((call) => String(call[0]).includes('2/2')),
      ).toBe(true);
    }, 5_000);

    // この時点で progress.hide() が呼ばれているべき（読上げが hang しているのに）
    expect(mockNoticeHide).toHaveBeenCalled();

    // 読上げを解放して完了させる
    releaseAudio!();
    const ok = await running;
    expect(ok).toBe(true);
  }, 10_000);
});

// v0.37.2: 最初の LLM 結果が 10s タイムアウトした時、「📝 原稿生成中…」Notice も
// hide されなければ残ってしまう（背景 stream が走り続けるため "10/10" に更新されるが
// catch ブロックで progress.hide() を呼ばないバグ）。
describe('E2E: 原稿生成タイムアウト時の progress Notice クリーンアップ (v0.37.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMdReadSubscribersForTesting();
    mdReadState.clear();
    document.body.innerHTML = '';
  });

  it('最初の LLM 結果が 10s タイムアウトしても progress Notice は hide される', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>H1</h1><p>本文1</p><h2>H2</h2><p>本文2</p>';
    document.body.appendChild(container);
    const mdContent = '# H1\n本文1。\n## H2\n本文2。';
    const { app } = makeApp(container, mdContent);

    // LLM プロンプトを永続的に hang させる（最初の結果が返らない）
    mockRunPrompt.mockImplementation(() => new Promise<string>(() => {}));

    const cfg = makeCfg();
    const c = cfg as { tts: { mdReadProfile: string; llmRewriteConcurrency: number; mdReadHighlight: { enabled: boolean } } };
    c.tts.mdReadProfile = 'boss'; // LLM 経路に入る
    c.tts.llmRewriteConcurrency = 2;
    c.tts.mdReadHighlight.enabled = false; // overlay 経路は簡略化

    setupMdReadHighlight(app as never, {} as never);

    // fake timers で 10s 進める → FIRST_RESULT_TIMEOUT_MS 発動 → catch ブロック
    vi.useFakeTimers();
    const promise = addMdToTts(app as never, { path: '/a.md', extension: 'md' }, cfg);
    await vi.advanceTimersByTimeAsync(11_000);
    // runStandard の addTextToTTS が同期的に resolve するのを待つ
    const ok = await promise;
    vi.useRealTimers();

    // フォールバック成功
    expect(ok).toBe(true);
    // progress.hide() が呼ばれた（タイムアウト catch ブロックでも消える）
    expect(mockNoticeHide).toHaveBeenCalled();
  }, 15_000);
});
