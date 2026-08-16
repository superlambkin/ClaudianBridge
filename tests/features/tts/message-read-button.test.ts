// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMessageReadButtons } from '../../../src/features/tts/message-read-button';
import type { ConfigStore } from '../../../src/core/config-store';

const speakTextMock = vi.fn(async () => true);
vi.mock('../../../src/features/tts/speak', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/tts/speak')>();
  return { ...actual, speakText: (...a: unknown[]) => speakTextMock(...a) };
});

function makeBlock(body = '<p>読み上げテキスト</p>'): HTMLElement {
  const block = document.createElement('div');
  block.className = 'claudian-text-block';
  block.innerHTML = body;
  const copy = document.createElement('span');
  copy.className = 'claudian-text-copy-btn';
  block.appendChild(copy);
  document.body.appendChild(block);
  return block;
}

function makeSpeechFilter() {
  return {
    emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false,
    callout: false, table: true, code: false, thinking: false, toolCommands: false,
  };
}

function makeStore(enabled = true) {
  return {
    load: () => ({
      tts: {
        enabled,
        engine: 'edge',
        edgeTtsModulePath: '',
        voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' } },
        chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
        speechFilter: {
          selection: makeSpeechFilter(),
          autoRead: makeSpeechFilter(),
          message: makeSpeechFilter(),
          inputAi: makeSpeechFilter(),
        },
      },
    }),
  } as unknown as ConfigStore;
}

describe('setupMessageReadButtons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    speakTextMock.mockClear();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('コピーボタンの左隣に読上げボタンを 1 つ注入し、cleanup で削除される', () => {
    const block = makeBlock();
    const cleanup = setupMessageReadButtons({ app: {} as never, store: makeStore() });
    const btn = block.querySelector('[data-cb-msg-read]');
    const copyBtn = block.querySelector('.claudian-text-copy-btn');
    expect(btn).not.toBeNull();
    expect(copyBtn).not.toBeNull();
    expect(btn!.nextElementSibling).toBe(copyBtn); // 直前（コピーボタンの左隣）
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(1); // 重複なし
    cleanup();
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(0);
  });

  it('クリックでブロックの可視テキストを speakText("message", ...) に渡す', async () => {
    const block = makeBlock('<p>こんにちは</p><p>世界</p>');
    setupMessageReadButtons({ app: {} as never, store: makeStore() });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    await vi.waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    expect(speakTextMock.mock.calls[0][0]).toBe('message');
    expect(speakTextMock.mock.calls[0][1]).toContain('こんにちは');
    expect(speakTextMock.mock.calls[0][1]).toContain('世界');
  });

  it('tts.enabled=false のときは speakText を呼ばずミュート通知を出す', () => {
    const block = makeBlock();
    const noticeFn = vi.fn();
    setupMessageReadButtons({ app: {} as never, store: makeStore(false), noticeFn });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    expect(speakTextMock).not.toHaveBeenCalled();
    expect(noticeFn).toHaveBeenCalledTimes(1);
  });

  it('空テキストのブロックでは speakText を呼ばず「入力がありません」を通知する', () => {
    const block = makeBlock('<p>   </p>');
    const noticeFn = vi.fn();
    setupMessageReadButtons({ app: {} as never, store: makeStore(), noticeFn });
    (block.querySelector('[data-cb-msg-read]') as HTMLElement).click();
    expect(speakTextMock).not.toHaveBeenCalled();
    expect(noticeFn).toHaveBeenCalledWith('入力がありません');
  });

  it('思考ブロック（.claudian-thinking-block）のテキストは読み上げ対象から除外する', async () => {
    const block = makeBlock(
      '<p>通常テキスト</p><div class="claudian-thinking-block">Thought for 1s<br>思考内容</div>',
    );
    setupMessageReadButtons({ app: {} as never, store: makeStore() });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    await vi.waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    const spoken = speakTextMock.mock.calls[0][1] as string;
    expect(spoken).toContain('通常テキスト');
    expect(spoken).not.toContain('Thought for 1s');
    expect(spoken).not.toContain('思考内容');
  });

  it('MutationObserver: 後から追加されたブロックにも注入する（コピーボタンが別タスクで追加）', async () => {
    setupMessageReadButtons({ app: {} as never, store: makeStore() });

    // 1) まずコピーボタンなしの text block を追加
    const block = document.createElement('div');
    block.className = 'claudian-text-block';
    block.innerHTML = '<p>動的追加テキスト</p>';
    document.body.appendChild(block);

    // 2) observer のマイクロタスクを処理させ、inject がコピーボタン不在で早期 return するまで待つ
    await new Promise((r) => setTimeout(r, 0));

    // 3) 別の DOM タスクでコピーボタンだけを追加（Finding 1 の再現）
    const copy = document.createElement('span');
    copy.className = 'claudian-text-copy-btn';
    block.appendChild(copy);

    // 4) コピーボタンだけの mutation でも再スキャンされ、読上げボタンが現れる
    await vi.waitFor(() => expect(block.querySelector('[data-cb-msg-read]')).not.toBeNull());
  });
});
