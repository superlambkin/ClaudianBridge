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

  // Bug regression: カウンター再注入（設定変更など）直後の avgRate が異常に高くなる症状の防止
  // start() 直後は state.startTime が経過 0 だがアシスタントには既に大量テキストが存在するため
  // 「総文字数 / 経過 0秒」が異常に高い数値として描画されてしまう。
  // baseline-only 経路で state.startTime も now に再設定することで、初周期の avgRate は 0 になる。
  it('カウンター再注入（mid-stream）直後の初周期 avgRate は異常に高くない', () => {
    vi.useFakeTimers();
    // 既存アシスタント要素に大量テキストを置いた状態を作り、
    // その後にカウンターが新規 start() で注入される状況を再現
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    asst.textContent = 'A'.repeat(300); // 100 tokens 相当
    document.body.appendChild(asst);
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start(); // 注入：mid-stream シナリオ（既にアシスタント要素あり）
    vi.advanceTimersByTime(250); // baseline-only（elementChanged=true）
    const s = c.getState();
    // 直後に巨大 avgRate が出ていないこと（= 再注入時に startTime が baseline と同期）
    expect(s.avgRate).toBeLessThan(20);
    vi.useRealTimers();
    c.destroy();
  });

  // Bug regression: ユーザー送信から初回アシスタント到着まで長い遅延があるとき
  // 旧実装は state.startTime が start() 時のままなので avgRate 分母が膨大になり
  // 「平均 0.0 tok/s」と表示される。ユーザー送信時に cycleStartTime だけでなく
  // state.startTime もリセットすることで初周期から妥当な avgRate が出る。
  it('ユーザー送信から初回アシスタント到着まで長い遅延があっても avgRate が 0.0 にならない', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    // 5 分放置（長い遅延）
    vi.advanceTimersByTime(5 * 60 * 1000);
    // ユーザー送信
    const user = document.createElement('div');
    user.className = 'claudian-message-user';
    user.textContent = 'hello';
    document.body.appendChild(user);
    vi.advanceTimersByTime(250);
    // アシスタント初トークン（TTFT 2 秒）
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    vi.advanceTimersByTime(250); // baseline-only
    asst.textContent = 'A'.repeat(60); // 20 tokens
    vi.advanceTimersByTime(250); // rate 計算窓
    const s = c.getState();
    // 旧実装だと elapsed が 5 分超、tokens が 20 で avgRate = 20/300 ≈ 0.07 → "0.0" 表示
    // 修正後は TTFT 完了時に startTime がリセットされ、avgRate は妥当な値
    expect(s.avgRate).toBeGreaterThan(1); // 1 tok/s 以上出る
    expect(s.rate).toBeGreaterThan(70);
    vi.useRealTimers();
    c.destroy();
  });

  // 機能追加: ユーザー要望 — streaming 終了時 / stop() 呼び出し時に最大値をリセット
  // 同一カウンターで複数ストリームを扱う際、過去の最大値が累積して
  // 新しいストリームの最大値と比較できなくなる問題を防止する。
  it('streaming 終了時（isStreaming true→false 遷移）に maxRate がリセットされる', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(30);
    vi.advanceTimersByTime(250); // ベースライン
    asst.textContent = 'A'.repeat(90);
    vi.advanceTimersByTime(250); // rate = 80, maxRate = 80
    expect(c.getState().maxRate).toBeGreaterThan(70);
    // streaming 終了: 2.5 秒（isStreaming 判定閾値）以上 DOM 変化なしで経過
    vi.advanceTimersByTime(3000);
    expect(c.getState().maxRate).toBe(0);
    vi.useRealTimers();
    c.destroy();
  });

  it('stop() 呼び出しで maxRate がリセットされる', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(30);
    vi.advanceTimersByTime(250);
    asst.textContent = 'A'.repeat(90);
    vi.advanceTimersByTime(250);
    expect(c.getState().maxRate).toBeGreaterThan(70);
    c.stop();
    expect(c.getState().maxRate).toBe(0);
    vi.useRealTimers();
    c.destroy();
  });

  // 機能追加: ユーザー要望 — streaming 終了後に avgRate を凍結（更新しない）
  // 旧実装: streaming 終了後も tick が継続 → elapsed だけ増えて avgRate が shrink して 0 に近づく
  // 修正後: 前回 tick で streaming 中だった場合のみ avgRate を更新し、
  //        isStreaming = false 後は最終値で凍結
  it('streaming 終了後に avgRate が凍結される（elapsed shrink しない）', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    document.body.appendChild(asst);
    asst.textContent = 'A'.repeat(60);
    vi.advanceTimersByTime(250); // ベースライン
    asst.textContent = 'A'.repeat(120);
    vi.advanceTimersByTime(250); // rate = 80 tok/s, avgRate > 0
    const avgDuringStream = c.getState().avgRate;
    expect(avgDuringStream).toBeGreaterThan(0);
    // streaming 終了: DOM 変化停止 + 2.5 秒経過
    vi.advanceTimersByTime(3000);
    // isStreaming が false になった瞬間の avgRate を捕捉（凍結値）
    const avgAtFreeze = c.getState().avgRate;
    expect(avgAtFreeze).toBeGreaterThan(0);
    // さらに時間経過: avgRate は凍結されたまま（shrink しない）
    vi.advanceTimersByTime(5000);
    expect(c.getState().avgRate).toBe(avgAtFreeze);
    vi.useRealTimers();
    c.destroy();
  });

  // Bug regression: 短い応答が一括で到着するケースで avgRate が 0 のままになる症状の防止
  // 旧実装 (v0.38.3 初回): baseline-only tick で state.startTime が now にリセットされ、
  // dTokensForAvg > 0 で avgRate 更新されるも elapsed = 0 → avgRate = 0。
  // 続く tick では dTokensForAvg = 0 → 凍結値 0 のまま。
  // 修正: baseline-only tick で content あり (chars > 0) のとき、
  // intervalMs を経過時間の代理として avgRate = tokens / (intervalMs/1000) を更新する。
  it('一括配信（短い応答が一気に到着）でも avgRate が 0 のままにならない', () => {
    vi.useFakeTimers();
    const c = createTokenRateCounter(container, { intervalMs: 250, charPerToken: 3 });
    c.start();
    // アシスタント要素に最初から全コンテンツが入った状態で出現（典型的な短い応答）
    const asst = document.createElement('div');
    asst.setAttribute('data-role', 'assistant');
    asst.textContent = 'A'.repeat(60); // 20 tokens
    document.body.appendChild(asst);
    vi.advanceTimersByTime(250); // baseline-only
    const s = c.getState();
    // 旧実装だと avgRate = 20/0 = 0（凍結）
    // 修正後は intervalMs (0.25s) を代理経過時間として avgRate = 20/0.25 = 80
    expect(s.avgRate).toBeGreaterThan(20);
    vi.useRealTimers();
    c.destroy();
  });
});