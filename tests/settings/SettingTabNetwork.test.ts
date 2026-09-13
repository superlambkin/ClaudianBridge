// @vitest-environment jsdom
// Task 5 (v0.43.0 / F-042): SettingTabNetwork の UI レンダラ検証
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const mockGetOpenVpnController = vi.fn();

vi.mock('../../src/features/network/openvpn', () => ({
  getOpenVpnController: () => mockGetOpenVpnController(),
  ensureVpnConnected: vi.fn(),
}));

vi.mock('obsidian', () => {
  return {
    Notice: vi.fn(),
    moment: { locale: () => 'ja' },
    Setting: class {
      constructor(_containerEl: HTMLElement) {}
      setName(_n: string) { return this; }
      setDesc(_d: string) { return this; }
      addToggle(cb: (t: unknown) => unknown) {
        const builder = {
          setValue: () => builder,
          setDisabled: () => builder,
          onChange: () => builder,
        };
        cb(builder);
        return this;
      }
      addText(cb: (t: unknown) => unknown) {
        const builder = {
          setPlaceholder: () => builder,
          setValue: () => builder,
          setDisabled: () => builder,
          onChange: () => builder,
          get inputEl() {
            return { type: 'text' };
          },
        };
        cb(builder);
        return this;
      }
      addButton(cb: (b: unknown) => unknown) {
        cb({ setButtonText: () => ({ setWarning: () => ({ onClick: () => ({}) }) }), setWarning: () => ({ onClick: () => ({}) }), onClick: () => ({}) });
        return this;
      }
      addDropdown(cb: (d: unknown) => unknown) {
        cb({ addOption: () => d, setValue: () => d, setDisabled: () => d, onChange: () => d });
        return this;
      }
    },
  };
});

// renderNetworkTab が使う Obsidian 独自の HTMLElement 拡張を jsdom に補完
beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) {
    this.innerHTML = '';
    return this;
  } as never;
  HTMLElement.prototype.createEl = function (
    this: HTMLElement,
    tag: string,
    o?: { text?: string; cls?: string },
  ) {
    const e = document.createElement(tag);
    if (o?.cls) e.className = o.cls;
    if (o?.text) e.textContent = o.text;
    this.appendChild(e);
    return e;
  } as never;
  HTMLElement.prototype.createDiv = function (this: HTMLElement, cls?: string) {
    const e = document.createElement('div');
    if (cls) e.className = cls;
    this.appendChild(e);
    return e;
  } as never;
  HTMLElement.prototype.setText = function (this: HTMLElement, text: string) {
    this.textContent = text;
    return this;
  } as never;
});

describe('SettingTabNetwork', () => {
  beforeEach(() => {
    mockGetOpenVpnController.mockReset();
  });

  function makeStore(): any {
    return {
      load: () => ({
        network: {
          proxy: { enabled: false, url: '', noProxyHosts: '' },
          openvpn: {
            enabled: false,
            configPath: '',
            username: '',
            password: '',
            autoConnectOnLlm: true,
            openvpnBinaryPath: '',
          },
        },
      }),
      save: vi.fn(),
    };
  }

  function mockVpnController(): void {
    mockGetOpenVpnController.mockReturnValue({
      getStatus: () => 'disconnected',
      getRecentLog: () => '',
      getLastError: () => null,
      subscribe: () => () => {},
      start: vi.fn(),
      stop: vi.fn(),
    });
  }

  it('renders h2 with network tab title', async () => {
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore());
    expect(container.querySelector('h2')?.textContent).toContain('ネットワーク');
  });

  it('renders proxy section heading', async () => {
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore());
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings.some((t) => t?.includes('プロキシ'))).toBe(true);
  });

  it('renders openvpn section heading', async () => {
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore());
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings.some((t) => t?.includes('OpenVPN'))).toBe(true);
  });
});
