// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const renderMock = vi.fn();
vi.mock('obsidian', () => ({
  MarkdownRenderer: { render: (...args: unknown[]) => renderMock(...args) },
  Notice: class {},
}));

import { setupMermaidRender } from '../../../src/features/mermaid-render';

function makeStore(on: boolean) {
  return { load: () => ({ general: { mermaidRender: on } }),
  } as unknown as import('../../../src/core/config-store').ConfigStore;
}

function buildWrapper(codeText = 'graph LR\n  A --> B', lang = 'mermaid') {
  const wrapper = document.createElement('div');
  wrapper.className = 'claudian-code-wrapper has-language';
  const label = document.createElement('span');
  label.className = 'claudian-code-lang-label';
  label.textContent = lang;
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = codeText;
  pre.appendChild(code);
  wrapper.appendChild(label);
  wrapper.appendChild(pre);
  document.body.appendChild(wrapper);
  return { wrapper, code };
}

const okRender = async (_app: unknown, _md: string, el: HTMLElement) => {
  const ok = document.createElement('div');
  ok.className = 'mermaid-render-ok';
  el.appendChild(ok);
};
const failRender = async (_app: unknown, _md: string, el: HTMLElement) => {
  const d = document.createElement('div');
  d.className = 'mod-empty';
  el.appendChild(d);
};

beforeEach(() => { vi.useFakeTimers(); renderMock.mockReset(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('setupMermaidRender', () => {
  it('ON: 確定した mermaid ブロックを描画して置換する', async () => {
    renderMock.mockImplementation(okRender);
    const { wrapper } = buildWrapper();
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    await vi.advanceTimersByTimeAsync(1300);
    expect(wrapper.querySelector('.mermaid-render-ok')).not.toBeNull();
    cleanup();
  });

  it('未確定ブロック（1.2 秒内に変化）は確定後のみ描画する', async () => {
    renderMock.mockImplementation(okRender);
    const { wrapper, code } = buildWrapper();
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    await vi.advanceTimersByTimeAsync(600);
    code.textContent += '\n  B --> C'; // ストリーミング中の追記
    await vi.advanceTimersByTimeAsync(1300); // ミスマッチ検出（t=1200）
    await vi.advanceTimersByTimeAsync(1300); // 再確定待ち（t=2400）
    expect(renderMock).toHaveBeenCalled();
    expect(wrapper.querySelector('.mermaid-render-ok')).not.toBeNull();
    cleanup();
  });

  it('mermaid 以外の言語は描画しない', async () => {
    renderMock.mockImplementation(okRender);
    const { wrapper } = buildWrapper('print("hi")', 'python');
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock).not.toHaveBeenCalled();
    expect(wrapper.querySelector('code')).not.toBeNull();
    cleanup();
  });

  it('OFF は素通し', async () => {
    renderMock.mockImplementation(okRender);
    const { wrapper } = buildWrapper();
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(false));
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('描画失敗時はコードブロックへフォールバック＋バッジ＋ログ', async () => {
    const log = vi.fn();
    renderMock.mockImplementation(failRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true), log);
    const { wrapper, code } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    expect(wrapper.querySelector('code')).not.toBeNull(); // 元コードが残る
    expect(wrapper.querySelector('.cb-mermaid-fail-badge')).not.toBeNull();
    expect(log).toHaveBeenCalled();
    expect((code.parentElement as HTMLElement).style.display).not.toBe('none');
    cleanup();
  });

  it('切替ボタンで図 ⇔ コードを往復できる', async () => {
    renderMock.mockImplementation(okRender);
    const { wrapper } = buildWrapper();
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    await vi.advanceTimersByTimeAsync(1300);
    const toggle = wrapper.querySelector('.cb-mermaid-toggle') as HTMLElement;
    expect(toggle).not.toBeNull();
    // 図 → コード
    toggle.click();
    expect((wrapper.querySelector('code')?.parentElement as HTMLElement).style.display).not.toBe('none');
    expect((wrapper.querySelector('.cb-mermaid-holder') as HTMLElement).style.display).toBe('none');
    // コード → 図
    toggle.click();
    expect((wrapper.querySelector('.cb-mermaid-holder') as HTMLElement).style.display).not.toBe('none');
    cleanup();
  });

  it('同じ wrapper は二度と処理しない', async () => {
    renderMock.mockImplementation(okRender);
    const cleanup = setupMermaidRender({} as never, {} as never, makeStore(true));
    const { code } = buildWrapper();
    await vi.advanceTimersByTimeAsync(1300);
    const calls = renderMock.mock.calls.length;
    code.textContent = 'graph TB\n  X --> Y'; // 内容変更しても再描画しない
    await vi.advanceTimersByTimeAsync(1300);
    expect(renderMock.mock.calls.length).toBe(calls);
    cleanup();
  });
});
