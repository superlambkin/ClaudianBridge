// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupTokenRate } from '../../../src/features/token-rate';
import { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
}));

describe('setupTokenRate', () => {
  let storeMock: { load: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    document.body.innerHTML = '';
    storeMock = { load: vi.fn(), update: vi.fn() };
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('設定 OFF で非注入', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: false } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const c = document.createElement('div');
    c.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    c.appendChild(messages);
    document.body.appendChild(c);
    expect(document.querySelector('.cb-token-rate')).toBeNull();
    cleanup();
  });

  it('設定 ON で .claudian-messages 直後に注入', async () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    container.appendChild(messages);
    document.body.appendChild(container);
    await vi.waitFor(() => {
      expect(messages.nextElementSibling?.classList.contains('cb-token-rate')).toBe(true);
    });
    cleanup();
  });

  it('クリーンアップで全 counter destroy', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    container.appendChild(messages);
    document.body.appendChild(container);
    expect(document.querySelector('.cb-token-rate')).not.toBeNull();
    cleanup();
    expect(document.querySelector('.cb-token-rate')).toBeNull();
  });
});
