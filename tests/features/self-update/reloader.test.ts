import { describe, it, expect, vi } from 'vitest';
import { reloadPlugin } from '../../../src/features/self-update/reloader';

describe('reloadPlugin', () => {
  it('disablePlugin -> enablePlugin の順で呼ぶ', async () => {
    const calls: string[] = [];
    const app = {
      plugins: {
        disablePlugin: vi.fn(async () => { calls.push('disable'); }),
        enablePlugin: vi.fn(async () => { calls.push('enable'); }),
      },
    } as unknown as import('obsidian').App;
    await reloadPlugin(app, 'ClaudianBridge');
    expect(calls).toEqual(['disable', 'enable']);
  });

  it('enablePlugin が例外を出せば伝播する', async () => {
    const app = {
      plugins: {
        disablePlugin: vi.fn(async () => {}),
        enablePlugin: vi.fn(async () => { throw new Error('boot failed'); }),
      },
    } as unknown as import('obsidian').App;
    await expect(reloadPlugin(app, 'ClaudianBridge')).rejects.toThrow('boot failed');
  });
});
