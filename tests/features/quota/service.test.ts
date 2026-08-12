// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { MultiQuotaService } from '../../../src/features/quota/service';

function makeService(opts?: Partial<{ quotaEnabled: boolean; providers: string[] }>) {
  const store = {
    load: () => ({ general: { quotaEnabled: opts?.quotaEnabled ?? true } }),
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
});