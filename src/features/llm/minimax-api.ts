/**
 * v0.40.0 (F-040): MiniMax API 直接呼び出しクライアント。
 * Think モード選択機能 Phase 2 で追加。
 *
 * - 公式: https://api.minimaxi.com/v1/chat/completions
 * - body に `thinking.type`（enabled|adaptive|disabled）を付与
 * - MiniMax は `reasoning_effort` パラメータを持たないため effort の細分化は
 *   `thinking.type` で表現する。enabled + medium は adaptive に委ねる
 */
import type { LlmClient, ThinkingConfig, ThinkingEffort } from './types';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const MINIMAX_DEFAULT_MODEL = 'minimax-text-01';

/** MiniMax の effort を thinking.type 値にマップ（medium → adaptive、他は enabled） */
function mapType(enabled: boolean, effort: ThinkingEffort): 'enabled' | 'adaptive' | 'disabled' {
  if (!enabled) return 'disabled';
  if (effort === 'medium') return 'adaptive';
  return 'enabled';
}

/**
 * v0.40.0 (F-040): MiniMax API 直接呼び出しクライアントを生成。
 * thinking.type を body に付与する（effort は type 値に変換して送信）。
 */
export function createMiniMaxClient(
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  return {
    id: 'minimax',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-minimax-api] no api key');
        return null;
      }
      const controller = new AbortController();
      const timeoutMs = opts.timeoutMs ?? 30000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const body = {
          model: MINIMAX_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          thinking: { type: mapType(thinking.enabled, thinking.effort) },
        };
        const res = await fetch(MINIMAX_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-minimax-api] HTTP ${res.status}`);
          return null;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-minimax-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}