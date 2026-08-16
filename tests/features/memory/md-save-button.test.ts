// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMdSaveButton } from '../../../src/features/memory/md-save-button';
import type { ConfigStore } from '../../../src/core/config-store';
import * as saveModule from '../../../src/features/memory/save';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';

function makeToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  document.body.appendChild(toolbar);
  return toolbar;
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    load: () => ({
      memory: { enabled: true, scope: 'pair', folder: 'Memory/' },
      ...overrides,
    }),
    onSave: () => {},
  } as unknown as ConfigStore;
}

describe('setupMdSaveButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(saveModule, 'saveMarkdown').mockResolvedValue({ path: 'Memory/x.md', ok: true, message: 'saved' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ツールバーに 📝 ボタンを 1 つ注入し、cleanup で削除', () => {
    const toolbar = makeToolbar();
    const cleanup = setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn: vi.fn() });
    expect(toolbar.querySelector('[data-cb-md-save-toolbar]')).not.toBeNull();
    expect(toolbar.querySelectorAll('[data-cb-md-save-toolbar]').length).toBe(1);
    cleanup();
    expect(toolbar.querySelectorAll('[data-cb-md-save-toolbar]').length).toBe(0);
  });

  it('memory.enabled=false では注入しない', () => {
    const toolbar = makeToolbar();
    setupMdSaveButton({ app: {} as never, store: makeStore({ memory: { enabled: false, scope: 'pair', folder: 'Memory/' } }), noticeFn: vi.fn() });
    expect(toolbar.querySelector('[data-cb-md-save-toolbar]')).toBeNull();
  });

  it('クリックで saveMarkdown を呼ぶ（pair 抽出→serialize→compose）', async () => {
    makeToolbar();
    document.body.innerHTML += `
      <div class="claudian-messages">
        <div class="claudian-message-user"><div class="claudian-message-content"><p>質問</p></div></div>
        <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答タイトル</h2><p>回答本文</p></div></div>
      </div>`;
    const noticeFn = vi.fn();
    setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn });
    (document.querySelector('[data-cb-md-save-toolbar]') as HTMLElement).click();
    await vi.waitFor(() => expect(saveModule.saveMarkdown).toHaveBeenCalledTimes(1));
    const [app, folder, scope, title, body] = (saveModule.saveMarkdown as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(folder).toBe('Memory/');
    expect(scope).toBe('pair');
    expect(title).toBe('回答タイトル');
    expect(body).toContain('## 質問');
    expect(body).toContain('## 回答');
  });

  it('メッセージが無ければ Notice して保存しない', async () => {
    makeToolbar();
    const noticeFn = vi.fn();
    setupMdSaveButton({ app: {} as never, store: makeStore(), noticeFn });
    (document.querySelector('[data-cb-md-save-toolbar]') as HTMLElement).click();
    expect(noticeFn).toHaveBeenCalled();
    expect(saveModule.saveMarkdown).not.toHaveBeenCalled();
  });
});
