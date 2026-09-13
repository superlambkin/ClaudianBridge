import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Mock child_process.spawn BEFORE importing openvpn.ts
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(() => true), writeFileSync: vi.fn(), unlinkSync: vi.fn(), chmodSync: vi.fn() },
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
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
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    await expect(controller.start(VALID_SETTINGS)).rejects.toThrow(/configPath|ファイル/);
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
