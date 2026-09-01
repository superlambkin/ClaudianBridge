// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTokenRateCounter } from '../../../src/features/token-rate/counter';

// counter.ts の内部 DEFAULTS 詳細に依存しないためのフォールバック定数。
// Task 4 で counter.ts の DEFAULTS.intervalMs を 500→250 に変更するときに
// 同時にこの定数も 250 に揃えること。
const DEFAULTS_INTERVAL_FALLBACK = 250; // v0.32.0 で既定を 500→250 に変更

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
    target.className = 'claudian-message';
    target.setAttribute('data-role', 'assistant');
    document.body.appendChild(target);
    // 初回 tick はベースライン設定（再注入スパイク防止のため rate 計算対象外）
    vi.advanceTimersByTime(250);
    // 成長窓: 250ms で 60 chars 追加 (0 → 20 tokens) → 約 80 tok/s
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
    // 初回 tick はベースライン設定（再注入スパイク防止のため rate 計算対象外）
    vi.advanceTimersByTime(250);
    // 成長窓: 250ms で 60 chars 追加 (0 → 20 tokens) → 約 80 tok/s
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

  it('アシスタント要素が消失した窓ではレート計算をスキップする（body フォールバック廃止）', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    asst.textContent = 'A'.repeat(90);
    document.body.appendChild(asst);
    vi.advanceTimersByTime(250); // ベースライン設定
    asst.textContent = 'A'.repeat(120);
    vi.advanceTimersByTime(250); // rate = (40-30)/0.25 = 40
    const peak = c.getState().maxRate;
    expect(peak).toBeGreaterThan(0);
    asst.remove(); // 要素消失 → 旧実装では body 全文字数に急増してスパイク
    vi.advanceTimersByTime(250);
    expect(c.getState().maxRate).toBe(peak);
    expect(Number.isNaN(c.getState().rate)).toBe(false);
    vi.useRealTimers();
    c.destroy();
  });

  it('文字数減少の窓では maxRate を更新しない（ベースライン再設定）', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(30);
    vi.advanceTimersByTime(250); // ベースライン
    asst.textContent = 'A'.repeat(90);
    vi.advanceTimersByTime(250); // rate = (30-10)/0.25 = 80
    const peak = c.getState().maxRate;
    expect(peak).toBeGreaterThan(70);
    asst.textContent = 'A'.repeat(10); // DOM 再構成で一時減少
    vi.advanceTimersByTime(250);
    expect(c.getState().maxRate).toBe(peak); // 減少窓で最大値は更新されない
    asst.textContent = 'A'.repeat(40); // 回復
    vi.advanceTimersByTime(250);
    // 回復分 (10→40 chars: +10 tokens / 0.25s = 40) は 40 < 80 なので最大値は不変
    expect(c.getState().maxRate).toBe(peak);
    vi.useRealTimers();
    c.destroy();
  });

  it('縮小窓の直後の復帰窓で偽スパイクが再記録されない', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 500, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(500); // ベースライン（20 tokens）
    asst.textContent = 'A'.repeat(120);
    vi.advanceTimersByTime(500); // rate = (40-20)/0.5 = 40
    const peak = c.getState().maxRate;
    expect(peak).toBeGreaterThan(35);
    asst.textContent = ''; // 縮小窓（React 再レンダーで一時 0 chars）→ quarantine 設定
    vi.advanceTimersByTime(500);
    expect(c.getState().maxRate).toBe(peak);
    asst.textContent = 'A'.repeat(6000); // 復帰窓: 旧実装では (2000-0)/0.5 = 4000 tok/s を記録
    vi.advanceTimersByTime(500);
    expect(c.getState().maxRate).toBe(peak);
    vi.useRealTimers();
    c.destroy();
  });

  it('消失後に同一要素が再 attach された場合も初回確立扱いでスパイクしない', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    asst.textContent = 'A'.repeat(90);
    document.body.appendChild(asst);
    vi.advanceTimersByTime(250); // ベースライン（30 tokens）
    asst.textContent = 'A'.repeat(120);
    vi.advanceTimersByTime(250); // rate = (40-30)/0.25 = 40
    const peak = c.getState().maxRate;
    expect(peak).toBeGreaterThan(35);
    asst.remove(); // 消失窓
    vi.advanceTimersByTime(250);
    expect(c.getState().maxRate).toBe(peak);
    // 同一要素が再 attach（大量テキスト付き）→ 初回確立扱いで baseline-only
    document.body.appendChild(asst);
    vi.advanceTimersByTime(250);
    expect(c.getState().maxRate).toBe(peak);
    vi.useRealTimers();
    c.destroy();
  });

  it('アシスタント要素交代時に前メッセージとの差分でスパイクしない', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst1 = document.createElement('div');
    asst1.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst1);
    asst1.textContent = 'A'.repeat(30);
    vi.advanceTimersByTime(250); // ベースライン
    asst1.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(250); // rate = 40
    const peak = c.getState().maxRate;
    expect(peak).toBeGreaterThan(0);
    // 新メッセージ: 前メッセージより遥かに長いテキストを既に持つ新要素が出現
    const asst2 = document.createElement('div');
    asst2.setAttribute('data-role', 'assistant');
    asst2.textContent = 'B'.repeat(300);
    document.body.appendChild(asst2);
    vi.advanceTimersByTime(250);
    // 旧実装では (100-20) tokens / 0.25s = 320 tok/s の偽スパイクが記録された
    expect(c.getState().maxRate).toBe(peak);
    vi.useRealTimers();
    c.destroy();
  });

  it('data-interval 属性が intervalMs の値と一致して出力される', () => {
    const c = createTokenRateCounter(container, { intervalMs: 750 });
    expect(container.querySelector('.cb-token-rate')?.getAttribute('data-interval')).toBe('750');
    c.destroy();
  });

  it('intervalMs 未指定時の data-interval は DEFAULTS.intervalMs', () => {
    const c = createTokenRateCounter(container);
    const expected = String(DEFAULTS_INTERVAL_FALLBACK);
    expect(container.querySelector('.cb-token-rate')?.getAttribute('data-interval')).toBe(expected);
    c.destroy();
  });
});