import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveLlmClient, dispatchLlmRequest } from '../../../src/features/llm/dispatch';

describe('resolveLlmClient', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('provider=claude で createClaudeClient を返す', () => {
    const client = resolveLlmClient('claude', undefined, { enabled: true, effort: 'medium' });
    expect(client.id).toBe('claude');
  });

  it('provider=deepseek で createDeepSeekClient を返す', () => {
    const client = resolveLlmClient('deepseek', 'sk-xxx', { enabled: true, effort: 'high' });
    expect(client.id).toBe('deepseek');
  });

  it('provider=zhipu で createZhipuClient を返す', () => {
    const client = resolveLlmClient('zhipu', 'zai-xxx', { enabled: false, effort: 'medium' });
    expect(client.id).toBe('zhipu');
  });

  it('provider=minimax で createMiniMaxClient を返す', () => {
    const client = resolveLlmClient('minimax', 'mini-xxx', { enabled: true, effort: 'low' });
    expect(client.id).toBe('minimax');
  });

  it('provider=kimi で createKimiClient を返す', () => {
    const client = resolveLlmClient('kimi', 'kimi-xxx', { enabled: true, effort: 'medium' });
    expect(client.id).toBe('kimi');
  });

  it('provider=unknown は Claude にフォールバック（warn ログあり）', () => {
    const client = resolveLlmClient('unknown', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('dispatchLlmRequest VPN hook (F-041)', () => {
  // Notice のコンストラクタを記録してメッセージ確認する
  const noticeCalls: string[] = [];
  let ensureMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    noticeCalls.length = 0;
    ensureMock = vi.fn().mockResolvedValue(undefined);

    // obsidian モジュール全体を上書き（Notice だけ記録クラスに）
    vi.doMock('obsidian', () => ({
      Notice: class {
        message: string;
        constructor(message: string) { this.message = message; noticeCalls.push(message); }
      },
    }));

    // openvpn モジュールをモック
    vi.doMock('../../../src/features/network/openvpn', () => ({
      ensureVpnConnected: ensureMock,
      getOpenVpnController: () => ({
        getStatus: () => 'disconnected',
        subscribe: () => () => {},
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock('obsidian');
    vi.doUnmock('../../../src/features/network/openvpn');
    vi.resetModules();
  });

  it('enabled=false なら ensureVpnConnected を呼ばない', async () => {
    const { dispatchLlmRequest: dispatch } = await import('../../../src/features/llm/dispatch');
    const cfg = {
      network: {
        openvpn: {
          enabled: false,
          autoConnectOnLlm: true,
          configPath: '',
          username: '',
          password: '',
          openvpnBinaryPath: '',
        },
      },
    } as any;
    const client = await dispatch(cfg, 'claude', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('autoConnectOnLlm=false なら ensureVpnConnected を呼ばない', async () => {
    const { dispatchLlmRequest: dispatch } = await import('../../../src/features/llm/dispatch');
    const cfg = {
      network: {
        openvpn: {
          enabled: true,
          autoConnectOnLlm: false,
          configPath: '',
          username: '',
          password: '',
          openvpnBinaryPath: '',
        },
      },
    } as any;
    const client = await dispatch(cfg, 'claude', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('enabled && autoConnectOnLlm なら ensureVpnConnected を呼ぶ', async () => {
    const { dispatchLlmRequest: dispatch } = await import('../../../src/features/llm/dispatch');
    const cfg = {
      network: {
        openvpn: {
          enabled: true,
          autoConnectOnLlm: true,
          configPath: '',
          username: '',
          password: '',
          openvpnBinaryPath: '',
        },
      },
    } as any;
    const client = await dispatch(cfg, 'claude', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith(cfg.network.openvpn);
  });

  it('ensureVpnConnected が失敗しても LLM クライアントは返る (Notice のみ)', async () => {
    ensureMock.mockRejectedValueOnce(new Error('configPath が見つかりません'));
    const { dispatchLlmRequest: dispatch } = await import('../../../src/features/llm/dispatch');
    const cfg = {
      network: {
        openvpn: {
          enabled: true,
          autoConnectOnLlm: true,
          configPath: '/missing.ovpn',
          username: '',
          password: '',
          openvpnBinaryPath: '',
        },
      },
    } as any;
    const client = await dispatch(cfg, 'claude', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toContain('OpenVPN');
    expect(noticeCalls[0]).toContain('configPath が見つかりません');
  });
});
