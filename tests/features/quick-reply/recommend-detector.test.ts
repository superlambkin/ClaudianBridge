// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractRecommendedOption } from '../../../src/features/quick-reply/recommend-detector';
import { readRecommendedOption, setupRecommendDetection } from '../../../src/features/quick-reply/recommend-detector';
import { readRecommendationState } from '../../../src/features/quick-reply/recommend-detector';

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
  // === v0.26.0: 案/最優先/第一選択/優先案/best/prefer の追加パターン ===
  it('ja: 「案2 が推奨」→ 2（方 なしの「案」も検出）', () => {
    expect(extractRecommendedOption('- 案1: A\n- 案2: B\n案2 が推奨')).toBe(2);
  });
  it('ja: 「推奨案は 案3」→ 3', () => {
    expect(extractRecommendedOption('推奨案は 案3')).toBe(3);
  });
  it('ja: 「最優先は案1」→ 1', () => {
    expect(extractRecommendedOption('最優先は案1')).toBe(1);
  });
  it('ja: 「第一選択は 案4」→ 4', () => {
    expect(extractRecommendedOption('第一選択は 案4')).toBe(4);
  });
  it('zh: 「首选是方案2」→ 2', () => {
    expect(extractRecommendedOption('首选是方案2')).toBe(2);
  });
  it('zh: 「优选 案1」→ 1', () => {
    expect(extractRecommendedOption('优选 案1')).toBe(1);
  });
  it('en: "best option 3" → 3', () => {
    expect(extractRecommendedOption('best option 3')).toBe(3);
  });
  it('en: "prefer option 2" → 2', () => {
    expect(extractRecommendedOption('I prefer option 2')).toBe(2);
  });
  it('ja: 「案10」→ null（桁境界）', () => {
    expect(extractRecommendedOption('案10')).toBeNull();
  });
  // === v0.30.2: 完了報告（次のアクション提案）の 👑 推奨マーカー ===
  it('完了報告: 「👑1」→ 1（推奨マーカー）', () => {
    expect(extractRecommendedOption('| 👑1 | 感想文を書く | 🔴 P0 | |')).toBe(1);
  });
  it('完了報告: 「推奨は案2」があれば 方案 優先 → 2', () => {
    expect(extractRecommendedOption('推奨は案2です。| 👑3 | 別案 |')).toBe(2);
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

  it('メッセージ追加で onChange に RecommendState が渡る', async () => {
    vi.useFakeTimers();
    const messagesEl = document.createElement('div');
    messagesEl.className = 'claudian-messages';
    messagesEl.innerHTML = '<div data-role="assistant"><div class="claudian-message-content">まずA</div></div>';
    document.body.appendChild(messagesEl);

    const onChange = vi.fn();
    const cleanup = setupRecommendDetection(makeAppWithMessages(messagesEl), onChange);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith({ recommended: null, maxOptionCount: 0 });

    const msg = document.createElement('div');
    msg.setAttribute('data-role', 'assistant');
    msg.innerHTML = '<div class="claudian-message-content">方案1、方案2 を提示。推奨は方案2</div>';
    messagesEl.appendChild(msg);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenLastCalledWith({ recommended: 2, maxOptionCount: 2 });

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
    expect(onChange).toHaveBeenLastCalledWith({ recommended: null, maxOptionCount: 0 });

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
    expect(onChange).toHaveBeenLastCalledWith({ recommended: 3, maxOptionCount: 3 });

    cleanup();
  });
});

import { extractMaxOptionCount } from '../../../src/features/quick-reply/recommend-detector';

describe('extractMaxOptionCount', () => {
  it('個別表記: 方案1、方案2、方案3 → 3', () => {
    expect(extractMaxOptionCount('方案1: A\n方案2: B\n方案3: C')).toBe(3);
  });
  it('範囲表記: 方案1〜5 → 5', () => {
    expect(extractMaxOptionCount('方案1〜5')).toBe(5);
  });
  it('範囲表記: 方案1～5（全角チルダ U+FF5E）→ 5', () => {
    expect(extractMaxOptionCount('方案1～5')).toBe(5);
  });
  it('範囲表記: 方案1〜7 → 7（生の最大値。5 へはクランプしない）', () => {
    expect(extractMaxOptionCount('方案1〜7')).toBe(7);
  });
  it('範囲表記: 方案1-3 → 3', () => {
    expect(extractMaxOptionCount('方案1-3')).toBe(3);
  });
  it('範囲表記: 方案1〜方案5 → 5', () => {
    expect(extractMaxOptionCount('方案1〜方案5')).toBe(5);
  });
  it('混在: 方案1、方案2、方案1〜5 → 5', () => {
    expect(extractMaxOptionCount('方案1、方案2 は任意、方案1〜5 から選ぶ')).toBe(5);
  });
  it('選択肢が 1 つ → 1', () => {
    expect(extractMaxOptionCount('方案1で進めます')).toBe(1);
  });
  it('該当なし → 0', () => {
    expect(extractMaxOptionCount('了解しました。')).toBe(0);
  });
  it('空文字 → 0', () => {
    expect(extractMaxOptionCount('')).toBe(0);
  });
  // === v0.26.0: 「案」（方案なし）もカウント対象 ===
  it('個別表記: 案1、案2、案3、案4 → 4', () => {
    expect(extractMaxOptionCount('案1: A\n案2: B\n案3: C\n案4: D')).toBe(4);
  });
  it('混在: 案1、案2 と 方案3 → 3', () => {
    expect(extractMaxOptionCount('案1 と 案2 もありますが、方案3 が本命です')).toBe(3);
  });
  it('範囲表記: 案1〜4 → 4', () => {
    expect(extractMaxOptionCount('案1〜4 を比較した結果')).toBe(4);
  });
  // === v0.30.2: 完了報告（次のアクション提案）の選択肢検出 ===
  it('完了報告: 「👑1」「数字（1/2/3）」→ 3', () => {
    expect(extractMaxOptionCount(
      '| 👑1 | 感想文 | 🔴 P0 |\n| 2 | 志望動機 | 🟡 P1 |\n| 3 | 添削 | 🟡 P1 |\n数字（1/2/3）でご指示ください。'
    )).toBe(3);
  });
  it('完了報告: 👑 マーカーなし・数字（1/2）→ 2', () => {
    expect(extractMaxOptionCount('数字（1/2）でご指示ください。')).toBe(2);
  });
  it('完了報告: 数字プロンプトなし → 0（他表の番号は誤検出しない）', () => {
    expect(extractMaxOptionCount('| 1 | 検証 | ✅ |\n| 2 | 検証 | ✅ |')).toBe(0);
  });
});

describe('readRecommendationState', () => {
  it('最後の assistant メッセージから recommended と maxOptionCount を返す', () => {
    const messagesEl = document.createElement('div');
    messagesEl.className = 'claudian-messages';
    messagesEl.innerHTML = `
      <div data-role="assistant"><div class="claudian-message-content">方案1、方案2、方案3 を提示します。推奨は方案2</div></div>
    `;
    const state = readRecommendationState(makeAppWithMessages(messagesEl));
    expect(state.recommended).toBe(2);
    expect(state.maxOptionCount).toBe(3);
  });

  it('messagesEl が無い → recommended null / maxOptionCount 0', () => {
    const state = readRecommendationState(makeAppWithMessages(null));
    expect(state.recommended).toBeNull();
    expect(state.maxOptionCount).toBe(0);
  });
});
