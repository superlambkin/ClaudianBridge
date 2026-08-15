// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { MultiQuotaService, resolveApiKey, testProviderConnection } from '../../../src/features/quota/service';
import { createDeepSeekProvider } from '../../../src/features/quota/providers/deepseek';

function makeService(opts?: Partial<{
  quotaEnabled: boolean;
  providers: string[];
  apiKeys?: { deepseek?: string; zhipu?: string };
  displayModels?: { claude?: boolean; deepseek?: boolean; kimi?: boolean; minimax?: boolean; zhipu?: boolean };
  onCollect?: () => void;
}>) {
  const store = {
    load: () => ({
      general: { quotaEnabled: opts?.quotaEnabled ?? true },
      quota: {
        deepseekApiKey: opts?.apiKeys?.deepseek ?? '',
        kimiApiKey: '',
        minimaxApiKey: '',
        zhipuApiKey: opts?.apiKeys?.zhipu ?? '',
        zhipuPythonPath: 'py',
        displayModels: {
          claude: opts?.displayModels?.claude ?? true,
          deepseek: opts?.displayModels?.deepseek ?? true,
          kimi: opts?.displayModels?.kimi ?? true,
          minimax: opts?.displayModels?.minimax ?? true,
          zhipu: opts?.displayModels?.zhipu ?? true,
        },
      },
    }),
  };
  const env = new Map<string, string>();
  (opts?.providers ?? []).forEach((k) => env.set(k, 'x'));
  const getEnv = (k: string) => env.get(k);
  const svc = new MultiQuotaService({
    app: {} as never,
    store: store as never,
    refreshSec: 0,
    switchSec: 0,
    getEnv,
    onCollect: opts?.onCollect,
  } as never);
  return svc;
}

describe('MultiQuotaService', () => {
  it('キー無しプロバイダは available に含まれない', () => {
    const svc = makeService({ quotaEnabled: false });
    expect(svc.getAvailableIds()).toEqual([]);
  });

  it('DEEPSEEK_API_KEY 設定時のみ DeepSeek が available', () => {
    const svc = makeService({ quotaEnabled: false, providers: ['DEEPSEEK_API_KEY'] });
    expect(svc.getAvailableIds()).toEqual(['deepseek']);
  });

  it('next() で循環する', () => {
    const svc = makeService({ quotaEnabled: true, providers: ['DEEPSEEK_API_KEY'] });
    // claude + deepseek の 2 つ → next で 0→1→0
    expect(svc.getAvailableIds()).toEqual(['claude', 'deepseek']);
    svc.next();
    expect(svc.getActive()?.providerId).toBe('deepseek');
    svc.next();
    expect(svc.getActive()?.providerId).toBe('claude');
  });

  it('onUpdate 購読で callback が呼ばれる', async () => {
    const svc = makeService({ quotaEnabled: true, providers: ['DEEPSEEK_API_KEY'] });
    const cb = vi.fn();
    const off = svc.onUpdate(cb);
    svc.next();
    expect(cb).toHaveBeenCalled();
    off();
    svc.next();
    // 解除後は呼ばれない（直前の呼び出し回数は変化しない）
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('settings の API キーが環境変数より優先される', () => {
    const env = (k: string) => (k === 'DEEPSEEK_API_KEY' ? 'env-key' : undefined);
    expect(resolveApiKey('settings-key', env, ['DEEPSEEK_API_KEY'])).toBe('settings-key');
    expect(resolveApiKey('', env, ['DEEPSEEK_API_KEY'])).toBe('env-key');
    expect(resolveApiKey('   ', env, ['DEEPSEEK_API_KEY'])).toBe('env-key');
    expect(resolveApiKey('', () => undefined, ['DEEPSEEK_API_KEY'])).toBeUndefined();
  });

  it('settings API キー設定時は DeepSeek が available になる', () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk-from-settings' } });
    expect(svc.getAvailableIds()).toEqual(['deepseek']);
  });

  it('表示OFFのプロバイダは available に含まれない', () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk-from-settings' }, displayModels: { deepseek: false } });
    expect(svc.getAvailableIds()).toEqual([]);
  });

  it('ZHIPU_API_KEY 設定時のみ Zhipu が available', () => {
    const svc = makeService({ quotaEnabled: false, providers: ['ZHIPU_API_KEY'] });
    expect(svc.getAvailableIds()).toEqual(['zhipu']);
  });

  it('settings の zhipu API キー設定時は available になる', () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { zhipu: 'sk-zhipu' } });
    expect(svc.getAvailableIds()).toEqual(['zhipu']);
  });

  it('表示OFFの zhipu は available に含まれない', () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { zhipu: 'sk-zhipu' }, displayModels: { zhipu: false } });
    expect(svc.getAvailableIds()).toEqual([]);
  });

  it('接続失敗（error）プロバイダは available に含まれない', async () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk-from-settings' } });
    // refreshAll を実行し、fetch が error を返す状態を作る
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch;
    try {
      await svc.refreshAll();
    } finally {
      globalThis.fetch = orig;
    }
    expect(svc.getAvailableIds()).toEqual([]);
  });

  it('接続成功プロバイダは available に含まれる', async () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk-from-settings' } });
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '100.00' }],
    }), { status: 200 })) as typeof fetch;
    try {
      await svc.refreshAll();
    } finally {
      globalThis.fetch = orig;
    }
    expect(svc.getAvailableIds()).toEqual(['deepseek']);
  });

  it('DeepSeek 残金 0 は available に含まれない（表示SKIP）', async () => {
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk-from-settings' } });
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '0.00' }],
    }), { status: 200 })) as typeof fetch;
    try {
      await svc.refreshAll();
    } finally {
      globalThis.fetch = orig;
    }
    expect(svc.getAvailableIds()).toEqual([]);
  });

  it('refreshAll 完了時に onCollect が呼ばれる', async () => {
    const onCollect = vi.fn();
    const svc = makeService({ quotaEnabled: false, apiKeys: { deepseek: 'sk' }, onCollect });
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '100.00' }],
    }), { status: 200 })) as typeof fetch;
    try {
      await svc.refreshAll();
    } finally {
      globalThis.fetch = orig;
    }
    expect(onCollect).toHaveBeenCalledTimes(1);
  });
});

describe('testProviderConnection', () => {
  it('キー未設定 → ok=false, error=no key', async () => {
    const p = createDeepSeekProvider(() => undefined);
    const r = await testProviderConnection(p);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no key');
  });

  it('fetch 成功 → ok=true, quota 付き', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '99.00' }],
    }), { status: 200 })) as typeof fetch;
    try {
      const p = createDeepSeekProvider(() => 'sk-test');
      const r = await testProviderConnection(p);
      expect(r.ok).toBe(true);
      expect(r.quota?.value).toBe('¥99.00');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('fetch 例外 → ok=false, error メッセージ', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    try {
      const p = createDeepSeekProvider(() => 'sk-test');
      const r = await testProviderConnection(p);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('network down');
    } finally {
      globalThis.fetch = orig;
    }
  });
});