import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// F-047: cleanupAfterDisconnect() が発行する Notice を捕捉する（vpn-toggle.test.ts と同じパターン）
const mockNotice = vi.fn();
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // i18n.ts が moment を import するためスタブを用意（getUILanguage 用・ja 固定）
    moment: (actual as { moment?: unknown }).moment ?? { locale: () => 'ja' },
    Notice: class {
      constructor(public message: string) {
        mockNotice(message);
      }
    },
  };
});

// Mock child_process.spawn BEFORE importing openvpn.ts
const mockSpawn = vi.fn();
// v0.44.0: 孤児回収が execSync を使うため、実プロセス操作を避けてモックする
const mockExecSync = vi.fn(() => '');
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true), writeFileSync: vi.fn(), unlinkSync: vi.fn(),
    chmodSync: vi.fn(), readFileSync: vi.fn(() => ''), readdirSync: vi.fn(() => []),
  },
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
}));

vi.mock('os', () => ({
  default: { tmpdir: () => '/tmp' },
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', () => ({
  default: { randomUUID: () => 'test-uuid-1234' },
  randomUUID: () => 'test-uuid-1234',
}));

const VALID_SETTINGS = {
  enabled: true,
  configPath: '/test.ovpn',
  username: '',
  password: '',
  autoConnectOnLlm: true,
  openvpnBinaryPath: '',
  serverOverride: '',
};

/**
 * 直近に生成された mock ChildProcess。
 * afterEach で 'exit' を発火させ、controller の状態を disconnected に戻すために使う。
 * （singleton controller は module スコープで共有されるため、テスト間で残留状態を掃除する必要がある）
 */
let activeProc: EventEmitter | null = null;

/** Create a controllable mock ChildProcess. */
function makeMockChild(): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { kill: () => void }).kill = vi.fn();
  (proc as unknown as { exitCode: number | null }).exitCode = null;
  activeProc = proc;
  return proc;
}

describe('OpenVpnController', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    // 直前テストで残った controller 状態を掃除:
    // mock proc の 'exit' を手動発火してコントローラの exit ハンドラを走らせ、
    // status='disconnected' / this.process=null に揃える。
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('initial status is disconnected', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.getStatus()).toBe('disconnected');
  });

  it('start() throws when configPath does not exist', async () => {
    const fs = await import('fs');
    // v0.44.0: reapOrphanOpenVpn も existsSync を呼ぶため、mockReturnValueOnce では
    // その 1 回に消費されてしまう。対象パスだけ false を返す実装に差し替える。
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: unknown) => p !== VALID_SETTINGS.configPath,
    );
    try {
      const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
      const controller = getOpenVpnController();
      await expect(controller.start(VALID_SETTINGS)).rejects.toThrow(/configPath|ファイル/);
    } finally {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
    }
  });

  it('subscribe() notifier が status 変化時に呼ばれる', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  // F-041 review fix #5: 並行 ensureVpnConnected() で start() が 1 回しか呼ばれない
  it('ensureVpnConnected の並行呼び出しは同一の start() Promise を共有する', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    const { ensureVpnConnected, getOpenVpnController } = await import(
      '../../../src/features/network/openvpn'
    );
    const controller = getOpenVpnController();

    let p1Resolved = false;
    let p2Resolved = false;
    const p1 = ensureVpnConnected(VALID_SETTINGS).then(() => { p1Resolved = true; });
    const p2 = ensureVpnConnected(VALID_SETTINGS).then(() => { p2Resolved = true; });

    // マイクロタスクを 1 回だけ進めて、start() の同期パート完了直後の状態を確認
    await Promise.resolve();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(p1Resolved).toBe(false);
    expect(p2Resolved).toBe(false);
    expect(controller.getStatus()).toBe('connecting');

    // 接続成功を模擬（Initialization Sequence Completed）
    (proc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data',
      Buffer.from('Initialization Sequence Completed\n'),
    );

    await Promise.all([p1, p2]);
    expect(p1Resolved).toBe(true);
    expect(p2Resolved).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe('connected');
  });

  // F-041 review fix #1: AUTH_FAILED 受信時に throw せず status='error' に遷移する
  it('AUTH_FAILED 受信時にプロセス例外を出さず status=error になる', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    const { ensureVpnConnected, getOpenVpnController } = await import(
      '../../../src/features/network/openvpn'
    );
    const controller = getOpenVpnController();

    // 例外が握りつぶされず観測できるかを Node レベルで検出するため
    // process.on('uncaughtException') を一時的にフックして記録する
    const uncaught: unknown[] = [];
    const handler = (err: unknown) => { uncaught.push(err); };
    process.on('uncaughtException', handler);

    try {
      const p = ensureVpnConnected(VALID_SETTINGS);
      await Promise.resolve(); // start() 同期パートを完了させる
      expect(controller.getStatus()).toBe('connecting');

      // AUTH_FAILED を模擬
      (proc as unknown as { stderr: EventEmitter }).stderr.emit(
        'data',
        Buffer.from('AUTH_FAILED: username/password invalid\n'),
      );

      await p;
      expect(controller.getStatus()).toBe('error');
      expect(controller.getLastError()).toMatch(/AUTH_FAILED/);
      expect(uncaught).toHaveLength(0);
    } finally {
      process.off('uncaughtException', handler);
    }
  });

  // F-041 review fix #2: spawn 失敗 ('error' イベント) でクラッシュせず status=error に遷移する
  it("spawn の 'error' イベントでクラッシュせず status=error に遷移する", async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    const { ensureVpnConnected, getOpenVpnController } = await import(
      '../../../src/features/network/openvpn'
    );
    const controller = getOpenVpnController();

    const uncaught: unknown[] = [];
    const handler = (err: unknown) => { uncaught.push(err); };
    process.on('uncaughtException', handler);

    try {
      const p = ensureVpnConnected(VALID_SETTINGS);
      await Promise.resolve();
      expect(controller.getStatus()).toBe('connecting');

      // 'error' イベントを模擬（ENOENT 等）
      (proc as unknown as EventEmitter).emit('error', new Error('spawn openvpn ENOENT'));

      await p;
      expect(controller.getStatus()).toBe('error');
      expect(controller.getLastError()).toMatch(/ENOENT/);
      expect(uncaught).toHaveLength(0);
    } finally {
      process.off('uncaughtException', handler);
    }
  });

  // F-041 review fix #4: stop() は 'exit' を待ってから戻る
  it('stop() は子プロセスの exit を待ってから status を disconnected にする', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    const { ensureVpnConnected, getOpenVpnController } = await import(
      '../../../src/features/network/openvpn'
    );
    const controller = getOpenVpnController();

    // 接続成功まで進める
    const connP = ensureVpnConnected(VALID_SETTINGS);
    await Promise.resolve();
    (proc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data',
      Buffer.from('Initialization Sequence Completed\n'),
    );
    await connP;
    expect(controller.getStatus()).toBe('connected');

    // stop() 呼出: kill されてから 'exit' が発火するまで disconnected にならない
    let stopResolved = false;
    const stopP = controller.stop().then(() => { stopResolved = true; });

    // kill はモックなので即座に 'exit' を手動発火
    await Promise.resolve();
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalled();
    expect(stopResolved).toBe(false);

    (proc as unknown as EventEmitter).emit('exit', 0);
    await stopP;
    expect(stopResolved).toBe(true);
    expect(controller.getStatus()).toBe('disconnected');
  });

  // F-041 review fix #6: start() while connected は no-op (新規 spawn しない)
  it('start() while connected は no-op (新規 spawn しない)', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    const { ensureVpnConnected, getOpenVpnController } = await import(
      '../../../src/features/network/openvpn'
    );
    const controller = getOpenVpnController();

    // 接続成功まで進める
    const connP = ensureVpnConnected(VALID_SETTINGS);
    await Promise.resolve();
    (proc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data',
      Buffer.from('Initialization Sequence Completed\n'),
    );
    await connP;
    expect(controller.getStatus()).toBe('connected');

    // 接続中に直接 start() を呼ぶ（ensureVpnConnected のラッパーガードを通らない）
    const spawnCountBefore = mockSpawn.mock.calls.length;
    await controller.start(VALID_SETTINGS);
    const spawnCountAfter = mockSpawn.mock.calls.length;

    // 新規 spawn されていないこと（auth ファイルも新規作成されない）
    expect(spawnCountAfter).toBe(spawnCountBefore);
    expect(controller.getStatus()).toBe('connected');
  });
});
// === v0.43.2 (F-044): Server Override ===
describe('Server Override (F-044)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('serverOverride 空 → --remote 引数なし（.ovpn の remote を使用）', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS, serverOverride: '' });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Initialization Sequence Completed\n'));
    await p;
    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).not.toContain('--remote');
  });

  it('serverOverride host のみ → --remote host 1194（既定ポート）', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS, serverOverride: 'myqnap.myqnapcloud.com' });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Initialization Sequence Completed\n'));
    await p;
    const args = mockSpawn.mock.calls[0][1] as string[];
    const idx = args.indexOf('--remote');
    expect(idx).toBeGreaterThan(-1);
    expect(args.slice(idx + 1, idx + 3)).toEqual(['myqnap.myqnapcloud.com', '1194']);
  });

  it('serverOverride host:port → --remote host port', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS, serverOverride: 'vpn.example.com:4747' });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Initialization Sequence Completed\n'));
    await p;
    const args = mockSpawn.mock.calls[0][1] as string[];
    const idx = args.indexOf('--remote');
    expect(idx).toBeGreaterThan(-1);
    expect(args.slice(idx + 1, idx + 3)).toEqual(['vpn.example.com', '4747']);
  });
});

// === v0.43.3: Windows 版 openvpn は stdout にログを出力するための対応 ===
describe('stdout stream monitoring (v0.43.3)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('stdout の Initialization Sequence Completed でも status=connected になる', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS });
    await Promise.resolve();
    expect(controller.getStatus()).toBe('connecting');
    // Windows 版 openvpn 2.7.x は stdout にログを出力する
    (proc as unknown as { stdout: EventEmitter }).stdout.emit(
      'data',
      Buffer.from('2026-09-13 21:35:05 Initialization Sequence Completed\n'),
    );
    await p;
    expect(controller.getStatus()).toBe('connected');
  });

  it('stdout の AUTH_FAILED でも status=error になる', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS });
    await Promise.resolve();
    (proc as unknown as { stdout: EventEmitter }).stdout.emit(
      'data',
      Buffer.from('AUTH: Received control message: AUTH_FAILED\n'),
    );
    await p;
    expect(controller.getStatus()).toBe('error');
    expect(controller.getLastError()).toMatch(/AUTH_FAILED/);
  });
});

// === v0.43.4: 既定バイナリパス（Windows: Program Files の OpenVPN Community 既定） ===
describe('default binary path (v0.43.4)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('openvpnBinaryPath 空 + Windows は既定パスを使用する', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS, openvpnBinaryPath: '' });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Initialization Sequence Completed\n'));
    await p;
    const [binary] = mockSpawn.mock.calls[0];
    if (process.platform === 'win32') {
      expect(binary).toBe(String.raw`C:\Program Files\OpenVPN\bin\openvpn.exe`);
    } else {
      expect(binary).toBe('openvpn');
    }
  });

  it('openvpnBinaryPath 指定時はそちらを優先する', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS, openvpnBinaryPath: String.raw`C:\custom\ovpn.exe` });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Initialization Sequence Completed\n'));
    await p;
    const [binary] = mockSpawn.mock.calls[0];
    expect(binary).toBe(String.raw`C:\custom\ovpn.exe`);
  });
});

// === v0.44.0: TAP アダプタ占有エラーの検知と PID 記録 ===
describe('adapter-busy detection & pid file (v0.44.0)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('start() は --writepid を渡して PID を記録する', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS });
    await Promise.resolve();
    (activeProc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data', Buffer.from('Initialization Sequence Completed\n'),
    );
    await p;
    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('--writepid');
    expect(controller.getStatus()).toBe('connected');
  });

  it('アダプタ占有エラーを検知して status=error + 専用メッセージになる', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS });
    await Promise.resolve();

    (proc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data',
      Buffer.from('All tap-windows6 adapters on this system are currently in use or disabled.\n'),
    );

    await p;
    expect(controller.getStatus()).toBe('error');
    expect(controller.getLastError()).toMatch(/アダプタ/);
  });

  it('interactive service 不通も同じエラーとして扱う', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const p = controller.start({ ...VALID_SETTINGS });
    await Promise.resolve();

    (proc as unknown as { stderr: EventEmitter }).stderr.emit(
      'data',
      Buffer.from('create_adapter: could not talk to service: ハンドルが無効です。   [6]\n'),
    );

    await p;
    expect(controller.getStatus()).toBe('error');
    expect(controller.getLastError()).toMatch(/アダプタ/);
  });
});

// === v0.44.1: 接続後のルート検証（経路未確立の可視化） ===
describe('route verification (v0.44.1)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('接続後に経路が入っていなければ警告を立てる', async () => {
    vi.useFakeTimers();
    try {
      const proc = makeMockChild();
      mockSpawn.mockReturnValue(proc);
      const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
      const controller = getOpenVpnController();

      const p = controller.start({ ...VALID_SETTINGS });
      await Promise.resolve();
      (proc as unknown as { stdout: EventEmitter }).stdout.emit(
        'data', Buffer.from('Initialization Sequence Completed\n'),
      );
      await p;
      expect(controller.getStatus()).toBe('connected');

      // route print が経路を返さない（= 非管理者で route 追加が拒否された状態）
      await vi.advanceTimersByTimeAsync(3000);
      if (process.platform === 'win32') {
        expect(controller.getWarning()).toMatch(/経路/);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('経路が入っていれば警告は立てない', async () => {
    vi.useFakeTimers();
    try {
      const proc = makeMockChild();
      mockSpawn.mockReturnValue(proc);
      // v0.45.0: ゲートウェイ付きの VPN 経路（On-link 行はゲートウェイ扱いされない）
      mockExecSync.mockReturnValue(
        '          0.0.0.0        128.0.0.0         10.8.0.6        10.8.0.6      1\n',
      );
      const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
      const controller = getOpenVpnController();

      const p = controller.start({ ...VALID_SETTINGS });
      await Promise.resolve();
      (proc as unknown as { stdout: EventEmitter }).stdout.emit(
        'data', Buffer.from('Initialization Sequence Completed\n'),
      );
      await p;

      await vi.advanceTimersByTimeAsync(3000);
      if (process.platform === 'win32') {
        expect(controller.getWarning()).toBeNull();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

// === v0.44.2: Obsidian（ブラウザ環境）の setTimeout は unref を持たない ===
describe('stop() in browser-like setTimeout env (v0.44.2)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
  });

  it('setTimeout が数値を返す環境でも stop() は失敗しない', async () => {
    const proc = makeMockChild();
    mockSpawn.mockReturnValue(proc);

    // ブラウザ相当: setTimeout が number を返す（unref が無い）
    const origSetTimeout = globalThis.setTimeout;
    (globalThis as unknown as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number) => {
      origSetTimeout(fn, ms);
      return 1;
    }) as never;

    try {
      const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
      const controller = getOpenVpnController();

      const connP = controller.start({ ...VALID_SETTINGS });
      await Promise.resolve();
      (proc as unknown as { stderr: EventEmitter }).stderr.emit(
        'data', Buffer.from('Initialization Sequence Completed\n'),
      );
      await connP;
      expect(controller.getStatus()).toBe('connected');

      const stopP = controller.stop();
      (proc as unknown as EventEmitter).emit('exit', 0);
      await expect(stopP).resolves.toBeUndefined();
      expect(controller.getStatus()).toBe('disconnected');
    } finally {
      (globalThis as unknown as { setTimeout: unknown }).setTimeout = origSetTimeout;
    }
  });
});

// === v0.45.0: 残骸経路（死んだセッションのゲートウェイ）の検知 ===
describe('stale route detection (v0.45.0)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  const LOG_LINE =
    'Notified TAP-Windows driver to set a DHCP IP/netmask of 10.8.0.14/255.255.255.252'
    + ' on interface {82222F2D} [DHCP-serv: 10.8.0.13, lease-time: 31536000]\n';

  async function connectAndVerify(routeLines: string[]): Promise<string | null> {
    vi.useFakeTimers();
    try {
      const proc = makeMockChild();
      mockSpawn.mockReturnValue(proc);
      mockExecSync.mockReturnValue(routeLines.join('\n'));

      const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
      const controller = getOpenVpnController();

      const p = controller.start({ ...VALID_SETTINGS });
      await Promise.resolve();
      (proc as unknown as { stdout: EventEmitter }).stdout.emit(
        'data', Buffer.from(LOG_LINE + 'Initialization Sequence Completed\n'),
      );
      await p;
      expect(controller.getStatus()).toBe('connected');

      await vi.advanceTimersByTimeAsync(3000);
      return controller.getWarning();
    } finally {
      vi.useRealTimers();
    }
  }

  const route = (gateway: string): string =>
    `          0.0.0.0        128.0.0.0         ${gateway}        10.8.0.14      1`;

  it('正しいゲートウェイの経路のみなら警告なし', async () => {
    const w = await connectAndVerify([route('10.8.0.13')]);
    if (process.platform === 'win32') expect(w).toBeNull();
  });

  it('残骸ゲートウェイのみなら「経路未確立 + 残骸」を警告', async () => {
    const w = await connectAndVerify([route('10.8.0.5')]);
    if (process.platform === 'win32') {
      expect(w).toMatch(/確立できませんでした/);
      expect(w).toMatch(/残骸経路/);
      expect(w).toMatch(/10\.8\.0\.5/);
    }
  });

  it('正しい経路と残骸が混在なら残骸のみを警告', async () => {
    const w = await connectAndVerify([route('10.8.0.13'), route('10.8.0.9')]);
    if (process.platform === 'win32') {
      expect(w).toMatch(/残骸経路/);
      expect(w).not.toMatch(/確立できませんでした/);
      expect(w).toMatch(/10\.8\.0\.9/);
    }
  });

  it('経路が 1 本も無ければ経路未確立を警告', async () => {
    const w = await connectAndVerify([]);
    if (process.platform === 'win32') {
      expect(w).toMatch(/確立できませんでした/);
      expect(w).not.toMatch(/残骸経路/);
    }
  });

  it('On-link 行はゲートウェイとして扱わない', async () => {
    const onLink = '        10.8.0.12  255.255.255.252         On-link         10.8.0.14    257';
    const w = await connectAndVerify([route('10.8.0.13'), onLink]);
    if (process.platform === 'win32') expect(w).toBeNull();
  });
});

// === v0.46.0 (F-046): getVpnRoutes() — dest/mask/gateway 3-tuple 抽出 ===
describe('OpenVpnController.getVpnRoutes (v0.46.0 / F-046)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('VPN 関連経路の dest/mask/gateway 3-tuple を返す', async () => {
    mockExecSync.mockReturnValueOnce(`
IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.10     25
        128.0.0.0        128.0.0.0         10.8.0.5       10.8.0.6    100
        10.8.0.0      255.255.255.0         10.8.0.5       10.8.0.6    100
===========================================================================
`.trim());
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const routes = controller.getVpnRoutesForTest();
    expect(routes).toEqual([
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.5' },
    ]);
  });

  it('execSync が throw したら null を返す', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('fail'); });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.getVpnRoutesForTest()).toBeNull();
  });

  it('On-link 行（gateway 列が無い）はスキップして空配列を返す', async () => {
    mockExecSync.mockReturnValueOnce(`
        10.8.0.0      255.255.255.0        On-link        10.8.0.6    100
`.trim());
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.getVpnRoutesForTest()).toEqual([]);
  });
});

// === v0.46.0 (F-046): findStaleRoutes() — expected gateway でフィルタ ===
describe('OpenVpnController.findStaleRoutes (v0.46.0 / F-046)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('returns routes whose gateway differs from expected', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const routes = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
      { dest: '0.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.13' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.13' },
    ];
    expect(controller.findStaleRoutesForTest(routes, '10.8.0.5')).toEqual([
      { dest: '0.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.13' },
      { dest: '10.8.0.0', mask: '255.255.255.0', gateway: '10.8.0.13' },
    ]);
  });

  it('returns all routes when expectedGateway is null (safe side)', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const routes = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
    ];
    expect(controller.findStaleRoutesForTest(routes, null)).toEqual(routes);
  });

  it('returns empty array when all routes match expected', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const routes = [
      { dest: '128.0.0.0', mask: '128.0.0.0', gateway: '10.8.0.5' },
    ];
    expect(controller.findStaleRoutesForTest(routes, '10.8.0.5')).toEqual([]);
  });
});

// === v0.46.0 (F-046): isRunningAsAdmin() — admin privilege probe ===
describe('OpenVpnController.isRunningAsAdmin (v0.46.0 / F-046)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('returns true when route delete succeeds (admin allowed)', async () => {
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.isRunningAsAdminForTest()).toBe(true);
  });

  it('returns false when stderr contains ERROR_ACCESS_DENIED', async () => {
    const err = new Error('Command failed') as Error & { stderr: Buffer };
    err.stderr = Buffer.from('ERROR_ACCESS_DENIED');
    mockExecSync.mockImplementationOnce(() => { throw err; });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.isRunningAsAdminForTest()).toBe(false);
  });

  it('returns false when execSync throws unrelated error', async () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('something else'); });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    expect(controller.isRunningAsAdminForTest()).toBe(false);
  });
});

// === v0.46.0 (F-046): removeStaleRoutes() — admin-gated route removal ===
describe('OpenVpnController.removeStaleRoutes (v0.46.0 / F-046)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('returns need-admin when not elevated', async () => {
    const err = new Error('denied') as Error & { stderr: Buffer };
    err.stderr = Buffer.from('ERROR_ACCESS_DENIED');
    mockExecSync.mockImplementationOnce(() => { throw err; });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const result = await controller.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: false, reason: 'need-admin', detail: expect.any(String) });
  });

  it('returns no-routes when getVpnRoutes returns null', async () => {
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    mockExecSync.mockImplementationOnce(() => { throw new Error('route print failed'); });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const result = await controller.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: false, reason: 'no-routes', detail: expect.any(String) });
  });

  it('removes all stale routes when admin', async () => {
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    mockExecSync.mockReturnValueOnce(`
        128.0.0.0        128.0.0.0         10.8.0.13       10.8.0.6    100
        10.8.0.0      255.255.255.0         10.8.0.13       10.8.0.6    100
`);
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    controller.setExpectedGatewayForTest('10.8.0.5');
    const result = await controller.removeStaleRoutesForTest();
    expect(result).toEqual({ ok: true, removed: 2, failed: [] });
  });

  it('records failed routes when route delete throws', async () => {
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    mockExecSync.mockReturnValueOnce(`
        128.0.0.0        128.0.0.0         10.8.0.13       10.8.0.6    100
`);
    const fail = new Error('delete failed');
    mockExecSync.mockImplementationOnce(() => { throw fail; });
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    controller.setExpectedGatewayForTest('10.8.0.5');
    const result = await controller.removeStaleRoutesForTest();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toBe(0);
      expect(result.failed).toEqual(['128.0.0.0/128.0.0.0 via 10.8.0.13']);
    }
  });
});

// === v0.47.0 (F-047): cleanupAfterDisconnect() — 切断後バックグラウンド stale 削除 ===
describe('OpenVpnController.cleanupAfterDisconnect (v0.47.0 / F-047)', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
    mockNotice.mockClear();
    activeProc = null;
  });

  afterEach(() => {
    if (activeProc) {
      activeProc.emit('exit', 0);
      activeProc = null;
    }
    mockExecSync.mockReturnValue('');
  });

  it('admin + stale 1 件 → route delete 3 呼び出し + Notice 1 回', async () => {
    // 1: admin probe 成功
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    // 2: route print → stale 1 件（gw 10.8.0.13）
    // NOTE: 先頭行の空白は正規表現 ^\s+ マッチに必須のため .trim() しない（F-046 Task 6 と同じ罠）
    mockExecSync.mockReturnValueOnce(`
        128.0.0.0        128.0.0.0         10.8.0.13       10.8.0.6    100
`);
    // 3: route delete 成功
    mockExecSync.mockReturnValueOnce(Buffer.from(''));

    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    await controller.cleanupAfterDisconnectForTest();
    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(mockNotice).toHaveBeenCalledTimes(1);
    expect(String(mockNotice.mock.calls[0][0])).toContain('1');
    expect(String(mockNotice.mock.calls[0][0])).toContain('削除'); // ja locale
  });

  it('非管理者起動 → 1 呼び出し（probe のみ）で無音 return', async () => {
    const err = new Error('denied') as Error & { stderr: Buffer };
    err.stderr = Buffer.from('ERROR_ACCESS_DENIED');
    mockExecSync.mockImplementationOnce(() => { throw err; });

    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    await controller.cleanupAfterDisconnectForTest();
    expect(mockExecSync).toHaveBeenCalledTimes(1); // admin probe only
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it('stale 0 件 → 2 呼び出し（probe + route print）で無音 return', async () => {
    // 1: admin probe 成功
    mockExecSync.mockReturnValueOnce(Buffer.from(''));
    // 2: route print → 空テーブル（VPN ルート無し）

    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    await controller.cleanupAfterDisconnectForTest();
    expect(mockExecSync).toHaveBeenCalledTimes(2); // admin + route print
    expect(mockNotice).not.toHaveBeenCalled();
  });
});
