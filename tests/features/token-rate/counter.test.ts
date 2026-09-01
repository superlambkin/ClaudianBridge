// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTokenRateCounter } from '../../../src/features/token-rate/counter';

describe('createTokenRateCounter', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('初期化直後は startTime=null, rate=0', () => {
    const c = createTokenRateCounter(container);
    const s = c.getState();
    expect(s.startTime).toBeNull();
    expect(s.rate).toBe(0);
    expect(s.avgRate).toBe(0);
    expect(s.maxRate).toBe(0);
    expect(s.ttftMs).toBeNull();
    expect(s.isStreaming).toBe(false);
    c.destroy();
  });

  it('start() で startTime がセットされる', () => {
    const c = createTokenRateCounter(container);
    c.start();
    const s = c.getState();
    expect(s.startTime).not.toBeNull();
    c.destroy();
  });

  it('DOM テキスト追加で currentChars が増える', async () => {
    const c = createTokenRateCounter(container, { intervalMs: 250 });
    c.start();
    const target = document.createElement('div');
    target.className = 'claudian-message';
    target.setAttribute('data-role', 'assistant');
    document.body.appendChild(target);
    target.textContent = 'Hello world';
    await vi.waitFor(() => {
      expect(c.getState().currentChars).toBeGreaterThan(0);
    }, { timeout: 500 });
    c.destroy();
  });

  it('速度計算: 250ms で 60 chars 追加 → 約 80 tok/s', async () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const target = document.createElement('div');
    document.body.appendChild(target);
    target.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(250);
    const rate = c.getState().rate;
    expect(rate).toBeGreaterThan(70);
    expect(rate).toBeLessThan(90);
    vi.useRealTimers();
    c.destroy();
  });

  it('ゼロ除算防止: 経過時間 0 で rate が NaN にならない', () => {
    const c = createTokenRateCounter(container);
    c.start();
    expect(Number.isNaN(c.getState().rate)).toBe(false);
    expect(Number.isNaN(c.getState().avgRate)).toBe(false);
    expect(Number.isNaN(c.getState().maxRate)).toBe(false);
    c.destroy();
  });

  it('速度計算: 平均・最大・TTFT も更新され、DOM に 4 値が描画される', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    // ユーザーメッセージ送信 → TTFT サイクル開始
    const user = document.createElement('div');
    user.className = 'claudian-message-user';
    user.textContent = 'hello';
    document.body.appendChild(user);
    vi.advanceTimersByTime(250);
    // アシスタントの最初のトークン到着
    const asst = document.createElement('div');
    asst.className = 'claudian-message-assistant';
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(250);
    const s = c.getState();
    expect(s.rate).toBeGreaterThan(70);
    expect(s.avgRate).toBeGreaterThan(0);
    expect(s.maxRate).toBeGreaterThan(70);
    expect(s.ttftMs).toBeGreaterThan(0);
    const msg = container.querySelector('.cb-token-rate')!.textContent ?? '';
    expect(msg).toContain('首');
    expect(msg).toContain('現在');
    expect(msg).toContain('平均');
    expect(msg).toContain('最大');
    expect(msg).toContain('tok/s');
    vi.useRealTimers();
    c.destroy();
  });

  it('stop() でフェードアウト: 3 秒後に .is-fading', async () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { fadeOutMs: 3000 });
    c.start();
    c.stop();
    vi.advanceTimersByTime(3100);
    expect(container.querySelector('.cb-token-rate')?.classList.contains('is-fading')).toBe(true);
    vi.useRealTimers();
    c.destroy();
  });

  it('destroy() で MutationObserver disconnect + DOM 要素削除', () => {
    const c = createTokenRateCounter(container);
    c.start();
    expect(container.querySelector('.cb-token-rate')).not.toBeNull();
    c.destroy();
    expect(container.querySelector('.cb-token-rate')).toBeNull();
  });

  it('insertBefore 指定で指定要素の直前に挿入される', () => {
    const anchor = document.createElement('div');
    anchor.className = 'yolo';
    container.appendChild(anchor);
    const c = createTokenRateCounter(container, { insertBefore: anchor });
    expect(anchor.previousElementSibling?.classList.contains('cb-token-rate')).toBe(true);
    c.destroy();
  });

  it('visible 指定で対応セグメントが生成されない', () => {
    const c = createTokenRateCounter(container, { visible: { max: false, avg: false } });
    const el = container.querySelector('.cb-token-rate')!;
    expect(el.querySelector('.cb-token-rate-max')).toBeNull();
    expect(el.querySelector('.cb-token-rate-avg')).toBeNull();
    expect(el.querySelector('.cb-token-rate-ttft')).not.toBeNull();
    expect(el.querySelector('.cb-token-rate-value')).not.toBeNull();
    expect(el.getAttribute('data-visible')).toBe('ttft,current');
    c.destroy();
  });

  it('区切り · は表示セグメント間のみ', () => {
    const c = createTokenRateCounter(container, { visible: { ttft: false, current: true, avg: false, max: true } });
    const el = container.querySelector('.cb-token-rate')!;
    expect(el.querySelectorAll('.cb-token-rate-sep')).toHaveLength(1);
    expect(el.getAttribute('data-visible')).toBe('current,max');
    c.destroy();
  });

  it('全 OFF でも要素は存続（ドットのみ・区切りなし）', () => {
    const c = createTokenRateCounter(container, { visible: { ttft: false, current: false, avg: false, max: false } });
    const el = container.querySelector('.cb-token-rate')!;
    expect(el.querySelectorAll('.cb-token-rate-sep')).toHaveLength(0);
    expect(el.querySelector('.cb-token-rate-dot')).not.toBeNull();
    expect(el.getAttribute('data-visible')).toBe('');
    c.destroy();
  });
});