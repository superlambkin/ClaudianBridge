// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMessageMdSaveButtons } from '../../../src/features/memory/message-md-save-button';
import type { ConfigStore } from '../../../src/core/config-store';
import * as saveModule from '../../../src/features/memory/save';

function makeBlock(body = '<h2>タイトル</h2><p>本文</p>'): HTMLElement {
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
  let savedListener: (() => void) | null = null;
  return {
    load: () => ({ memory: { enabled, scope: 'pair', folder: 'Memory/' } }),
    onSave: (l: () => void) => { savedListener = l; },
    triggerSave: () => { savedListener?.(); },
  } as unknown as ConfigStore & { triggerSave: () => void };
}

describe('setupMessageMdSaveButtons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(saveModule, 'saveMarkdown').mockResolvedValue({ path: 'Memory/x.md', ok: true, message: 'saved' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('コピーボタンの並びに 📝 を 1 つ注入し、cleanup で削除', () => {
    const block = makeBlock();
    const cleanup = setupMessageMdSaveButtons({ app: {} as never, store: makeStore(), noticeFn: vi.fn() });
    expect(block.querySelector('[data-cb-md-save]')).not.toBeNull();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(1);
    cleanup();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(0);
  });

  it('クリックでそのブロックのみ scope=block で保存する', async () => {
    const block = makeBlock('<h2>ブロック見出し</h2><p>ブロック本文</p>');
    const noticeFn = vi.fn();
    setupMessageMdSaveButtons({ app: {} as never, store: makeStore(), noticeFn });
    (block.querySelector('[data-cb-md-save]') as HTMLElement).click();
    await vi.waitFor(() => expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(1));
    const [app, folder, scope, title, body] = (saveModule.saveMarkdown as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(scope).toBe('block');
    expect(title).toBe('ブロック見出し');
    expect(body).toContain('ブロック本文');
  });

  it('memory.enabled=false では注入しない', () => {
    const block = makeBlock();
    setupMessageMdSaveButtons({ app: {} as never, store: makeStore(false), noticeFn: vi.fn() });
    expect(block.querySelector('[data-cb-md-save]')).toBeNull();
  });

  it('cleanup 後に保存イベントが来てもボタンを再注入しない', () => {
    const block = makeBlock();
    const store = makeStore();
    const cleanup = setupMessageMdSaveButtons({ app: {} as never, store, noticeFn: vi.fn() });
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(1);
    cleanup();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(0);
    store.triggerSave();
    expect(block.querySelectorAll('[data-cb-md-save]').length).toBe(0);
  });

  it('保存中は busy ガードで二重クリックを無視し、完了後は再クリックできる', async () => {
    const block = makeBlock('<h2>ブロック見出し</h2><p>ブロック本文</p>');
    let resolveSave!: (v: { path: string; ok: boolean; message: string }) => void;
    const deferred = new Promise<{ path: string; ok: boolean; message: string }>((res) => { resolveSave = res; });
    (saveModule.saveMarkdown as unknown as ReturnType<typeof vi.fn>).mockReturnValue(deferred);
    const noticeFn = vi.fn();
    setupMessageMdSaveButtons({ app: {} as never, store: makeStore(), noticeFn });
    const btn = block.querySelector('[data-cb-md-save]') as HTMLElement;
    btn.click();
    btn.click();
    expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(1);
    resolveSave({ path: 'Memory/x.md', ok: true, message: 'saved' });
    await vi.waitFor(() => expect(noticeFn).toHaveBeenCalledTimes(1));
    btn.click();
    expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(2);
  });
});
