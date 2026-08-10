import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addTextToClaudian, addFolderToClaudian } from '../../../src/features/selection/core';

// obsidian は Node 環境で解決できないためモック（実装の値 import を解決する）
vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
}));

let mockNoticeMessages: string[] = [];

function makeApp(realclaudian?: unknown) {
  return {
    plugins: {
      plugins: {
        realclaudian,
      },
    },
  } as unknown as import('obsidian').App;
}

const Notice = function (this: unknown, m: string) { mockNoticeMessages.push(m); } as unknown as typeof import('obsidian').Notice;

beforeEach(() => { mockNoticeMessages = []; });

describe('addTextToClaudian', () => {
  it('realclaudian の appendToActiveInput にテキストを渡す', async () => {
    const appendToActiveInput = vi.fn(() => true);
    const activateView = vi.fn(async () => {});
    const app = makeApp({ activateView, getView: () => ({ appendToActiveInput }) });
    const ok = await addTextToClaudian(app, 'こんにちは', Notice);
    expect(ok).toBe(true);
    expect(activateView).toHaveBeenCalled();
    expect(appendToActiveInput).toHaveBeenCalledWith('こんにちは');
    expect(mockNoticeMessages).toHaveLength(0);
  });

  it('プラグイン未検出 → false + 通知', async () => {
    const app = makeApp(undefined);
    const ok = await addTextToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('見つかりません');
  });

  it('ビューが準備できていない → false + 通知', async () => {
    const app = makeApp({ activateView: async () => {}, getView: () => null });
    const ok = await addTextToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('準備できていません');
  });

  it('appendToActiveInput が false を返す → false', async () => {
    const app = makeApp({ getView: () => ({ appendToActiveInput: () => false }) });
    const ok = await addTextToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
  });

  it('例外が発生したら失敗を通知する', async () => {
    const app = makeApp({
      activateView: async () => { throw new Error('boom'); },
    });
    const ok = await addTextToClaudian(app, 'x', Notice);
    expect(ok).toBe(false);
    expect(mockNoticeMessages[0]).toContain('失敗');
  });
});

describe('addFolderToClaudian', () => {
  it('フォルダ参照 @path を挿入する', async () => {
    const appendToActiveInput = vi.fn(() => true);
    const app = makeApp({ getView: () => ({ appendToActiveInput }) });
    const folder = { path: 'MyFolder', name: 'MyFolder' } as unknown as import('obsidian').TFolder;
    const ok = await addFolderToClaudian(app, folder, Notice);
    expect(ok).toBe(true);
    expect(appendToActiveInput).toHaveBeenCalledWith('@MyFolder ');
  });

  it('フォルダ path が無い → false', async () => {
    const app = makeApp({ getView: () => ({ appendToActiveInput: () => true }) });
    const folder = {} as unknown as import('obsidian').TFolder;
    const ok = await addFolderToClaudian(app, folder, Notice);
    expect(ok).toBe(false);
  });
});
