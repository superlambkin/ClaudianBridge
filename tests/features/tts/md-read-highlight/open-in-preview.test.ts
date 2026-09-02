// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openInPreview } from '../../../../src/features/tts/md-file-read-flow';

vi.mock('obsidian', () => ({
  Notice: vi.fn(),
}));

describe('openInPreview (v0.33.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeView(mode: 'source' | 'preview' | 'live') {
    const setState = vi.fn();
    const getMode = vi.fn(() => mode);
    const containerEl = document.createElement('div');
    const view: Record<string, unknown> = {
      file: { path: '/a.md' },
      previewMode: { containerEl },
      getMode,
      setState,
    };
    return { view, setState, getMode };
  }

  it('openLinkText でファイルを開く → 該当 view の Live Preview モードに切替（source → live）', async () => {
    const { view, setState } = makeView('source');

    const app = {
      workspace: {
        openLinkText: vi.fn().mockResolvedValue(undefined),
        getLeavesOfType: vi.fn(() => [{ view }]),
        setActiveLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue({ path: '/a.md' }),
      },
    };

    await openInPreview(app as never, '/a.md');

    // 1. openLinkText でファイルが開かれた
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('/a.md', '', false);
    // 2. setActiveLeaf で焦点
    expect(app.workspace.setActiveLeaf).toHaveBeenCalled();
    // 3. setState で Live Preview モードへ
    expect(setState).toHaveBeenCalledWith({ state: 'live' }, expect.anything());
  });

  it('既に live モードなら setState は呼ばない（不要な再 render を防ぐ）', async () => {
    const { view, setState } = makeView('live');

    const app = {
      workspace: {
        openLinkText: vi.fn().mockResolvedValue(undefined),
        getLeavesOfType: vi.fn(() => [{ view }]),
        setActiveLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue({ path: '/a.md' }),
      },
    };

    await openInPreview(app as never, '/a.md');

    expect(setState).not.toHaveBeenCalled();
  });

  it('ファイルが見つからないとき Notice を表示して早期 return', async () => {
    const setState = vi.fn();
    const app = {
      workspace: {
        openLinkText: vi.fn(),
        getLeavesOfType: vi.fn(() => [{ view: { ...makeView('source').view, setState } }]),
        setActiveLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
      },
    };

    await openInPreview(app as never, '/missing.md');

    expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    expect(app.workspace.setActiveLeaf).not.toHaveBeenCalled();
  });
});
