import type { ProviderQuota, QuotaProvider } from '../types';
import type { QuotaWindow } from '../../../core/settings';
import { httpGet } from '../http';

/**
 * 智谱 (Zhipu) GLM Coding Plan 使用率プロバイダ。
 *
 * GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
 * Authorization: Bearer ZHIPU_API_KEY (fallback: ZAI_API_KEY) — 生キーで可（JWT 生成不要）
 *
 * レスポンス: { code, data: { limits: [{ unit, percentage, nextResetTime, remaining }] } }
 * - unit: 3 = 5時間窓、6 = 週間窓。window 設定で優先窓を選択（無ければ片方にフォールバック）
 * - 200: 使用率% ("<pct>%")
 * - 401/403: expired
 * - その他 / code != 200 / limits 不在: error
 */
export function createZhipuProvider(
  getKey: () => string | undefined = () => process.env.ZHIPU_API_KEY ?? process.env.ZAI_API_KEY,
  opts?: { getWindow?: () => QuotaWindow },
): QuotaProvider {
  const keyOf = getKey;
  const windowOf = opts?.getWindow ?? (() => '5h' as const);
  return {
    id: 'zhipu',
    label: 'Zhipu',
    envKeys: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
    isConfigured: () => Boolean(keyOf()),
    async fetch(): Promise<ProviderQuota> {
      const key = keyOf();
      if (!key) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: 'no key' };
      }
      const res = await httpGet('https://open.bigmodel.cn/api/monitor/usage/quota/limit', {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en',
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'expired', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        code?: number;
        data?: { limits?: Array<{ unit?: number; percentage?: number | string; nextResetTime?: string | number | null; remaining?: number | null }> };
      };
      if (json.code !== 200) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: `code ${json.code}` };
      }
      const limits = json.data?.limits ?? [];
      const weekly = windowOf() === 'week';
      const preferred = weekly ? 6 : 3;
      const fallback = weekly ? 3 : 6;
      const limit = limits.find((l) => l.unit === preferred) ?? limits.find((l) => l.unit === fallback);
      if (!limit) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: 'limit not found' };
      }
      const pct = typeof limit.percentage === 'number' && Number.isFinite(limit.percentage)
        ? Math.round(limit.percentage)
        : null;
      return {
        status: 'success',
        providerId: 'zhipu',
        label: 'Zhipu',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: limit.unit === 6 ? 'week' : '5h',
        remaining: typeof limit.remaining === 'number' ? limit.remaining.toLocaleString() : null,
        resetAt: limit.nextResetTime ?? null,
      };
    },
  };
}
