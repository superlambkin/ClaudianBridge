import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addTextToClaudian, addFolderToClaudian } from '../../../src/features/selection/core';

// obsidian は Node 環境で解決できないためモック（実装の値 import を解決する）
vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
}));

let mockEditorSetValueCalls: string[] = [];
let mockNoticeMessages: string[] = [];

const app = {
  workspace: {
    getActiveViewOfType: () => ({
      editor: {
        setValue: (v: string) => { mockEditorSetValueCalls.push(v); },
      },
    }),
  },
} as unknown as import('obsidian').App;

const Notice = function (this: unknown, m: string) { mockNoticeMessages.push(m); } as unknown as typeof import('obsidian').Notice;

beforeEach(() => { mockEditorSetValueCalls = []; mockNoticeMessages = []; });

describe('addTextToClaudian', () => {
  it('テキストをエディタにセットする', () => {
    const ok = addTextToClaudian(app, 'こんにちは', Notice);
    expect(ok).toBe(true);
    expect(mockEditorSetValueCalls[0]).toBe('こんにちは');
    expect(mockNoticeMessages[0]).toContain('Claudian');
  });

  it('アクティブビューがない → false', () => {
    const a = { workspace: { getActiveViewOfType: () => null } } as unknown as import('obsidian').App;
    expect(addTextToClaudian(a, 'x', Notice)).toBe(false);
  });
});

describe('addFolderToClaudian', () => {
  it('フォルダ参照を挿入する', () => {
    const folder = { path: 'MyFolder', name: 'MyFolder' } as unknown as import('obsidian').TFolder;
    const ok = addFolderToClaudian(app, folder, Notice);
    expect(ok).toBe(true);
    expect(mockEditorSetValueCalls[0]).toContain('MyFolder');
  });
});
