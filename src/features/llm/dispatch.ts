/**
 * v0.38.0 (F-039): プロバイダ → LlmClient 解決の dispatch。
 *
 * Phase 1 (Task 6) では Claude のみ実装。他プロバイダは Task 12 で
 * createDeepseekClient / createKimiClient 等を追加する。
 */
import type { LlmClient, ThinkingConfig } from './types';
import { createClaudeClient } from './claude-cli';
import type { LlmProviderId } from '../quota/llm-info';

/**
 * プロバイダ ID と ThinkingConfig から適切な LlmClient を返す。
 * @param provider LlmProviderId（'claude' / 'deepseek' / 'kimi' / 'minimax' / 'zhipu' / 'unknown'）
 * @param apiKey API キー（Phase 1 では未使用。Task 9 で resolveApiKey 追加時に使用）
 * @param thinking Think モード設定
 */
export function resolveLlmClient(
  provider: LlmProviderId,
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  void apiKey; // Task 9 で apiKey を使用予定（Phase 1 では未参照）
  switch (provider) {
    case 'claude':
      return createClaudeClient(thinking);
    case 'deepseek':
    case 'kimi':
    case 'minimax':
    case 'zhipu':
    case 'unknown':
    default:
      // v0.38.0 は Claude のみ。他は v0.39.0 で実装
      return createClaudeClient(thinking);
  }
}
