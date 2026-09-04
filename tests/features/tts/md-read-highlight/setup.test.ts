// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMdReadHighlight } from '../../../../src/features/tts/md-read-highlight/setup';
import { mdReadState } from '../../../../src/features/tts/md-read-highlight/state';

// clearAllForFile は workspace 操作と state.clear を呼ぶだけ。モックして検証簡略化
vi.mock('../../../../src/features/tts/md-read-highlight/cleanup', () => ({
  clearAllForFile: vi.fn(),
}));

import { clearAllForFile } from '../../../../src/features/tts/md-read-highlight/cleanup';
const mockedClearAllForFile = clearAllForFile as unknown as ReturnType<typeof vi.fn>;

interface AppMock {
  workspace: {
    on: ReturnType<typeof vi.fn>;
    offref: ReturnType<typeof vi.fn>;
    getLeavesOfType: ReturnType<typeof vi.fn>;
  };
}

function makeApp(): AppMock {
  return {
    workspace: { on: vi.fn(), offref: vi.fn(), getLeavesOfType: vi.fn().mockReturnValue([]) },
  };
}

function makeStore(): { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn() };
}

/** workspace.on() の登録から event 名と handler を捕捉 */
interface CaptureResult {
  app: AppMock;
  handlers: Map<string, () => void>;
  eventRefs: Map<string, unknown>;
  offrefs: ReturnType<typeof vi.fn>;
}
function captureApp(): CaptureResult {
  const handlers = new Map<string, () => void>();
  const eventRefs = new Map<string, unknown>();
  const offrefs = vi.fn();
  // offrefs を先に宣言してから app で参照（TDZ 回避）
  const app: AppMock = {
    workspace: {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
        const ref = { kind: 'eventRef', event };
        eventRefs.set(event, ref);
        return ref;
      }),
      offref: offrefs,
      getLeavesOfType: vi.fn().mockReturnValue([]),
    },
  };
  return { app, handlers, eventRefs, offrefs };
}

describe('setupMdReadHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mdReadState.clear();
  });

  it('returns a cleanup function', () => {
    const app = makeApp();
    const cleanup = setupMdReadHighlight(app as never, makeStore() as never);
    expect(typeof cleanup).toBe('function');
  });

  it('workspace.on("layout-change", handler) を登録する', () => {
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);
    expect(captured.app.workspace.on).toHaveBeenCalledWith('layout-change', expect.any(Function));
  });

  it('layout-change 発火 → state.filePath のタブが消失したとき clearAllForFile を呼ぶ', () => {
    // 1 回目: ファイル残存 → clear しない
    // 2 回目: getLeavesOfType が空 → clear する
    const leavesByType: Record<string, Array<{ view: unknown }>> = {
      'markdown-1': [{ view: { file: { path: '/a.md' } } }],
      'markdown-empty': [],
    };
    let currentLeaves = leavesByType['markdown-1'];
    const captured = captureApp();
    captured.app.workspace.getLeavesOfType = vi.fn((_type: string) => currentLeaves);

    setupMdReadHighlight(captured.app as never, makeStore() as never);

    // state 登録
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
    ]);

    const layoutChangeHandler = captured.handlers.get('layout-change');
    expect(layoutChangeHandler).toBeDefined();

    // 1) まだ開いている → clearAllForFile は呼ばれない
    layoutChangeHandler!();
    expect(mockedClearAllForFile).not.toHaveBeenCalled();

    // 2) タブが閉じた → clearAllForFile が呼ばれる
    currentLeaves = leavesByType['markdown-empty'];
    layoutChangeHandler!();
    expect(mockedClearAllForFile).toHaveBeenCalledTimes(1);
  });

  it('state 未登録時 → layout-change でも clearAllForFile は呼ばれない（no-op）', () => {
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    const layoutChangeHandler = captured.handlers.get('layout-change')!();
    expect(layoutChangeHandler).toBeUndefined(); // void return
    expect(mockedClearAllForFile).not.toHaveBeenCalled();
  });

  it('mdReadState.subscribe(handler) を呼び、phase="playing"/"paused" で clearAllForFile は呼ばれない', () => {
    const subscribeSpy = vi.spyOn(mdReadState, 'subscribe');
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    // subscribe した handler を取り出す
    const registeredHandler = subscribeSpy.mock.calls[0][0] as (s: { phase: string }) => void;

    // phase="playing" / "paused" / "completed" のいずれも clearAllForFile は呼ばれない
    // （v0.33.3 修正: 完了しても overlay は残し、layout-change または cleared で閉じる）
    registeredHandler({ phase: 'playing' });
    registeredHandler({ phase: 'paused' });
    registeredHandler({ phase: 'completed' });
    expect(mockedClearAllForFile).not.toHaveBeenCalled();
  });

  it('cleanup() で workspace.offref を呼ぶ（layout-change + file-open 解除）', () => {
    const captured = captureApp();
    const cleanup = setupMdReadHighlight(captured.app as never, makeStore() as never);

    cleanup();
    // v0.35.2: layout-change に加え file-open（別 MD オープン時の中止）も解除
    expect(captured.offrefs).toHaveBeenCalledTimes(2);
    expect(captured.offrefs).toHaveBeenCalledWith(captured.eventRefs.get('layout-change'));
    expect(captured.offrefs).toHaveBeenCalledWith(captured.eventRefs.get('file-open'));
  });

  it('clearAllForFile の引数は setup で受け取った app と同じ', () => {
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    // layout-change 発火条件を満たすため state を登録
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
    ]);

    const layoutChangeHandler = captured.handlers.get('layout-change')!;
    layoutChangeHandler();

    // 1 番目の引数として渡された app が captured.app と一致
    expect(mockedClearAllForFile).toHaveBeenCalledWith(captured.app);
  });

  /** 以下、F-028 ハイライト・overlay 配線のバグ修正 RED テスト */

  function makePreviewContainer(): HTMLElement {
    document.body.innerHTML = '';
    const c = document.createElement('div');
    document.body.appendChild(c);
    return c;
  }

  it('mdReadState.setActiveIdx → Preview DOM に chunk span が作られる（ハイライト配線）', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.innerHTML = '<p>Hello world. This is a test paragraph.</p>';
    document.body.appendChild(container);

    // getLeavesOfType がこの preview を持つ leaf を返すよう mock
    const app = {
      workspace: {
        on: vi.fn().mockReturnValue({}),
        offref: vi.fn(),
        getLeavesOfType: vi.fn((type: string) => {
          if (type !== 'markdown') return [];
          return [{
            view: {
              previewMode: { containerEl: container },
              file: { path: '/a.md' },
            },
          }];
        }),
      },
    };

    setupMdReadHighlight(app as never, makeStore() as never);

    // filePath / chunk[0].anchor = 'Hello world.' で overlay + chunk span が作られる
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'Hello world.', text: 'Hello world. This is a test paragraph.', headingLevel: 0 },
      { index: 1, startLine: 1, anchor: 'another', text: 'another paragraph', headingLevel: 0 },
    ]);
    mdReadState.setActiveIdx(0);

    // v0.33.5: overlay は document.body 直下
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();
    expect(container.querySelector('.cb-md-read-chunk.is-active')).not.toBeNull();
  });

  it('overlay の [data-cb-md-read-progress] に "currentIndex/total" が反映される', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.innerHTML = '<p>Hello world. This is a test paragraph.</p>';
    document.body.appendChild(container);

    const app = {
      workspace: {
        on: vi.fn().mockReturnValue({}),
        offref: vi.fn(),
        getLeavesOfType: vi.fn((type: string) =>
          type === 'markdown' ? [{
            view: { previewMode: { containerEl: container }, file: { path: '/a.md' } },
          }] : [],
        ),
      },
    };

    setupMdReadHighlight(app as never, makeStore() as never);
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'Hello', text: 'Hello world. This is paragraph 1.', headingLevel: 0 },
      { index: 1, startLine: 1, anchor: 'world.', text: 'world. This is paragraph 2.', headingLevel: 0 },
      { index: 2, startLine: 2, anchor: 'third', text: 'third paragraph', headingLevel: 0 },
    ]);

    mdReadState.setActiveIdx(0);
    expect(document.body.querySelector('[data-cb-md-read-progress]')!.textContent).toBe('1/3');

    mdReadState.setActiveIdx(1);
    expect(document.body.querySelector('[data-cb-md-read-progress]')!.textContent).toBe('2/3');

    mdReadState.setActiveIdx(2);
    expect(document.body.querySelector('[data-cb-md-read-progress]')!.textContent).toBe('3/3');
  });
});
