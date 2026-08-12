import type { ProviderQuota, QuotaProvider } from '../types';

/**
 * Kimi for Coding usage 取得プロバイダ。
 *
 * GET https://api.kimi.com/coding/v1/usages
 * Authorization: Bearer KIMI_CODING_API_KEY (fallback: KIMI_API_KEY)
 *
 * レスポンス: { limit, used, remaining, resetTime }
 * - 使用率 = round(used / limit * 100) %
 * - 200: success (value: "<pct>%")
 * - 401/403: expired
 * - 5xx / ネットワーク: error
 */
export function createKimiProvider(
  getEnv: (k: string) => string | undefined = (k) => process.env[k],
): QuotaProvider {
  const keyOf = (): string | undefined => getEnv('KIMI_CODING_API_KEY') ?? getEnv('KIMI_API_KEY');
  return {
    id: 'kimi',
    label: 'Kimi',
    envKeys: ['KIMI_CODING_API_KEY', 'KIMI_API_KEY'],
    isConfigured: () => Boolean(keyOf()),
    async fetch(): Promise<ProviderQuota> {
      const key = keyOf();
      if (!key) {
        return { status: 'error', providerId: 'kimi', label: 'Kimi', value: '', pct: null, error: 'no key' };
      }
      const res = await fetch('https://api.kimi.com/coding/v1/usages', {
        headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'expired', providerId: 'kimi', label: 'Kimi', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { status: 'error', providerId: 'kimi', label: 'Kimi', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as { limit?: number; used?: number; remaining?: number; resetTime?: string };
      const limit = json.limit ?? 0;
      const used = json.used ?? (limit - (json.remaining ?? 0));
      const pct = limit > 0 ? Math.round((used / limit) * 100) : null;
      return {
        status: 'success',
        providerId: 'kimi',
        label: 'Kimi',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: 'coding',
      };
    },
  };
}