// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupSelectionWatcher } from '../../../src/features/selection/watcher';
import { addTextToClaudian } from '../../../src/features/selection/core';

// core の addTextToClaudian をモック（実体は realclaudian 依存のため）
vi.mock('../../../src/features/selection/core', () => ({
  addTextToClaudian: vi.fn(async () => true),
}));

function makeStore(overrides?: Partial<{ enabled: boolean; delayMs: number }>) {
  return {
    load: () => ({
      selection: { enabled: true, delayMs: 0, folderEnabled: true, ...overrides },
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

  it('ポップアップが選択位置に配置される（left/top 設定）', async () => {
    const app = {} as import('obsidian').App;
    const store = makeStore();
    const { cleanup, popup } = await showPopup(app, store);
    // 回帰テスト: position: fixed のまま top/left 未設定だと画面外に出て見えない
    expect(popup!.style.left).toBe('100px');
    expect(popup!.style.top).toBe('126px'); // bottom(120) + 6
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
