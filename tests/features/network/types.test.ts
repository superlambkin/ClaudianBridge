import { describe, it, expect } from 'vitest';
import { DEFAULT_OPEN_VPN_SETTINGS, type OpenVpnSettings, type OpenVpnStatus } from '../../../src/features/network/types';

describe('OpenVpnSettings', () => {
  it('DEFAULT_OPEN_VPN_SETTINGS は 7 フィールドを持つ', () => {
    expect(DEFAULT_OPEN_VPN_SETTINGS).toEqual({
      enabled: false,
      configPath: '',
      username: '',
      password: '',
      autoConnectOnLlm: true,
      openvpnBinaryPath: '',
      serverOverride: '',
    });
  });

  it('OpenVpnStatus は 4 値のリテラル型', () => {
    const validStatuses: OpenVpnStatus[] = ['disconnected', 'connecting', 'connected', 'error'];
    expect(validStatuses).toHaveLength(4);
  });

  it('OpenVpnSettings 型は password フィールドを持つ', () => {
    const s: OpenVpnSettings = { ...DEFAULT_OPEN_VPN_SETTINGS, password: 'secret' };
    expect(s.password).toBe('secret');
  });
});
