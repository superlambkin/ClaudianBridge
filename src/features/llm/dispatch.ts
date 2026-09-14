/**
 * v0.40.0 (F-040): プロバイダ → LlmClient 解決の dispatch。
 *
 * Think モード選択機能 Phase 2 (Task 12) で 4 つの非 Claude プロバイダ
 * （DeepSeek / Zhipu / MiniMax / Kimi）を dispatch に追加。Phase 1 (Task 6)
 * は Claude のみだったが、本 Task で全 5 プロバイダに対応する。
 *
 * v0.43.0 (F-041): LLM リクエスト時の OpenVPN 自動接続フックを追加。
 * `dispatchLlmRequest()` が VPN 接続保証とプロバイダ解決を一体で行う
 * エントリポイント。VPN 失敗時は Notice を出して LLM 呼び出しはブロックしない。
 */
import { Notice } from 'obsidian';
import type { LlmClient, ThinkingConfig } from './types';
import { createClaudeClient } from './claude-cli';
import { createDeepSeekClient } from './deepseek-api';
import { createZhipuClient } from './zhipu-api';
import { createMiniMaxClient } from './minimax-api';
import { createKimiClient } from './kimi-api';
import type { LlmProviderId } from '../quota/llm-info';
import { ensureVpnConnected } from '../network/openvpn';
import type { OpenVpnSettings } from '../network/types';

/** dispatchLlmRequest に渡す設定の最小型（network.openvpn だけ参照） */
export interface DispatchConfig {
  network?: {
    openvpn?: OpenVpnSettings;
  };
}

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

/**
 * F-041: LLM リクエスト時のエントリポイント。
 * OpenVPN 自動接続が有効なら先に `ensureVpnConnected()` を await し、
 * その後 `resolveLlmClient()` でプロバイダ別 LlmClient を返す。
 *
 * - VPN 接続保証は `enabled && autoConnectOnLlm` の両方 true でのみ発火
 * - 失敗時は Notice を出すが LLM 解決はブロックしない（ユーザ判断で続行）
 *
 * @param cfg プラグイン設定（network.openvpn を参照）
 * @param provider LlmProviderId
 * @param apiKey プロバイダ API キー
 * @param thinking Think モード設定
 */
export async function dispatchLlmRequest(
  cfg: DispatchConfig | undefined,
  provider: LlmProviderId,
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): Promise<LlmClient> {
  // === F-041: OpenVPN 接続保証 ===
  const vpn = cfg?.network?.openvpn;
  if (vpn?.enabled && vpn.autoConnectOnLlm) {
    try {
      await ensureVpnConnected(vpn);
    } catch (e) {
      new Notice(`⚠️ OpenVPN 接続に失敗: ${(e as Error).message}\nLLM 呼び出しは継続します`);
    }
  }
  return resolveLlmClient(provider, apiKey, thinking);
}
