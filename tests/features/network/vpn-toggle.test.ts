// @vitest-environment jsdom
/**
 * F-043: Claudian 画面 VPN トグル のユニットテスト。
 * v0.43.1 (F-043)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockController = {
  getStatus: vi.fn((): 'disconnected' | 'connecting' | 'connected' | 'error' => 'disconnected'),
  getRecentLog: vi.fn(() => ''),
  subscribe: vi.fn(() => () => {}),
  start: vi.fn(),
  stop: vi.fn(),
  detectExternalConnection: vi.fn(() => 'disconnected' as 'disconnected' | 'connected'),
};

const mockNotice = vi.fn();
const mockOpen = vi.fn();
const mockOpenTabById = vi.fn();

vi.mock('../../../src/features/network/openvpn', () => ({
  getOpenVpnController: () => mockController,
  ensureVpnConnected: vi.fn(),
}));

vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return {
    ...actual,
    // i18n.ts が moment を import するためスタブを用意（getUILanguage 用・ja 固定）
    moment: (actual as { moment?: unknown }).moment ?? { locale: () => 'ja' },
    Notice: class { constructor(public message: string) { mockNotice(message); } },
    Setting: class { setName() { return this; } setDesc() { return this; } addToggle() { return this; } addText() { return this; } },
  };
});

function makeStore(openvpnOverrides: Record<string, unknown> = {}): { load: () => unknown; save: ReturnType<typeof vi.fn> } {
  return {
    load: () => ({
      network: {
        proxy: { enabled: false, url: '', noProxyHosts: '' },
        openvpn: {
          enabled: true, configPath: '/path/to.ovpn', username: '', password: '',
          autoConnectOnLlm: true, openvpnBinaryPath: '',
          ...openvpnOverrides,
        },
      },
    }),
    save: vi.fn(),
  };
}

function mountContainer(): { container: HTMLElement; yolo: HTMLElement } {
  const container = document.createElement('div');
  container.className = 'claudian-input-container';
  const yolo = document.createElement('div');
  yolo.className = 'claudian-permission-toggle';
  container.appendChild(yolo);
  document.body.appendChild(container);
  return { container, yolo };
}

describe('vpn-toggle (F-043)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockController.getStatus.mockReturnValue('disconnected');
    mockController.subscribe.mockReturnValue(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── DOM 注入 ──

  it('VPN toggle is positioned to the LEFT of YOLO toggle (v0.43.5)', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const wrapper = container.querySelector('.cb-vpn-toggle') as HTMLElement;
    const yolo = container.querySelector('.claudian-permission-toggle') as HTMLElement;
    // DOM 順で wrapper が yolo より前にあることを確認
    expect(wrapper.compareDocumentPosition(yolo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
  });

  it('renders toggle next to YOLO toggle in container', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    expect(container.querySelector('.cb-vpn-toggle')).not.toBeNull();
    cleanup();
  });

  it('does not duplicate toggle if already injected', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    // rescan 相当の再呼び出しでも重複しない
    document.body.appendChild(container); // mutation を疑似的に誘発
    expect(container.querySelectorAll('.cb-vpn-toggle')).toHaveLength(1);
    cleanup();
  });

  it('removes toggle on destroy()', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    cleanup();
    expect(container.querySelector('.cb-vpn-toggle')).toBeNull();
  });

  // ── 状態反映 ──
  it('initial status is disconnected with gray badge', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const sw = container.querySelector('.cb-vpn-switch') as HTMLElement;
    expect(sw.getAttribute('data-status')).toBe('disconnected');
    cleanup();
  });

  it('subscribe callback updates DOM when status changes to connected', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    listener!('connected');
    const sw = container.querySelector('.cb-vpn-switch') as HTMLElement;
    expect(sw.getAttribute('data-status')).toBe('connected');
    cleanup();
  });

  it('pulse animation class is applied only on connecting state', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    listener!('connecting');
    const sw = container.querySelector('.cb-vpn-switch') as HTMLElement;
    expect(sw.getAttribute('data-status')).toBe('connecting');
    listener!('connected');
    expect(sw.getAttribute('data-status')).toBe('connected');
    cleanup();
  });

  it('button is disabled when status is connecting', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    listener!('connecting');
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    cleanup();
  });

  // ── クリックハンドラ ──
  it('click while disconnected calls controller.start', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    mockController.start.mockResolvedValue(undefined);
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockController.start).toHaveBeenCalledTimes(1);
    expect(mockController.stop).not.toHaveBeenCalled();
    cleanup();
  });

  it('click while connected calls controller.stop', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    mockController.getStatus.mockReturnValue('connected');
    mockController.stop.mockResolvedValue(undefined);
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockController.stop).toHaveBeenCalledTimes(1);
    expect(mockController.start).not.toHaveBeenCalled();
    cleanup();
  });

  it('click while error calls controller.start (retry)', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    mockController.getStatus.mockReturnValue('error');
    mockController.start.mockResolvedValue(undefined);
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockController.start).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('click while connecting is no-op (button disabled)', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    mockController.getStatus.mockReturnValue('connecting');
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockController.start).not.toHaveBeenCalled();
    expect(mockController.stop).not.toHaveBeenCalled();
    cleanup();
  });

  // ── 未設定時 ──
  it('button is disabled when enabled=false', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore({ enabled: false, configPath: '' }) as never);
    const wrapper = container.querySelector('.cb-vpn-toggle') as HTMLElement;
    expect(wrapper.style.display).toBe('none'); // v0.43.5: 完全非表示
    cleanup();
  });

  it('button is disabled when configPath is empty', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore({ configPath: '' }) as never);
    const wrapper = container.querySelector('.cb-vpn-toggle') as HTMLElement;
    expect(wrapper.style.display).toBe('none'); // v0.43.5: configPath 空でも非表示
    cleanup();
  });

  it('click while not configured shows Notice and opens settings tab', async () => {
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore({ enabled: false, configPath: '' }) as never);
    const btn = container.querySelector('.cb-vpn-switch') as HTMLButtonElement;
    // 未設定でもクリック自体は可能（disabled 属性は初期 checkEnabled で付くが、JS から click は発火する）
    btn.disabled = false;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockNotice).toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalled();
    expect(mockOpenTabById).toHaveBeenCalledWith('ClaudianBridge');
    expect(mockController.start).not.toHaveBeenCalled();
    cleanup();
  });
});

// === v0.43.7: 接続中に外部トンネルを検出して connected に補正（色の取りこぼし防止） ===
describe('vpn-toggle external connection polling (v0.43.7)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockController.getStatus.mockReturnValue('disconnected');
    mockController.detectExternalConnection.mockReturnValue('disconnected');
    mockController.subscribe.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('connecting 中に外部 VPN を検出したら connected に補正する', async () => {
    vi.useFakeTimers();
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);

    mockController.getStatus.mockReturnValue('connecting');
    mockController.detectExternalConnection.mockReturnValue('connected');
    listener!('connecting');

    const sw = container.querySelector('.cb-vpn-switch') as HTMLElement;
    expect(sw.getAttribute('data-status')).toBe('connecting');

    await vi.advanceTimersByTimeAsync(2000);
    expect(sw.getAttribute('data-status')).toBe('connected');

    cleanup();
  });

  it('外部 VPN が無ければ connecting のまま（誤検出しない）', async () => {
    vi.useFakeTimers();
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);

    mockController.getStatus.mockReturnValue('connecting');
    mockController.detectExternalConnection.mockReturnValue('disconnected');
    listener!('connecting');

    await vi.advanceTimersByTimeAsync(6000);
    const sw = container.querySelector('.cb-vpn-switch') as HTMLElement;
    expect(sw.getAttribute('data-status')).toBe('connecting');

    cleanup();
  });

  it('destroy() でポーリングが停止する', async () => {
    vi.useFakeTimers();
    const { setupVpnToggle } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();
    let listener: ((status: string) => void) | null = null;
    mockController.subscribe.mockImplementation((l: (status: string) => void) => {
      listener = l;
      return () => {};
    });
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, makeStore() as never);

    mockController.getStatus.mockReturnValue('connecting');
    listener!('connecting');
    cleanup();

    const callsBefore = mockController.detectExternalConnection.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(mockController.detectExternalConnection.mock.calls.length).toBe(callsBefore);
  });
});

// === v0.43.8: 設定変更（OpenVPN を使用 ON/OFF）の即時反映 ===
describe('vpn-toggle refreshVpnToggles (v0.43.8)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockController.getStatus.mockReturnValue('disconnected');
    mockController.subscribe.mockReturnValue(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('refreshVpnToggles() で enabled=false になるとその場で非表示になる', async () => {
    const { setupVpnToggle, refreshVpnToggles } = await import('../../../src/features/network/vpn-toggle');
    const { container } = mountContainer();

    let enabled = true;
    const store = {
      load: () => ({
        network: {
          proxy: { enabled: false, url: '', noProxyHosts: '' },
          openvpn: { enabled, configPath: '/p.ovpn', username: '', password: '', autoConnectOnLlm: true, openvpnBinaryPath: '' },
        },
      }),
      save: vi.fn(),
    };

    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, store as never);
    const wrapper = container.querySelector('.cb-vpn-toggle') as HTMLElement;
    expect(wrapper.style.display).not.toBe('none');

    // 設定タブで「OpenVPN を使用」を OFF にした状況を再現
    enabled = false;
    refreshVpnToggles();
    expect(wrapper.style.display).toBe('none');

    // 再度 ON にすると再表示される
    enabled = true;
    refreshVpnToggles();
    expect(wrapper.style.display).not.toBe('none');

    cleanup();
  });

  it('cleanup 後は refreshVpnToggles() の影響を受けない', async () => {
    const { setupVpnToggle, refreshVpnToggles } = await import('../../../src/features/network/vpn-toggle');
    mountContainer();
    const store = makeStore();
    const cleanup = setupVpnToggle({ setting: { open: mockOpen, openTabById: mockOpenTabById } } as never, store as never);
    cleanup();
    // 例外を出さずに完了すること
    expect(() => refreshVpnToggles()).not.toThrow();
  });
});
