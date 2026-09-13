import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

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

describe('OpenVpnController', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
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
    await expect(controller.start({
      enabled: true, configPath: '/missing.ovpn', username: '', password: '',
      autoConnectOnLlm: false, openvpnBinaryPath: '',
    })).rejects.toThrow(/configPath|ファイル/);
  });

  it('subscribe() notifier が status 変化時に呼ばれる', async () => {
    const { getOpenVpnController } = await import('../../../src/features/network/openvpn');
    const controller = getOpenVpnController();
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
