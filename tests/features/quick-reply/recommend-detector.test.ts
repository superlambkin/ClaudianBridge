// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractRecommendedOption } from '../../../src/features/quick-reply/recommend-detector';
import { readRecommendedOption, setupRecommendDetection } from '../../../src/features/quick-reply/recommend-detector';

describe('extractRecommendedOption', () => {
  it('ja: 「推奨は方案2」→ 2', () => {
    expect(extractRecommendedOption('案内:\n- 方案1: A\n- 方案2: B\n推奨は方案2です')).toBe(2);
  });
  it('ja: 「おすすめ: 方案3」→ 3', () => {
    expect(extractRecommendedOption('おすすめ: 方案3')).toBe(3);
  });
  it('zh: 「推荐方案1」→ 1', () => {
    expect(extractRecommendedOption('推荐方案1')).toBe(1);
  });
  it('zh: 「建议选择方案4」→ 4', () => {
    expect(extractRecommendedOption('建议选择方案4')).toBe(4);
  });
  it('en: "I recommend option 5." → 5', () => {
    expect(extractRecommendedOption('I recommend option 5.')).toBe(5);
  });
  it('en: "recommended: 2" → 2', () => {
    expect(extractRecommendedOption('recommended: 2')).toBe(2);
  });
  it('推奨なし → null', () => {
    expect(extractRecommendedOption('方案1: A\n方案2: B')).toBeNull();
  });
  it('範囲外（6 以上）→ null', () => {
    expect(extractRecommendedOption('推奨は方案6')).toBeNull();
  });
  it('ja: 「推奨は方案10」→ null（桁境界: 先頭桁 1 を誤マッチしない）', () => {
    expect(extractRecommendedOption('推奨は方案10')).toBeNull();
  });
  it('en: "I recommend option 10." → null（桁境界: 先頭桁 1 を誤マッチしない）', () => {
    expect(extractRecommendedOption('I recommend option 10.')).toBeNull();
  });
  it('空文字 → null', () => {
    expect(extractRecommendedOption('')).toBeNull();
  });
});

function makeAppWithMessages(messagesEl: HTMLElement | null | (() => HTMLElement | null)) {
  // タブ切替テスト用に getter も受け付ける（アクティブタブの messagesEl が動的に変わる）
  const resolve = typeof messagesEl === 'function' ? messagesEl : () => messagesEl;
  return {
    plugins: {
      plugins: {
        realclaudian: {
          getView: () => ({
            getActiveTab: () => ({ dom: { messagesEl: resolve() } }),
          }),
        },
      },
    },
  } as unknown as import('obsidian').App;
}

describe('readRecommendedOption', () => {
  it('最後の assistant メッセージから推奨方案を読む', () => {
    const messagesEl = document.createElement('div');
    messagesEl.className = 'claudian-messages';
    messagesEl.innerHTML = `
      <div data-role="assistant"><div class="claudian-message-content">まずA</div></div>
      <div data-role="assistant"><div class="claudian-message-content">推奨は方案4</div></div>
    `;
    expect(readRecommendedOption(makeAppWithMessages(messagesEl))).toBe(4);
  });

  it('messagesEl が無い → null', () => {
    expect(readRecommendedOption(makeAppWithMessages(null))).toBeNull();
  });

  it('assistant メッセージが無い → null', () => {
    const messagesEl = document.createElement('div');
    messagesEl.className = 'claudian-messages';
    messagesEl.innerHTML = '<div data-role="user"><div class="claudian-message-content">hi</div></div>';
    expect(readRecommendedOption(makeAppWithMessages(messagesEl))).toBeNull();
  });
});

describe('setupRecommendDetection', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.useRealTimers(); });

  it('メッセージ追加で onChange がデバウンス後に呼ばれる', async () => {
    vi.useFakeTimers();
    const messagesEl = document.createElement('div');
    messagesEl.className = 'claudian-messages';
    messagesEl.innerHTML = '<div data-role="assistant"><div class="claudian-message-content">まずA</div></div>';
    document.body.appendChild(messagesEl);

    const onChange = vi.fn();
    const app = makeAppWithMessages(messagesEl);
    const cleanup = setupRecommendDetection(app, onChange);

    // 初回スキャン
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith(null);

    // 新しい assistant メッセージを追記 → デバウンス後に再スキャン
    const msg = document.createElement('div');
    msg.setAttribute('data-role', 'assistant');
    msg.innerHTML = '<div class="claudian-message-content">推奨は方案2</div>';
    messagesEl.appendChild(msg);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith(2);

    cleanup();
  });

  it('タブ切替（.claudian-messages を CONTAINS するラッパー再構築）で再スキャンする', async () => {
    vi.useFakeTimers();
    const oldMessagesEl = document.createElement('div');
    oldMessagesEl.className = 'claudian-messages';
    oldMessagesEl.innerHTML = '<div data-role="assistant"><div class="claudian-message-content">まずA</div></div>';
    document.body.appendChild(oldMessagesEl);

    // アクティブタブの messagesEl が動的に変わることを模す
    let activeMessagesEl: HTMLElement | null = oldMessagesEl;

    const onChange = vi.fn();
    const app = makeAppWithMessages(() => activeMessagesEl);
    const cleanup = setupRecommendDetection(app, onChange);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith(null);

    // realclaudian のタブ切替を模す: 新コンテナを「デタッチ状態」でラッパー内に構築し、
    // そのラッパーを body へ一括挿入する。このとき observer が観測する added node は
    // ラッパーのみ（中の .claudian-messages はデタッチ中に追加されたため記録されない）。
    const wrapper = document.createElement('div');
    const newMessagesEl = document.createElement('div');
    newMessagesEl.className = 'claudian-messages';
    newMessagesEl.innerHTML = '<div data-role="assistant"><div class="claudian-message-content">推奨は方案3</div></div>';
    wrapper.appendChild(newMessagesEl);
    activeMessagesEl = newMessagesEl;
    oldMessagesEl.replaceWith(wrapper);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith(3);

    cleanup();
  });
});
