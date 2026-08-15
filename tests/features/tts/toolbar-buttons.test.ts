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
    expect(btn.textContent).toContain('ミュート解除');
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
    expect(btn.textContent).toContain('停止');
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
