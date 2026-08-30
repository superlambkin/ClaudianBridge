// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupTokenRate } from '../../../src/features/token-rate';
import { ConfigStore } from '../../../src/core/config-store';

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
}));

/** realclaudian 相当の構造: .claudian-input-container > .claudian-input-toolbar > .claudian-permission-toggle */
function buildFixture(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'claudian-input-container';

  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';

  const toggle = document.createElement('div');
  toggle.className = 'claudian-permission-toggle';
  const label = document.createElement('span');
  label.className = 'claudian-permission-label';
  label.textContent = 'YOLO';
  toggle.appendChild(label);
  toolbar.appendChild(toggle);

  container.appendChild(toolbar);
  document.body.appendChild(container);
  return container;
}

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
    buildFixture();
    expect(document.querySelector('.cb-token-rate')).toBeNull();
    cleanup();
  });

  it('設定 ON で YOLO トグルの直前に注入', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = buildFixture();
    const toggle = container.querySelector('.claudian-permission-toggle') as HTMLElement;
    expect(toggle.previousElementSibling?.classList.contains('cb-token-rate')).toBe(true);
    cleanup();
  });

  it('クリーンアップで全 counter destroy', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    buildFixture();
    expect(document.querySelector('.cb-token-rate')).not.toBeNull();
    cleanup();
    expect(document.querySelector('.cb-token-rate')).toBeNull();
  });

  it('YOLO トグルが無い場合は .claudian-messages 直後にフォールバック注入', () => {
    storeMock.load.mockReturnValue({ general: { tokenRateEnabled: true } });
    const cleanup = setupTokenRate({} as never, storeMock as never);
    const container = document.createElement('div');
    container.className = 'claudian-input-container';
    const messages = document.createElement('div');
    messages.className = 'claudian-messages';
    container.appendChild(messages);
    document.body.appendChild(container);
    expect(messages.nextElementSibling?.classList.contains('cb-token-rate')).toBe(true);
    cleanup();
  });
});
