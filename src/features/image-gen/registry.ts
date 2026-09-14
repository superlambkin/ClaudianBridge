import { resolveApiKey } from '../quota/service';
import { createMiniMaxImageProvider } from './providers/minimax';
import { createZhipuImageProvider } from './providers/zhipu';
import type {
  ImageGenProvider,
  ImageGenProviderId,
} from './types';

/**
 * ImageGenProvider のレジストリ。
 * src/features/quota/service.ts の resolveApiKey / MultiQuotaService パターンを踏襲。
 * 設定 → 環境変数の順で API キーを解決する。
 */

const ENV_KEYS: Record<ImageGenProviderId, string[]> = {
  minimax: ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'],
  zhipu: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
};

export function getImageGenProvider(
  id: ImageGenProviderId,
  getSettingsKey: (provider: ImageGenProviderId) => string | undefined,
  getEnv: (k: string) => string | undefined = (k) => process.env[k],
): ImageGenProvider {
  const providerId: ImageGenProviderId = id;
  const envKeys = ENV_KEYS[providerId];
  const settingsKey = getSettingsKey(providerId);

  const getKey = (): string | undefined => resolveApiKey(settingsKey, getEnv, envKeys);

  if (providerId === 'minimax') return createMiniMaxImageProvider(getKey);
  return createZhipuImageProvider(getKey);
}
