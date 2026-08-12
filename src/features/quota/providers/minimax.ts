import type { ProviderQuota, QuotaProvider } from '../types';
import { httpGet } from '../http';

/**
 * MiniMax中国 token_plan 残量取得プロバイダ。
 *
 * GET https://api.minimaxi.com/v1/token_plan/remains
 * Authorization: Bearer MINIMAX_CN_API_KEY (fallback: MINIMAX_API_KEY)
 *
 * レスポンス: { model_remains: [{ model_name, current_interval_usage_count, current_interval_total_count, current_interval_remaining_percent }], base_resp: { status_code } }
 * - chat モデル (model_name starts with "minimax-m") を優先選択
 * - current_interval_remaining_percent があればそれを優先
 * - なければ usage/total から % 算出
 * - base_resp.status_code != 0 → error
 */
export function createMiniMaxProvider(
  getKey: () => string | undefined = () => process.env.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_API_KEY,
): QuotaProvider {
  const keyOf = getKey;
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
          current_interval_usage_count?: number;
          current_interval_total_count?: number;
          current_interval_remaining_count?: number;
          current_interval_remaining_percent?: number;
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
      // current_interval_remaining_percent は「残量%」。使用量% = 100 - 残量%。
      let pct: number | null = null;
      if (chat && typeof chat.current_interval_remaining_percent === 'number' && Number.isFinite(chat.current_interval_remaining_percent)) {
        pct = Math.round(100 - chat.current_interval_remaining_percent);
      } else if (chat && (chat.current_interval_total_count ?? 0) > 0) {
        const total = chat.current_interval_total_count as number;
        pct = Math.round((chat.current_interval_usage_count ?? 0) / total * 100);
      }
      return {
        status: 'success',
        providerId: 'minimax',
        label: 'MiniMax',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: 'chat',
      };
    },
  };
}