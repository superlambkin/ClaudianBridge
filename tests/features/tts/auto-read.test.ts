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

  it('realclaudian 実構造: view.getTabManager().callbacks に hook して発火する', async () => {
    // realclaudian 本体の実測構造: view 自体には callbacks も onStreamingChanged も無く、
    // callbacks は view.getTabManager().callbacks にある（v0.11.0 不発火の根因）
    const view = makeView(REPORT_HTML);
    delete (view as Record<string, unknown>).callbacks;
    const tmCallbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void } = {};
    (view as Record<string, unknown>).getTabManager = () => ({ callbacks: tmCallbacks });
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    tmCallbacks.onTabStreamingChanged!('t', true);
    tmCallbacks.onTabStreamingChanged!('t', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('📢 テストタスクを完了しました。');
  });

  it('同一 view 内の複数 tab は tabId 単位で遷移判定される', async () => {
    const view = makeView(REPORT_HTML);
    delete (view as Record<string, unknown>).callbacks;
    const tmCallbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void } = {};
    (view as Record<string, unknown>).getTabManager = () => ({ callbacks: tmCallbacks });
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    tmCallbacks.onTabStreamingChanged!('tabA', true);
    tmCallbacks.onTabStreamingChanged!('tabB', true);
    tmCallbacks.onTabStreamingChanged!('tabA', false); // tabA 完了 → 1 回目
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    // タブ切替を模して新規メッセージ DOM を再構築（実運用では tab 切替で再描画される）
    const messages = view.containerEl.querySelector('.claudian-messages')!;
    messages.innerHTML = REPORT_HTML;
    tmCallbacks.onTabStreamingChanged!('tabB', false); // tabB 完了 → 2 回目
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
  });

  it('複数タブ時はアクティブタブ（.claudian-hidden なし）のメッセージ領域から抽出する', async () => {
    // 実 realclaudian 構造: view 直下に複数の .claudian-tab-content があり、
    // 各タブが個別の .claudian-messages を持つ。非アクティブタブは claudian-hidden。
    const containerEl = document.createElement('div');
    const tab1 = document.createElement('div');
    tab1.className = 'claudian-tab-content claudian-hidden';
    const msgs1 = document.createElement('div');
    msgs1.className = 'claudian-messages';
    msgs1.innerHTML = '<div class="claudian-message-assistant"><div class="claudian-message-content"><p>タブ1の通常応答（📢 なし）</p></div></div>';
    tab1.appendChild(msgs1);
    const tab2 = document.createElement('div');
    tab2.className = 'claudian-tab-content'; // アクティブタブ
    const msgs2 = document.createElement('div');
    msgs2.className = 'claudian-messages';
    msgs2.innerHTML = REPORT_HTML;
    tab2.appendChild(msgs2);
    containerEl.appendChild(tab1);
    containerEl.appendChild(tab2);

    const view = { containerEl, callbacks: {} } as Record<string, unknown> & {
      containerEl: HTMLElement;
      callbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void };
    };
    const { app } = makeApp([view]);
    const speak = vi.fn(async () => true);
    setupAutoReadTTS({ app, store: makeStore(), speak });
    view.callbacks.onTabStreamingChanged!('t', true);
    view.callbacks.onTabStreamingChanged!('t', false);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toContain('📢 テストタスクを完了しました。');
  });

  it('stream-end 時に blockquote 未レンダリングでも、遅延後に現れたら読み上げる（v0.12.1 リトライ）', async () => {
    vi.useFakeTimers();
    try {
      // 初期 DOM には blockquote が無い（markdown レンダリング中）状態
      const view = makeView('<div class="claudian-message-assistant"><div class="claudian-message-content"><p>レンダリング中…</p></div></div>');
      delete (view as Record<string, unknown>).callbacks;
      const tmCallbacks: { onTabStreamingChanged?: (id: string, streaming: boolean) => void } = {};
      (view as Record<string, unknown>).getTabManager = () => ({ callbacks: tmCallbacks });
      const { app } = makeApp([view]);
      const speak = vi.fn(async () => true);
      setupAutoReadTTS({ app, store: makeStore(), speak });

      tmCallbacks.onTabStreamingChanged!('t', true);
      tmCallbacks.onTabStreamingChanged!('t', false); // stream-end → 抽出 null → リトライ開始

      // 400ms 経過: attempt 1 はまだ null。この後 markdown レンダリング完了を模擬
      vi.advanceTimersByTime(400);
      const messages = view.containerEl.querySelector('.claudian-messages')!;
      messages.innerHTML = REPORT_HTML; // blockquote がここで出現

      // attempt 2(800ms) で抽出成功 → speak
      await vi.advanceTimersByTimeAsync(400);
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak.mock.calls[0][0]).toContain('📢 テストタスクを完了しました。');
    } finally {
      vi.useRealTimers();
    }
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
