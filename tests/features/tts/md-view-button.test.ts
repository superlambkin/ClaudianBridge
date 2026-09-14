// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMdViewButton } from '../../../src/features/tts/md-file-read';
import type { ConfigStore } from '../../../src/core/config-store';

function makeLeaf(file: { extension?: string } | null) {
  const actionBtn = document.createElement('div');
  const view = {
    file,
    containerEl: document.createElement('div'),
    addAction: vi.fn(() => actionBtn),
  };
  return { view, actionBtn, leaf: { view } };
}

function makeApp(leaves: Array<{ view: unknown }>) {
  const listeners: Array<() => void> = [];
  return {
    app: {
      workspace: {
        getLeavesOfType: vi.fn(() => leaves),
        on: (_n: string, cb: () => void) => { listeners.push(cb); return {}; },
        offref: vi.fn(),
      },
    } as never,
    fireLayoutChange: () => listeners.forEach((cb) => (cb as () => void)()),
    listeners,
  };
}

function makeStore(): ConfigStore {
  return { load: () => ({}) } as unknown as ConfigStore;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupMdViewButton (v0.49.0 / F-051)', () => {
  it('md ファイルの view に Add to TTS ボタンを追加する', () => {
    const { view } = makeLeaf({ extension: 'md' });
    const app = makeApp([makeLeaf({ extension: 'md' }).leaf]);
    // leaf.view と view を同一にするため差し替え
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).toHaveBeenCalledWith('volume-2', expect.any(String), expect.any(Function));
    stop();
  });

  it('非 md ファイルには追加しない', () => {
    const { view } = makeLeaf({ extension: 'png' });
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).not.toHaveBeenCalled();
    stop();
  });

  it('マーカー済み（重複）の場合は追加しない（冪等）', () => {
    const { view, actionBtn } = makeLeaf({ extension: 'md' });
    actionBtn.setAttribute('data-cb-add-tts', '1');
    view.containerEl.appendChild(actionBtn);
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    expect(view.addAction).not.toHaveBeenCalled();
    stop();
  });

  it('クリックで addMdToTts 経由の読み上げフローが走る（file 欠落時はスキップ）', () => {
    // scan 時点では md ファイル有り（無いと addAction 自体が行われない）→ クリック時に file を欠落させる
    const { view } = makeLeaf({ extension: 'md' });
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [{ view }]);
    const stop = setupMdViewButton(app.app, makeStore());
    const [, , cb] = (view.addAction as ReturnType<typeof vi.fn>).mock.calls[0];
    (view as { file: unknown }).file = null; // 新規空タブ等で file が消えた状態を再現
    expect(() => (cb as () => void)()).not.toThrow(); // file=null → 静かにスキップ
    stop();
  });

  it('addAction が存在しない view では無害動作', () => {
    const leaf = { view: { file: { extension: 'md' }, containerEl: document.createElement('div') } };
    const app = makeApp([]);
    (app.app as { workspace: { getLeavesOfType: (t: string) => unknown[] } })
      .workspace.getLeavesOfType = vi.fn(() => [leaf]);
    expect(() => setupMdViewButton(app.app, makeStore())).not.toThrow();
  });
});
