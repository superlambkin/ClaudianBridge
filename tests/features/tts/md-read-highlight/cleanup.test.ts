// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllForFile } from '../../../../src/features/tts/md-read-highlight/cleanup';
import { mdReadState } from '../../../../src/features/tts/md-read-highlight/state';

// clearAllHighlights は preview-renderer.ts の DOM 操作。
// ユニットテストではモックして、cleanup.ts が適切に呼び出すかだけ検証する。
vi.mock('../../../../src/features/tts/md-read-highlight/preview-renderer', () => ({
  clearAllHighlights: vi.fn(),
}));

import { clearAllHighlights } from '../../../../src/features/tts/md-read-highlight/preview-renderer';
const mockedClearAllHighlights = clearAllHighlights as unknown as ReturnType<typeof vi.fn>;

function makeContainer(): HTMLElement {
  return document.createElement('div');
}

function makeApp(leaves: Array<{ view: unknown }>): unknown {
  return {
    workspace: {
      getLeavesOfType: vi.fn((type: string) => {
        if (type === 'markdown') return leaves;
        return [];
      }),
    },
  };
}

describe('clearAllForFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mdReadState.clear();
  });

  it('markdown leaf 各 view（previewMode 有り）の previewMode.containerEl に対して clearAllHighlights を呼ぶ', () => {
    const c1 = makeContainer();
    const c2 = makeContainer();
    const app = makeApp([
      { view: { previewMode: { containerEl: c1 } } },
      { view: { previewMode: { containerEl: c2 } } },
    ]);

    clearAllForFile(app as never);

    expect(mockedClearAllHighlights).toHaveBeenCalledTimes(2);
    expect(mockedClearAllHighlights).toHaveBeenNthCalledWith(1, { previewMode: { containerEl: c1 } });
    expect(mockedClearAllHighlights).toHaveBeenNthCalledWith(2, { previewMode: { containerEl: c2 } });
  });

  it('previewMode 不在の leaf はスキップ', () => {
    const c1 = makeContainer();
    const app = makeApp([
      { view: { previewMode: { containerEl: c1 } } },
      { view: { /* previewMode なし */ } },
      { view: { previewMode: {} } }, // containerEl 不在
    ]);

    clearAllForFile(app as never);

    expect(mockedClearAllHighlights).toHaveBeenCalledTimes(1);
    expect(mockedClearAllHighlights).toHaveBeenCalledWith({ previewMode: { containerEl: c1 } });
  });

  it('mdReadState.clear() も呼ぶ（ハイライト state を破棄）', () => {
    const app = makeApp([]);
    mdReadState.register('/a.md', [
      { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
    ]);
    expect(mdReadState.get()).not.toBeNull();

    clearAllForFile(app as never);

    expect(mdReadState.get()).toBeNull();
  });

  it('markdown leaf 0 件・state 未登録でもクラッシュしない（冪等）', () => {
    const app = makeApp([]);
    expect(() => clearAllForFile(app as never)).not.toThrow();
    expect(mockedClearAllHighlights).not.toHaveBeenCalled();
  });
});
