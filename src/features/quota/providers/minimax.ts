import type { ProviderQuota, QuotaProvider } from '../types';
import type { QuotaWindow } from '../../../core/settings';
import { httpGet } from '../http';

/**
 * MiniMax中国 token_plan 残量取得プロバイダ。
 *
 * GET https://api.minimaxi.com/v1/token_plan/remains
 * Authorization: Bearer MINIMAX_CN_API_KEY (fallback: MINIMAX_API_KEY)
 *
 * レスポンス: { model_remains: [{ model_name, current_interval_usage_count, current_interval_total_count, current_interval_remaining_percent, current_weekly_remaining_percent }], base_resp: { status_code } }
 * - chat モデル (model_name starts with "minimax-m") を優先選択
 * - window='week' なら current_weekly_remaining_percent を優先、それ以外は current_interval_remaining_percent
 * - 残量% が無ければ usage/total から % 算出（interval のみ）
 * - base_resp.status_code != 0 → error
 */
export function createMiniMaxProvider(
  getKey: () => string | undefined = () => process.env.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_API_KEY,
  opts?: { getWindow?: () => QuotaWindow },
): QuotaProvider {
  const keyOf = getKey;
  const windowOf = opts?.getWindow ?? (() => '5h' as const);
  return {
    id: 'minimax',
    label: 'MiniMax',
    envKeys: ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'],
    isConfigured: () => Boolean(keyOf()),
    async fetch(): Promise<ProviderQuota> {
      const key = keyOf();
      if (!key) {
        return { status: 'error', providerId: 'minimax', label: 'MiniMax', value: '', pct: null, error: 'no key' };
      }
      const res = await httpGet('https://api.minimaxi.com/v1/token_plan/remains', {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'expired', providerId: 'minimax', label: 'MiniMax', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { status: 'error', providerId: 'minimax', label: 'MiniMax', value: '', pct: null, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        model_remains?: Array<{
          model_name?: string;
          end_time?: number;
          current_interval_usage_count?: number;
          current_interval_total_count?: number;
          current_interval_remaining_count?: number;
          current_interval_remaining_percent?: number;
          weekly_end_time?: number;
          current_weekly_usage_count?: number;
          current_weekly_total_count?: number;
          current_weekly_remaining_percent?: number;
        }>;
        base_resp?: { status_code?: number };
      };
      if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
        return { status: 'error', providerId: 'minimax', label: 'MiniMax', value: '', pct: null, error: `code ${json.base_resp.status_code}` };
      }
      // チャット（general / minimax-m 始まり）モデルを優先選択。
      // 実際の API は "general" を返すため、minimax-m のみに限定しない。
      const chat = json.model_remains?.find(
        (m) => m.model_name?.toLowerCase() === 'general' || m.model_name?.toLowerCase().startsWith('minimax-m'),
      ) ?? json.model_remains?.[0];
      const weekly = windowOf() === 'week';
      // 残量% → 使用量% = 100 - 残量%（week は current_weekly_remaining_percent）
      let pct: number | null = null;
      let remainingText: string | null = null;
      let resetAt: string | number | null = null;
      if (chat) {
        const remainingPct = weekly ? chat.current_weekly_remaining_percent : chat.current_interval_remaining_percent;
        if (typeof remainingPct === 'number' && Number.isFinite(remainingPct)) {
          pct = Math.round(100 - remainingPct);
        } else if (!weekly && (chat.current_interval_total_count ?? 0) > 0) {
          const total = chat.current_interval_total_count as number;
          pct = Math.round((chat.current_interval_usage_count ?? 0) / total * 100);
        }
        const total = weekly ? chat.current_weekly_total_count ?? 0 : chat.current_interval_total_count ?? 0;
        const usage = weekly ? chat.current_weekly_usage_count ?? 0 : chat.current_interval_usage_count ?? 0;
        if (total > 0) remainingText = (total - usage).toLocaleString();
        resetAt = weekly ? (chat.weekly_end_time ?? null) : (chat.end_time ?? null);
      }
      return {
        status: 'success',
        providerId: 'minimax',
        label: 'MiniMax',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: weekly ? 'week' : 'chat',
        remaining: remainingText,
        resetAt,
      };
    },
  };
}