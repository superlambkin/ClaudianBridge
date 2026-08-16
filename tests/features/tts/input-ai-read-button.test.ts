// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupInputAiReadButton } from '../../../src/features/tts/input-ai-read-button';
import type { ConfigStore } from '../../../src/core/config-store';

const speakTextMock = vi.fn(async () => true);
vi.mock('../../../src/features/tts/speak', () => ({ speakText: (...a: unknown[]) => speakTextMock(...a) }));

/** .claudian-input-composer 構造を模倣（realclaudian main.js 実測に基づく） */
function makeComposer(text = ''): { toolbar: HTMLElement; textarea: HTMLTextAreaElement } {
  const composer = document.createElement('div');
  composer.className = 'claudian-input-composer';
  const wrapper = document.createElement('div');
  wrapper.className = 'claudian-input-wrapper';
  const textarea = document.createElement('textarea');
  textarea.value = text;
  wrapper.appendChild(textarea);
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  composer.appendChild(wrapper);
  composer.appendChild(toolbar);
  document.body.appendChild(composer);
  return { toolbar, textarea };
}

function makeSpeechFilter() {
  return {
    emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false,
    callout: false, table: true, code: false, thinking: false, toolCommands: false,
  };
}

function makeStore(opts?: { enabled?: boolean; inputAi?: boolean }) {
  let cfg = {
    tts: {
      enabled: opts?.enabled ?? true,
      engine: 'edge',
      edgeTtsModulePath: '',
      voices: { edge: { zh: 'x', ja: 'n', en: 'a' } },
      inputAi: { enabled: opts?.inputAi ?? true },
      chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
      speechFilter: {
        selection: makeSpeechFilter(),
        autoRead: makeSpeechFilter(),
        message: makeSpeechFilter(),
        inputAi: makeSpeechFilter(),
      },
    },
  };
  return {
    load: () => cfg,
    save: (c: typeof cfg) => { cfg = c; },
    onSave: () => () => { /* noop */ },
  } as unknown as ConfigStore;
}

describe('setupInputAiReadButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    speakTextMock.mockClear();
  });

  it('ツールバーへボタンを 1 つ注入し、cleanup で削除する', () => {
    const { toolbar } = makeComposer('テスト');
    const cleanup = setupInputAiReadButton({ store: makeStore(), polish: vi.fn() });
    const btn = toolbar.querySelector('[data-cb-input-ai]');
    expect(btn).not.toBeNull();
    expect(toolbar.querySelectorAll('[data-cb-input-ai]').length).toBe(1);
    cleanup();
    expect(toolbar.querySelectorAll('[data-cb-input-ai]').length).toBe(0);
  });

  it('inputAi.enabled=false では注入しない', () => {
    const { toolbar } = makeComposer('テスト');
    setupInputAiReadButton({ store: makeStore({ inputAi: false }), polish: vi.fn() });
    expect(toolbar.querySelector('[data-cb-input-ai]')).toBeNull();
  });

  it('成功時: 整形文で入力欄を上書き + 元文 Notice + 整形文を読み上げ', async () => {
    const { textarea } = makeComposer('あれやっといて');
    const polish = vi.fn(async () => 'それを実行しておいてください。');
    const noticeFn = vi.fn();
    setupInputAiReadButton({ store: makeStore(), polish, noticeFn });
    (document.querySelector('[data-cb-input-ai]') as HTMLElement).click();
    await vi.waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    expect(textarea.value).toBe('それを実行しておいてください。');
    expect(speakTextMock.mock.calls[0][0]).toBe('inputAi');
    expect(speakTextMock.mock.calls[0][1]).toBe('それを実行しておいてください。');
    expect(noticeFn).toHaveBeenCalledWith(expect.stringContaining('あれやっといて'));
  });

  it('上書き時に input イベントが dispatch される（realclaudian 状態同期）', async () => {
    const { textarea } = makeComposer('x');
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    setupInputAiReadButton({ store: makeStore(), polish: vi.fn(async () => '整形済'), noticeFn: vi.fn() });
    (document.querySelector('[data-cb-input-ai]') as HTMLElement).click();
    await vi.waitFor(() => expect(onInput).toHaveBeenCalledTimes(1));
  });

  it('失敗時: 入力欄を上書きせず元文を読み上げる', async () => {
    const { textarea } = makeComposer('元の文章');
    const noticeFn = vi.fn();
    setupInputAiReadButton({ store: makeStore(), polish: vi.fn(async () => null), noticeFn });
    (document.querySelector('[data-cb-input-ai]') as HTMLElement).click();
    await vi.waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    expect(textarea.value).toBe('元の文章');
    expect(speakTextMock.mock.calls[0][0]).toBe('inputAi');
    expect(speakTextMock.mock.calls[0][1]).toBe('元の文章');
    expect(noticeFn).toHaveBeenCalledWith(expect.stringContaining('整形'));
  });

  it('空入力・ミュート中は読み上げない', async () => {
    const empty = makeComposer('   ');
    const noticeFn = vi.fn();
    setupInputAiReadButton({ store: makeStore(), polish: vi.fn(), noticeFn });
    (empty.toolbar.querySelector('[data-cb-input-ai]') as HTMLElement).click();
    expect(speakTextMock).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    speakTextMock.mockClear();
    const muted = makeComposer('ある');
    setupInputAiReadButton({ store: makeStore({ enabled: false }), polish: vi.fn(), noticeFn });
    (muted.toolbar.querySelector('[data-cb-input-ai]') as HTMLElement).click();
    expect(speakTextMock).not.toHaveBeenCalled();
    expect(noticeFn).toHaveBeenCalled();
  });

  it('実行中はボタンが disabled（二重クリックガード）', async () => {
    let resolvePolish!: (v: string | null) => void;
    const polish = vi.fn(() => new Promise<string | null>((r) => { resolvePolish = r; }));
    makeComposer('text');
    setupInputAiReadButton({ store: makeStore(), polish, noticeFn: vi.fn() });
    const btn = document.querySelector('[data-cb-input-ai]') as HTMLButtonElement;
    btn.click();
    expect(btn.disabled).toBe(true);
    resolvePolish('ok');
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
  });
});
