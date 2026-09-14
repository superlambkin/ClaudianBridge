// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupSelectionWatcher } from '../../../src/features/selection/watcher';
import { addTextToClaudian } from '../../../src/features/selection/core';

// core の addTextToClaudian をモック（実体は realclaudian 依存のため）
vi.mock('../../../src/features/selection/core', () => ({
  addTextToClaudian: vi.fn(async () => true),
}));

function makeStore(overrides?: Partial<{ enabled: boolean; delayMs: number; popupPosition: 'top-right' | 'bottom' }>) {
  return {
    load: () => ({
      selection: { enabled: true, delayMs: 0, folderEnabled: true, popupPosition: 'top-right', ...overrides },
    }),
  } as unknown as import('../../../src/core/config-store').ConfigStore;
}

function makeEditorSelection(editor: HTMLElement) {
  const selMock = {
    isCollapsed: false,
    rangeCount: 1,
    anchorNode: editor,
    toString: () => 'こんにちは',
    getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 200, bottom: 120 }) }),
  };
  vi.spyOn(window, 'getSelection').mockReturnValue(selMock as unknown as Selection);
}

async function showPopup(app: import('obsidian').App, store: ReturnType<typeof makeStore>) {
  const cleanup = setupSelectionWatcher(app, store);
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  document.body.appendChild(editor);
  makeEditorSelection(editor);

  document.dispatchEvent(new Event('selectionchange'));
  await vi.advanceTimersByTime(1); // delayMs 0

  const popup = document.body.querySelector('.cb-popup');
  return { cleanup, editor, popup };
}

describe('setupSelectionWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('テキスト選択 → ポップアップが表示される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore();
    const { cleanup, popup } = await showPopup(app, store);
    expect(popup).not.toBeNull();
    expect(popup!.querySelector('button')).not.toBeNull();
    cleanup();
  });

  // === v0.38.0 (F-032): popupPosition 反映テスト ===
  it('popupPosition="top-right"（既定）で右上に配置される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore(); // 既定: 'top-right'
    const { cleanup, popup } = await showPopup(app, store);
    // rect={left:100, top:100, right:200, bottom:120}
    // jsdom の offsetWidth/Height は通常 0 → left=right(200)-0=200, top=top(100)-0-6=94
    expect(popup!.style.left).toBe('200px');
    expect(popup!.style.top).toBe('94px');
    cleanup();
  });

  it('popupPosition="bottom" で直下に配置される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore({ popupPosition: 'bottom' });
    const { cleanup, popup } = await showPopup(app, store);
    // left=left(100), top=bottom(120)+6=126
    expect(popup!.style.left).toBe('100px');
    expect(popup!.style.top).toBe('126px');
    cleanup();
  });

  it('ポップアップ内クリックで popup が消えず、Add to Claudian が発火する（回帰テスト）', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore();
    const { cleanup, popup } = await showPopup(app, store);
    const btnClaudian = popup!.querySelector('button')!;

    // ボタンを押して離す（pointerdown → pointerup）
    btnClaudian.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    btnClaudian.dispatchEvent(new Event('pointerup', { bubbles: true }));

    // pointerup 後も popup が残る（click イベントをボタンに届けるため）
    expect(document.body.querySelector('.cb-popup')).not.toBeNull();

    // click → Add to Claudian が呼ばれる
    btnClaudian.dispatchEvent(new Event('click', { bubbles: true }));
    expect(addTextToClaudian).toHaveBeenCalledWith(app, 'こんにちは');
    expect(document.body.querySelector('.cb-popup')).toBeNull();

    cleanup();
  });

  it('ポップアップ外 pointerdown で popup が破棄される', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore();
    const { cleanup } = await showPopup(app, store);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.body.querySelector('.cb-popup')).toBeNull();

    cleanup();
  });
});
