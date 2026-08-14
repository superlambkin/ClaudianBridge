// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupCodeCopyFence } from '../../../src/features/code-copy-fence';

function makeStore(codeCopyFence: boolean) {
  return {
    load: () => ({ general: { codeCopyFence } }),
  } as unknown as import('../../../src/core/config-store').ConfigStore;
}

function buildWrapper(lang = 'mermaid', codeText = 'graph LR\n  A --> B') {
  const wrapper = document.createElement('div');
  wrapper.className = 'claudian-code-wrapper has-language';

  const label = document.createElement('span');
  label.className = 'claudian-code-lang-label';
  label.textContent = lang;

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-' + lang;
  code.textContent = codeText;
  pre.appendChild(code);

  wrapper.appendChild(label);
  wrapper.appendChild(pre);
  document.body.appendChild(wrapper);
  return { wrapper, label, code };
}

describe('setupCodeCopyFence', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('ON: 言語ラベルクリックでフェンス付き内容がクリップボードへ書かれる', async () => {
    const store = makeStore(true);
    const cleanup = setupCodeCopyFence(store);
    const { label } = buildWrapper();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    label.dispatchEvent(event);

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '```mermaid\ngraph LR\n  A --> B\n```'
      );
    });
    // realclaudian の素通しコピーをブロックする
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it('ON: ラベル表示が一時的に Copied! になる', async () => {
    vi.useFakeTimers();
    try {
      const store = makeStore(true);
      const cleanup = setupCodeCopyFence(store);
      const { label } = buildWrapper();

      label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await vi.waitFor(() => {
        expect(label.textContent).toBe('Copied!');
      });

      await vi.advanceTimersByTime(1500);
      expect(label.textContent).toBe('mermaid');
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('OFF: 素通し（writeText は呼ばれない）', () => {
    const store = makeStore(false);
    const cleanup = setupCodeCopyFence(store);
    const { label } = buildWrapper();

    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    cleanup();
  });

  it('cleanup 後はリスナーが解除される', () => {
    const store = makeStore(true);
    const cleanup = setupCodeCopyFence(store);
    const { label } = buildWrapper();
    cleanup();

    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('言語ラベル以外のクリックでは何もしない', () => {
    const store = makeStore(true);
    const cleanup = setupCodeCopyFence(store);
    const { wrapper } = buildWrapper();

    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    cleanup();
  });
});
