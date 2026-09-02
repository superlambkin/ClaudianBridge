// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
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

vi.mock('obsidian', () => ({ Notice: vi.fn() }));
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
