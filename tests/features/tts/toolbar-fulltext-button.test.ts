// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupToolbarFullTextButton } from '../../../src/features/tts/toolbar-fulltext-button';
import type { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(_msg: string) { /* テストでは Notice 表示を検証しない */ }
  },
}));

function makeStore(fullText: boolean) {
  const state = {
    tts: {
      enabled: true,
      cli: { full_text: fullText, max_chars: 100, debounce_ms: 2000, speech_filter: {} },
    },
  };
  const saves: unknown[] = [];
  return {
    store: {
      load: () => state,
      save: (next: unknown) => { saves.push(next); Object.assign(state, next); },
    } as unknown as ConfigStore,
    saves,
    state,
  };
}

function addToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  document.body.appendChild(toolbar);
  return toolbar;
}

async function waitForBtn(toolbar: HTMLElement): Promise<HTMLButtonElement> {
  let btn: Element | null = null;
  await vi.waitFor(() => {
    btn = toolbar.querySelector('[data-cb-fulltext]');
    expect(btn).not.toBeNull();
  });
  return btn as unknown as HTMLButtonElement;
}

describe('setupToolbarFullTextButton', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('ツールバーに 📖/📄 ボタンを注入し設定値を反映する', async () => {
    const { store } = makeStore(true);
    cleanup = setupToolbarFullTextButton(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar);
    expect(btn.textContent).toBe('📖');
    expect(btn.classList.contains('is-fulltext')).toBe(true);
  });

  it('クリックで tts.cli.full_text がトグル保存される', async () => {
    const { store, saves } = makeStore(false);
    cleanup = setupToolbarFullTextButton(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar);
    btn.click();
    expect(saves).toHaveLength(1);
    expect((saves[0] as { tts: { cli: { full_text: boolean } } }).tts.cli.full_text).toBe(true);
    expect(btn.textContent).toBe('📖');
  });

  it('再クリックで OFF に戻る', async () => {
    const { store } = makeStore(true);
    cleanup = setupToolbarFullTextButton(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar);
    btn.click(); // ON → OFF
    expect(btn.textContent).toBe('📄');
    btn.click(); // OFF → ON
    expect(btn.textContent).toBe('📖');
  });

  it('二重注入しない', async () => {
    const { store } = makeStore(false);
    cleanup = setupToolbarFullTextButton(store);
    const toolbar = addToolbar();
    await waitForBtn(toolbar);
    // 再 scan 相当: 他の DOM 変更で observer が走っても 1 個のまま
    document.body.appendChild(document.createElement('div'));
    expect(toolbar.querySelectorAll('[data-cb-fulltext]')).toHaveLength(1);
  });

  it('cleanup で注入ボタンを削除する', async () => {
    const { store } = makeStore(false);
    cleanup = setupToolbarFullTextButton(store);
    const toolbar = addToolbar();
    await waitForBtn(toolbar);
    cleanup!();
    cleanup = undefined;
    expect(toolbar.querySelector('[data-cb-fulltext]')).toBeNull();
  });
});
