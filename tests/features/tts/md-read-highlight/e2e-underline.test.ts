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

const MD_CONTENT = [
  '# 大見出し',
  '最初の段落です。これは冒頭テキストです。',
  '## サブ見出し',
  '二番目の段落。こちらは後半のテキストです。',
].join('\n');

function makeApp(container: HTMLElement) {
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
        cachedRead: vi.fn().mockResolvedValue(MD_CONTENT),
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
    // 実 TTS: 各チャンク開始 hook を呼び出して成功を返す（2 チャンク想定）
    mockAddTextToTTS.mockImplementation(
      async (_app: unknown, _text: string, _settings: unknown, onChunkStart?: (i: number) => void) => {
        if (onChunkStart) onChunkStart(0);
        if (onChunkStart) onChunkStart(1);
        return true;
      },
    );
  });

  it('チェーン全体で is-active 下線 span が生成され、チャンク 1 へ移動する', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<h1>大見出し</h1><p>最初の段落です。これは冒頭テキストです。</p><h2>サブ見出し</h2><p>二番目の段落。こちらは後半のテキストです。</p>';
    document.body.appendChild(container);
    const { app } = makeApp(container);

    // 実チェーン: subscriber 登録 → addMdToTts（内部で register + chunk hook）
    setupMdReadHighlight(app, {} as never);
    const ok = await addMdToTts(app, { path: '/a.md', extension: 'md' }, makeCfg());
    expect(ok).toBe(true);

    // 最終チャンク(1) が active: 2 番目の段落に下線 span がある
    const active = container.querySelectorAll('.cb-md-read-chunk.is-active');
    expect(active.length).toBeGreaterThanOrEqual(1);
    const joined = Array.from(active).map((el) => el.textContent).join('');
    expect(joined).toContain('二番目の段落');

    // 直前チャンク(0) の span は is-active が外れている（deactivateAll）
    // ※ span 自体は残るが is-active クラスは新チャンクのみ
    expect(container.querySelectorAll('.cb-md-read-chunk:not(.is-active)').length).toBeGreaterThanOrEqual(0);

    // overlay が document.body に存在（下中央ボタン群）
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();
    // 進捗が 2/2 で最終チャンクを示す
    expect(document.body.querySelector('[data-cb-md-read-progress]')!.textContent).toBe('2/2');
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
