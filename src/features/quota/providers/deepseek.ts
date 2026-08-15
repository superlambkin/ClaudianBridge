import type { ProviderQuota, QuotaProvider } from '../types';
import { httpGet } from '../http';

/**
 * DeepSeek 残高取得プロバイダ。
 *
 * GET https://api.deepseek.com/user/balance
 * Authorization: Bearer DEEPSEEK_API_KEY
 *
 * レスポンス: { is_available, balance_infos: [{ currency, total_balance }] }
 * - 200: 残高文字列 (例: "110.00") → "¥110.00" 表示
 * - 401/403: expired
 * - 5xx / ネットワーク: error
 * - キー未設定: error (no key)
 */
export function createDeepSeekProvider(
  getKey: () => string | undefined = () => process.env.DEEPSEEK_API_KEY,
): QuotaProvider {
  const keyOf = getKey;
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    envKeys: ['DEEPSEEK_API_KEY'],
    isConfigured: () => Boolean(keyOf()),
    async fetch(): Promise<ProviderQuota> {
      const key = keyOf();
      if (!key) {
        return { status: 'error', providerId: 'deepseek', label: 'DeepSeek', value: '', pct: null, error: 'no key' };
      }
      const res = await httpGet('https://api.deepseek.com/user/balance', {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'expired', providerId: 'deepseek', label: 'DeepSeek', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { status: 'error', providerId: 'deepseek', label: 'DeepSeek', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as { balance_infos?: Array<{ total_balance?: string }> };
      const total = json.balance_infos?.[0]?.total_balance;
      const zeroBalance = total !== undefined && Number(total) === 0;
      return {
        status: 'success',
        providerId: 'deepseek',
        label: 'DeepSeek',
        value: `¥${total ?? '--'}`,
        pct: null,
        detail: '余额',
        zeroBalance,
        balance: total !== undefined ? Number(total) : null,
        remaining: total !== undefined ? `¥${total}` : null,
      };
    },
  };
}