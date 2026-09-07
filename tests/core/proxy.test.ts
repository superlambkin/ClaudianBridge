import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyProxyEnv,
  shouldForceFetchForProxy,
  extractHost,
} from '../../src/core/proxy';
import {
  DEFAULT_PROXY_SETTINGS,
  normalizeProxySettings,
  type ProxySettings,
} from '../../src/core/settings';

describe('core/proxy', () => {
  beforeEach(() => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.NO_PROXY;
  });
  afterEach(() => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.NO_PROXY;
  });

  describe('applyProxyEnv', () => {
    it('enabled=true で url がある → HTTPS_PROXY/HTTP_PROXY/NO_PROXY がセット', () => {
      const p: ProxySettings = { enabled: true, url: 'http://proxy:8080', noProxyHosts: 'localhost,.local' };
      applyProxyEnv(p);
      expect(process.env.HTTPS_PROXY).toBe('http://proxy:8080');
      expect(process.env.HTTP_PROXY).toBe('http://proxy:8080');
      expect(process.env.NO_PROXY).toBe('localhost,.local');
    });

    it('enabled=false → すべての env を削除', () => {
      process.env.HTTPS_PROXY = 'http://old:8080';
      applyProxyEnv({ enabled: false, url: '', noProxyHosts: '' });
      expect(process.env.HTTPS_PROXY).toBeUndefined();
      expect(process.env.HTTP_PROXY).toBeUndefined();
      expect(process.env.NO_PROXY).toBeUndefined();
    });

    it('undefined を渡すと全 env 削除', () => {
      process.env.HTTP_PROXY = 'http://old:8080';
      applyProxyEnv(undefined);
      expect(process.env.HTTP_PROXY).toBeUndefined();
    });

    it('noProxyHosts 空 → NO_PROXY も空文字列', () => {
      applyProxyEnv({ enabled: true, url: 'http://p:8080', noProxyHosts: '' });
      expect(process.env.NO_PROXY).toBe('');
    });
  });

  describe('shouldForceFetchForProxy', () => {
    it('無効なら false', () => {
      expect(shouldForceFetchForProxy(DEFAULT_PROXY_SETTINGS, 'api.example.com')).toBe(false);
    });

    it('enabled=true + 外部ホスト → true', () => {
      const p: ProxySettings = { enabled: true, url: 'http://proxy:8080', noProxyHosts: '' };
      expect(shouldForceFetchForProxy(p, 'api.minimaxi.com')).toBe(true);
    });

    it('localhost は除外（noProxyHosts 空でも）', () => {
      const p: ProxySettings = { enabled: true, url: 'http://proxy:8080', noProxyHosts: '' };
      expect(shouldForceFetchForProxy(p, 'localhost')).toBe(false);
      expect(shouldForceFetchForProxy(p, '127.0.0.1')).toBe(false);
      expect(shouldForceFetchForProxy(p, 'mymac.local')).toBe(false);
    });

    it('noProxyHosts の完全一致は除外', () => {
      const p: ProxySettings = { enabled: true, url: 'http://proxy:8080', noProxyHosts: 'api.internal.com' };
      expect(shouldForceFetchForProxy(p, 'api.internal.com')).toBe(false);
      expect(shouldForceFetchForProxy(p, 'api.external.com')).toBe(true);
    });

    it('noProxyHosts のサフィックス一致は除外', () => {
      const p: ProxySettings = { enabled: true, url: 'http://proxy:8080', noProxyHosts: '.example.com' };
      expect(shouldForceFetchForProxy(p, 'foo.example.com')).toBe(false);
      expect(shouldForceFetchForProxy(p, 'example.com')).toBe(false);
      expect(shouldForceFetchForProxy(p, 'foo.otherexample.com')).toBe(true);
    });
  });

  describe('extractHost', () => {
    it('URL から hostname を抽出', () => {
      expect(extractHost('https://api.example.com:8080/v1/foo?x=1')).toBe('api.example.com');
    });
    it('不正 URL は入力をそのまま返す', () => {
      expect(extractHost('not a url')).toBe('not a url');
    });
  });

  describe('normalizeProxySettings', () => {
    it('既定値: enabled=false, url 空', () => {
      expect(normalizeProxySettings(undefined)).toEqual(DEFAULT_PROXY_SETTINGS);
    });
    it('部分入力 → 補完', () => {
      const out = normalizeProxySettings({ enabled: true, url: 'http://p:8080' });
      expect(out.enabled).toBe(true);
      expect(out.url).toBe('http://p:8080');
      expect(out.noProxyHosts).toBe(DEFAULT_PROXY_SETTINGS.noProxyHosts);
    });
    it('url が長すぎる場合は切り詰め', () => {
      const long = 'http://' + 'a'.repeat(1000);
      const out = normalizeProxySettings({ enabled: true, url: long });
      expect(out.url.length).toBeLessThanOrEqual(500);
    });
  });
});
