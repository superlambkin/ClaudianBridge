import type { ProviderQuota, QuotaProvider } from '../types';

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
  getEnv: (k: string) => string | undefined = (k) => process.env[k],
): QuotaProvider {
  const keyOf = (): string | undefined => getEnv('MINIMAX_CN_API_KEY') ?? getEnv('MINIMAX_API_KEY');
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
      const res = await fetch('https://api.minimaxi.com/v1/token_plan/remains', {
        headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
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
          current_interval_remaining_percent?: number;
        }>;
        base_resp?: { status_code?: number };
      };
      if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
        return { status: 'error', providerId: 'minimax', label: 'MiniMax', value: '', pct: null, error: `code ${json.base_resp.status_code}` };
      }
      const chat = json.model_remains?.find((m) => m.model_name?.toLowerCase().startsWith('minimax-m'));
      const pct = chat?.current_interval_remaining_percent
        ?? (chat && chat.current_interval_total_count
          ? Math.round((chat.current_interval_usage_count ?? 0) / chat.current_interval_total_count * 100)
          : null);
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