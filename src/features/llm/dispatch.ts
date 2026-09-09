/**
 * v0.40.0 (F-040): プロバイダ → LlmClient 解決の dispatch。
 *
 * Think モード選択機能 Phase 2 (Task 12) で 4 つの非 Claude プロバイダ
 * （DeepSeek / Zhipu / MiniMax / Kimi）を dispatch に追加。Phase 1 (Task 6)
 * は Claude のみだったが、本 Task で全 5 プロバイダに対応する。
 */
import type { LlmClient, ThinkingConfig } from './types';
import { createClaudeClient } from './claude-cli';
import { createDeepSeekClient } from './deepseek-api';
import { createZhipuClient } from './zhipu-api';
import { createMiniMaxClient } from './minimax-api';
import { createKimiClient } from './kimi-api';
import type { LlmProviderId } from '../quota/llm-info';

/**
 * プロバイダ ID と ThinkingConfig から適切な LlmClient を返す。
 * @param provider LlmProviderId（'claude' / 'deepseek' / 'kimi' / 'minimax' / 'zhipu' / 'unknown'）
 * @param apiKey プロバイダ API キー（Claude / unknown は未使用）
 * @param thinking Think モード設定
 */
export function resolveLlmClient(
  provider: LlmProviderId,
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  switch (provider) {
    case 'deepseek':
      return createDeepSeekClient(apiKey, thinking);
    case 'zhipu':
      return createZhipuClient(apiKey, thinking);
    case 'minimax':
      return createMiniMaxClient(apiKey, thinking);
    case 'kimi':
      return createKimiClient(apiKey, thinking);
    case 'claude':
      return createClaudeClient(thinking);
    case 'unknown':
    default:
      // 不明なプロバイダは warn ログを出した上で Claude にフォールバック
      // （v0.40.0 / F-040: 後方互換のため warn + Claude 継続）
      console.warn(`[cb-dispatch] unknown provider "${String(provider)}", falling back to Claude`);
      return createClaudeClient(thinking);
  }
}
