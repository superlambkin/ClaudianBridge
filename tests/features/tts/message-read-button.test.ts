// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMessageReadButtons } from '../../../src/features/tts/message-read-button';
import type { ConfigStore } from '../../../src/core/config-store';

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

function makeStore(enabled = true) {
  return {
    load: () => ({
      tts: {
        enabled,
        engine: 'edge',
        voices: { edge: { zh: 'xiaoxiao', ja: 'nanami', en: 'aria' } },
        cli: { speech_filter: { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true } },
      },
    }),
  } as unknown as ConfigStore;
}

describe('setupMessageReadButtons', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('コピーボタンの左隣に読上げボタンを 1 つ注入し、cleanup で削除される', () => {
    const block = makeBlock();
    const cleanup = setupMessageReadButtons({ app: {} as never, store: makeStore(), speak: vi.fn(async () => true) });
    const btn = block.querySelector('[data-cb-msg-read]');
    const copyBtn = block.querySelector('.claudian-text-copy-btn');
    expect(btn).not.toBeNull();
    expect(copyBtn).not.toBeNull();
    expect(btn!.nextElementSibling).toBe(copyBtn); // 直前（コピーボタンの左隣）
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(1); // 重複なし
    cleanup();
    expect(block.querySelectorAll('[data-cb-msg-read]').length).toBe(0);
  });

  it('クリックでブロックの可視テキストを speak に渡す', async () => {
    const block = makeBlock('<p>こんにちは</p><p>世界</p>');
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('こんにちは');
    expect(speak.mock.calls[0][0]).toContain('世界');
  });

  it('tts.enabled=false のときは speak を呼ばずミュート通知を出す', () => {
    const block = makeBlock();
    const speak = vi.fn(async () => true);
    const noticeFn = vi.fn();
    setupMessageReadButtons({ app: {} as never, store: makeStore(false), speak, noticeFn });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    expect(speak).not.toHaveBeenCalled();
    expect(noticeFn).toHaveBeenCalledTimes(1);
  });

  it('空テキストのブロックでは speak を呼ばない', () => {
    const block = makeBlock('<p>   </p>');
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    expect(speak).not.toHaveBeenCalled();
  });

  it('思考ブロック（.claudian-thinking-block）のテキストは読み上げ対象から除外する', async () => {
    const block = makeBlock(
      '<p>通常テキスト</p><div class="claudian-thinking-block">Thought for 1s<br>思考内容</div>',
    );
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });
    const btn = block.querySelector('[data-cb-msg-read]') as HTMLElement;
    btn.click();
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    const spoken = speak.mock.calls[0][0] as string;
    expect(spoken).toContain('通常テキスト');
    expect(spoken).not.toContain('Thought for 1s');
    expect(spoken).not.toContain('思考内容');
  });

  it('MutationObserver: 後から追加されたブロックにも注入する（コピーボタンが別タスクで追加）', async () => {
    const speak = vi.fn(async () => true);
    setupMessageReadButtons({ app: {} as never, store: makeStore(), speak });

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
