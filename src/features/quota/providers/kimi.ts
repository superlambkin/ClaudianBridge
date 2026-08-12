import type { ProviderQuota, QuotaProvider } from '../types';
import { httpGet } from '../http';

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
  getKey: () => string | undefined = () => process.env.KIMI_CODING_API_KEY ?? process.env.KIMI_API_KEY,
): QuotaProvider {
  const keyOf = getKey;
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
      const res = await httpGet('https://api.kimi.com/coding/v1/usages', {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'expired', providerId: 'kimi', label: 'Kimi', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { status: 'error', providerId: 'kimi', label: 'Kimi', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        usage?: { limit?: string | number; used?: string | number; remaining?: string | number; resetTime?: string };
        limits?: Array<{
          window?: { duration?: number; timeUnit?: string };
          detail?: { limit?: string | number; used?: string | number; remaining?: string | number; resetTime?: string };
        }>;
      };
      // 5時間窓（window.duration === 300 分）の detail を優先。
      // 5時間窓 detail は used を持たず limit/remaining のみの場合があるため、
      // その場合は limit - remaining で算出する。週次の usage と混ぜない。
      const fiveHour = json.limits?.find((l) => l.window?.duration === 300)?.detail;
      let limit: number;
      let used: number;
      if (fiveHour) {
        limit = Number(fiveHour.limit ?? 0);
        const usedRaw = Number(fiveHour.used);
        used = usedRaw > 0 ? usedRaw : limit - Number(fiveHour.remaining ?? 0);
      } else {
        limit = Number(json.usage?.limit ?? 0);
        const usedRaw = Number(json.usage?.used);
        used = usedRaw > 0 ? usedRaw : limit - Number(json.usage?.remaining ?? 0);
      }
      const pct = limit > 0 ? Math.round((used / limit) * 100) : null;
      return {
        status: 'success',
        providerId: 'kimi',
        label: 'Kimi',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: '5h',
      };
    },
  };
}