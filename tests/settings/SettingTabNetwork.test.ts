// @vitest-environment jsdom
// Task 5 (v0.43.0 / F-042): SettingTabNetwork の UI レンダラ検証
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const mockGetOpenVpnController = vi.fn();

// v0.43.8: OpenVPN インストール検知（existsSync）をテストから制御する
const { mockExistsSync } = vi.hoisted(() => ({ mockExistsSync: vi.fn(() => true) }));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  default: { existsSync: mockExistsSync },
}));

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
    o?: { text?: string; cls?: string; href?: string },
  ) {
    const e = document.createElement(tag);
    if (o?.cls) e.className = o.cls;
    if (o?.text) e.textContent = o.text;
    if (o?.href) e.setAttribute('href', o.href);
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

// === v0.43.8: OpenVPN 未インストール検知とダウンロードリンク表示 ===
describe('SettingTabNetwork — OpenVPN install detection (v0.43.8)', () => {
  beforeEach(() => {
    mockGetOpenVpnController.mockReset();
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(true);
  });

  function makeStore(enabled: boolean, binaryPath: string): any {
    return {
      load: () => ({
        network: {
          proxy: { enabled: false, url: '', noProxyHosts: '' },
          openvpn: {
            enabled,
            configPath: '/p.ovpn',
            username: '',
            password: '',
            autoConnectOnLlm: true,
            openvpnBinaryPath: binaryPath,
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
      subscribe: () => () => {},
      start: vi.fn(),
      stop: vi.fn(),
      detectExternalConnection: () => 'disconnected',
    });
  }

  it('enabled=true かつバイナリ不在ならダウンロードリンクを表示する', async () => {
    mockExistsSync.mockReturnValue(false);
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore(true, String.raw`C:\Program Files\OpenVPN\bin\openvpn.exe`) as any);
    const link = container.querySelector('a[href*="openvpn.net"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('openvpn.net/community-downloads');
  });

  it('enabled=true かつバイナリ実在ならリンクを表示しない', async () => {
    mockExistsSync.mockReturnValue(true);
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore(true, String.raw`C:\Program Files\OpenVPN\bin\openvpn.exe`) as any);
    expect(container.querySelector('a[href*="openvpn.net"]')).toBeNull();
  });

  it('enabled=false ならリンクを表示しない（未検出でも）', async () => {
    mockExistsSync.mockReturnValue(false);
    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    mockVpnController();
    renderNetworkTab({} as any, container, makeStore(false, '') as any);
    expect(container.querySelector('a[href*="openvpn.net"]')).toBeNull();
  });
});

// === v0.43.9: 接続状態ログのコピー機能 ===
describe('SettingTabNetwork — copy connection log (v0.43.9)', () => {
  beforeEach(() => {
    mockGetOpenVpnController.mockReset();
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(true);
  });

  function makeJsonStore(): any {
    return {
      load: () => ({
        network: {
          proxy: { enabled: false, url: '', noProxyHosts: '' },
          openvpn: {
            enabled: true,
            configPath: '/tmp/kentocloud.ovpn',
            username: '',
            password: '',
            autoConnectOnLlm: true,
            openvpnBinaryPath: '',
            serverOverride: 'kento.myqnapcloud.com',
          },
        },
      }),
      save: vi.fn(),
    };
  }

  it('コピーボタンでクリップボードに状態+設定+ログが渡る', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    mockGetOpenVpnController.mockReturnValue({
      getStatus: () => 'error',
      getRecentLog: () => 'AUTH_FAILED: username/password invalid\n',
      getLastError: () => 'AUTH_FAILED',
      subscribe: () => () => {},
      start: vi.fn(),
      stop: vi.fn(),
      detectExternalConnection: () => 'disconnected',
    });

    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    renderNetworkTab({} as any, container, makeJsonStore());

    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('コピー'),
    );
    expect(copyBtn).toBeTruthy();
    copyBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = String(writeText.mock.calls[0][0]);
    expect(text).toContain('ClaudianBridge OpenVPN log');
    expect(text).toContain('/tmp/kentocloud.ovpn');
    expect(text).toContain('kento.myqnapcloud.com');
    expect(text).toContain('AUTH_FAILED');
  });

  it('ログが空でもヘッダ付きでコピーできる', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockGetOpenVpnController.mockReturnValue({
      getStatus: () => 'disconnected',
      getRecentLog: () => '',
      getLastError: () => null,
      subscribe: () => () => {},
      start: vi.fn(),
      stop: vi.fn(),
      detectExternalConnection: () => 'disconnected',
    });

    const { renderNetworkTab } = await import('../../src/settings/SettingTabNetwork');
    const container = document.createElement('div');
    renderNetworkTab({} as any, container, makeJsonStore());
    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('コピー'),
    );
    copyBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain('(no log)');
  });
});
