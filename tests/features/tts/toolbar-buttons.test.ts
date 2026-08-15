// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupToolbarButtons } from '../../../src/features/tts/toolbar-buttons';
import { registerPlayback, resetPlaybackRegistry } from '../../../src/features/tts/playback-registry';
import type { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
}));

function makeStore(tts: Partial<{ enabled: boolean; scope: 'header' | 'full'; fullText: boolean }> = {}) {
  const state = {
    tts: {
      enabled: tts.enabled ?? true,
      cli: { full_text: tts.fullText ?? false, max_chars: 100, debounce_ms: 2000, speech_filter: {} },
      autoRead: { enabled: true, scope: tts.scope ?? 'header' as const },
    },
  };
  const saves: unknown[] = [];
  const listeners: Array<(c: unknown) => void> = [];
  return {
    store: {
      load: () => state,
      save: (next: unknown) => { Object.assign(state, next); saves.push(next); listeners.forEach((l) => l(next)); },
      onSave: (l: (c: unknown) => void) => { listeners.push(l); },
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

async function waitForBtn(toolbar: HTMLElement, mark: string): Promise<HTMLButtonElement> {
  let btn: Element | null = null;
  await vi.waitFor(() => {
    btn = toolbar.querySelector(mark);
    expect(btn).not.toBeNull();
  });
  return btn as unknown as HTMLButtonElement;
}

describe('setupToolbarButtons (mute)', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => { document.body.innerHTML = ''; resetPlaybackRegistry(); });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('ツールバーにミュートボタンを注入する（有効・非再生 = 🔊）', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    expect(btn.textContent).toContain('ミュート');
    expect(btn.classList.contains('is-muted')).toBe(false);
    expect(btn.classList.contains('is-playing')).toBe(false);
  });

  it('非再生時クリックで tts.enabled=false 保存 → 🔇 表示', async () => {
    const { store, saves } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    btn.click();
    expect(saves).toHaveLength(1);
    expect((saves[0] as { tts: { enabled: boolean } }).tts.enabled).toBe(false);
    expect(btn.textContent).toContain('ミュート'); // v0.12.2: ミュート状態も「ミュート」表示
    expect(btn.classList.contains('is-muted')).toBe(true);
  });

  it('ミュート状態クリックで tts.enabled=true 保存 → 🔊 表示', async () => {
    const { store, saves } = makeStore({ enabled: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    expect(btn.classList.contains('is-muted')).toBe(true);
    btn.click();
    expect(saves).toHaveLength(1);
    expect((saves[0] as { tts: { enabled: boolean } }).tts.enabled).toBe(true);
    expect(btn.textContent).toContain('ミュート');
    expect(btn.classList.contains('is-muted')).toBe(false);
  });

  it('再生中は 🔊 停止（点滅）表示になり、クリックで stop のみ（enabled 不変）', async () => {
    const { store, saves } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    const unregister = registerPlayback({ engine: 'edge', stop: vi.fn() });
    await vi.waitFor(() => expect(btn.classList.contains('is-playing')).toBe(true));
    expect(btn.textContent).toContain('ミュート'); // v0.12.2: 全状態で「ミュート」表示
    btn.click();
    expect(saves).toHaveLength(0); // enabled は変更されない
    unregister();
  });

  it('store.onSave で外部変更がボタンへ即時反映される', async () => {
    const { store, state } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-mute]');
    state.tts.enabled = false; // 設定タブ相当の外部変更
    store.save(state as never);
    expect(btn.classList.contains('is-muted')).toBe(true);
  });

  it('二重注入しない / cleanup で削除する', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    await waitForBtn(toolbar, '[data-cb-mute]');
    document.body.appendChild(document.createElement('div'));
    expect(toolbar.querySelectorAll('[data-cb-mute]')).toHaveLength(1);
    cleanup!();
    cleanup = undefined;
    expect(toolbar.querySelector('[data-cb-mute]')).toBeNull();
  });
});

describe('setupToolbarButtons (fulltext)', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => { document.body.innerHTML = ''; resetPlaybackRegistry(); });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('scope=header → 📄 ヘッダー 表示', async () => {
    const { store } = makeStore({ scope: 'header', fullText: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    expect(btn.textContent).toContain('ヘッダー');
    expect(btn.classList.contains('is-fulltext')).toBe(false);
  });

  it('クリックで autoRead.scope と cli.full_text が同時トグル保存される', async () => {
    const { store, saves } = makeStore({ scope: 'header', fullText: false });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    btn.click();
    expect(saves).toHaveLength(1);
    const saved = saves[0] as { tts: { autoRead: { scope: string }; cli: { full_text: boolean } } };
    expect(saved.tts.autoRead.scope).toBe('full');
    expect(saved.tts.cli.full_text).toBe(true);
    expect(btn.textContent).toContain('全文');
    expect(btn.classList.contains('is-fulltext')).toBe(true);
  });

  it('再クリックで OFF（scope=header / full_text=false）に戻る', async () => {
    const { store } = makeStore({ scope: 'full', fullText: true });
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const btn = await waitForBtn(toolbar, '[data-cb-fulltext]');
    btn.click();
    const tts = (store.load() as unknown as { tts: { autoRead: { scope: string }; cli: { full_text: boolean } } }).tts;
    expect(tts.autoRead.scope).toBe('header');
    expect(tts.cli.full_text).toBe(false);
  });

  it('両ボタンが順に注入される（ミュート → 全文）', async () => {
    const { store } = makeStore();
    cleanup = setupToolbarButtons(store);
    const toolbar = addToolbar();
    const mute = await waitForBtn(toolbar, '[data-cb-mute]');
    const full = await waitForBtn(toolbar, '[data-cb-fulltext]');
    expect(toolbar.querySelectorAll('[data-cb-mute]')).toHaveLength(1);
    expect(toolbar.querySelectorAll('[data-cb-fulltext]')).toHaveLength(1);
    expect(Array.from(toolbar.children).indexOf(mute)).toBeLessThan(Array.from(toolbar.children).indexOf(full));
  });
});
