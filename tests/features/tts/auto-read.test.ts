// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupAutoReadTTS } from '../../../src/features/tts/auto-read';
import type { ConfigStore } from '../../../src/core/config-store';

const REPORT_HTML = `
  <div class="claudian-message-assistant">
    <div class="claudian-message-content">
      <blockquote><p>📢 テストタスクを完了しました。</p></blockquote>
    </div>
  </div>`;

function makeView(innerHtml: string, extra: Record<string, unknown> = {}) {
  const containerEl = document.createElement('div');
  const messages = document.createElement('div');
  messages.className = 'claudian-messages';
  messages.innerHTML = innerHtml;
  containerEl.appendChild(messages);
  return { containerEl, callbacks: {}, ...extra } as Record<string, unknown> & {
    containerEl: HTMLElement;
    callbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void };
  };
}

function makeApp(views: unknown[]) {
  const listeners: Array<() => void> = [];
  return {
    app: {
      plugins: { plugins: { realclaudian: { getAllViews: () => views } } },
      workspace: {
        on: (_name: string, cb: () => void) => { listeners.push(cb); return { cb }; },
        offref: vi.fn(),
      },
    } as never,
    fireLayoutChange: () => listeners.forEach((cb) => cb()),
  };
}

function makeStore(autoRead?: { enabled: boolean; scope: 'header' | 'full' }, ttsEnabled = true) {
  return {
    load: () => ({ tts: { enabled: ttsEnabled, autoRead: autoRead ?? { enabled: true, scope: 'header' } } }),
  } as unknown as ConfigStore;
}

describe('setupAutoReadTTS', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('callbacks.onTabStreamingChanged をチェーンし、元コールバックも呼ばれる', () => {
    const orig = vi.fn();
    const view = makeView(REPORT_HTML);
    view.callbacks.onTabStreamingChanged = orig;
    const { app } = makeApp([view]);
    setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true) });
    view.callbacks.onTabStreamingChanged!('tab1', true);
    expect(orig).toHaveBeenCalledWith('tab1', true);
  });

  it('true→false 遷移で 📢 テキストを speak に渡す', async () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('tab1', true);
    view.callbacks.onTabStreamingChanged!('tab1', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('📢 テストタスクを完了しました。');
  });

  it('true→true / false→false では発火しない', () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('t', false); // 初回 false（prev なし）
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', true); // 遷移なし
    expect(speak).not.toHaveBeenCalled();
  });

  it('autoRead.enabled=false では発火しない', () => {
    const view = makeView(REPORT_HTML);
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore({ enabled: false, scope: 'header' }), speak });
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('📢 なしの応答では発火しない', () => {
    const view = makeView('<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常応答</p></div></div>');
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('layout-change で新しい view に hook される（二重 hook しない）', () => {
    const v1 = makeView(REPORT_HTML);
    const { app, fireLayoutChange } = makeApp([v1]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    const hooked1 = v1.callbacks.onTabStreamingChanged;
    fireLayoutChange(); // 再スキャン
    expect(v1.callbacks.onTabStreamingChanged).toBe(hooked1); // 同一関数のまま
  });

  it('fallback: callbacks が無く onStreamingChanged メソッドがある場合はラップ', async () => {
    const view = makeView(REPORT_HTML, {
      onStreamingChanged(_id: string, _streaming: boolean) { /* 本家処理 */ },
    });
    delete (view as Record<string, unknown>).callbacks;
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    (view as unknown as { onStreamingChanged: (id: string, s: boolean) => void }).onStreamingChanged('c', true);
    (view as unknown as { onStreamingChanged: (id: string, s: boolean) => void }).onStreamingChanged('c', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
  });

  it('hook ポイントなし → noticeFn 警告（1回のみ）', () => {
    const view = makeView(REPORT_HTML);
    delete (view as Record<string, unknown>).callbacks;
    const { app } = makeApp([view, makeView(REPORT_HTML)]);
    const noticeFn = vi.fn();
    setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true), noticeFn });
    expect(noticeFn).toHaveBeenCalledTimes(1);
    expect(noticeFn.mock.calls[0][0]).toContain('自動読み上げ');
  });

  it('realclaudian 未インストール → 静かに何もしない', () => {
    const app = {
      plugins: { plugins: {} },
      workspace: { on: () => ({}), offref: vi.fn() },
    } as never;
    const noticeFn = vi.fn();
    expect(() => setupAutoReadTTS({ app, store: makeStore(), speak: vi.fn(async () => true), noticeFn })).not.toThrow();
    expect(noticeFn).not.toHaveBeenCalled();
  });
});
