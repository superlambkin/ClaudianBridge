import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendToClaudian } from '../../../src/features/quick-reply/core';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
}));

let mockNoticeMessages: string[] = [];

function makeApp(realclaudian?: unknown) {
  return { plugins: { plugins: { realclaudian } } } as unknown as import('obsidian').App;
}

const Notice = function (this: unknown, m: string) { mockNoticeMessages.push(m); } as unknown as typeof import('obsidian').Notice;

beforeEach(() => { mockNoticeMessages = []; });

describe('sendToClaudian', () => {
  it('inputController.sendMessage() を呼んで直接送信する', async () => {
    const sendMessage = vi.fn(async () => {});
    const app = makeApp({
      activateView: vi.fn(async () => {}),
      getView: () => ({
        getActiveTab: () => ({
          dom: { inputEl: { value: '', dispatchEvent: vi.fn() }, messagesEl: {} },
          controllers: { inputController: { sendMessage } },
        }),
      }),
    });
    const ok = await sendToClaudian(app, 'OK', Notice);
    expect(ok).toBe(true);
    expect(sendMessage).toHaveBeenCalled();
    expect(mockNoticeMessages).toHaveLength(0);
  });

  it('入力欄に文言が上書きされ input イベントが発火する', async () => {
    const dispatchEvent = vi.fn();
    const inputEl = { value: 'draft', dispatchEvent };
    const sendMessage = vi.fn(async () => {});
    const app = makeApp({
      activateView: vi.fn(async () => {}),
      getView: () => ({
        getActiveTab: () => ({
          dom: { inputEl, messagesEl: {} },
          controllers: { inputController: { sendMessage } },
        }),
      }),
    });
    await sendToClaudian(app, '方案2', Notice);
    expect(inputEl.value).toBe('方案2');
    expect(dispatchEvent).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('sendMessage 不在時は appendToActiveInput にフォールバック', async () => {
    const appendToActiveInput = vi.fn(() => true);
    const app = makeApp({
      activateView: vi.fn(async () => {}),
      getView: () => ({ appendToActiveInput }),
    });
    const ok = await sendToClaudian(app, 'NG', Notice);
    expect(ok).toBe(true);
    expect(appendToActiveInput).toHaveBeenCalledWith('NG');
  });

  it('プラグイン未検出 → false + 通知', async () => {
    const app = makeApp(undefined);
    const ok = await sendToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('見つかりません');
  });

  it('ビューが準備できていない → false + 通知', async () => {
    const app = makeApp({ activateView: vi.fn(async () => {}), getView: () => null });
    const ok = await sendToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('準備できていません');
  });

  it('例外が発生したら失敗を通知する', async () => {
    const app = makeApp({ activateView: async () => { throw new Error('boom'); } });
    const ok = await sendToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('失敗');
  });
});
