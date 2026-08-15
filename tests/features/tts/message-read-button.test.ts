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
});
