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
  };
}

function makeApp(): AppMock {
  return {
    workspace: { on: vi.fn(), offref: vi.fn() },
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

  it('layout-change 発火 → 登録 state が あるとき clearAllForFile(app) を呼ぶ', () => {
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    // state を登録 → layout-change handler が発動する条件を満たす
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
    ]);

    const layoutChangeHandler = captured.handlers.get('layout-change');
    expect(layoutChangeHandler).toBeDefined();
    layoutChangeHandler!();

    // clearAllForFile はモック（実 clear しない）が、呼ばれたことだけ検証
    expect(mockedClearAllForFile).toHaveBeenCalledTimes(1);
  });

  it('state 未登録時 → layout-change でも clearAllForFile は呼ばれない（no-op）', () => {
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    const layoutChangeHandler = captured.handlers.get('layout-change')!();
    expect(layoutChangeHandler).toBeUndefined(); // void return
    expect(mockedClearAllForFile).not.toHaveBeenCalled();
  });

  it('mdReadState.subscribe(handler) を呼び、handler は state.phase="completed" で clearAllForFile を発火', () => {
    const subscribeSpy = vi.spyOn(mdReadState, 'subscribe');
    const captured = captureApp();
    setupMdReadHighlight(captured.app as never, makeStore() as never);

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    // subscribe した handler を取り出す
    const registeredHandler = subscribeSpy.mock.calls[0][0] as (s: { phase: string }) => void;

    // phase="completed" のとき clearAllForFile 発火
    registeredHandler({ phase: 'completed' });
    expect(mockedClearAllForFile).toHaveBeenCalledTimes(1);

    // phase="playing" / "paused" などは no-op
    mockedClearAllForFile.mockClear();
    registeredHandler({ phase: 'playing' });
    registeredHandler({ phase: 'paused' });
    expect(mockedClearAllForFile).not.toHaveBeenCalled();
  });

  it('cleanup() で workspace.offref を呼ぶ（layout-change 解除）', () => {
    const captured = captureApp();
    const cleanup = setupMdReadHighlight(captured.app as never, makeStore() as never);

    cleanup();
    expect(captured.offrefs).toHaveBeenCalledTimes(1);
    expect(captured.offrefs).toHaveBeenCalledWith(captured.eventRefs.get('layout-change'));
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
});
