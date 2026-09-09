/**
 * v0.40.0 (F-040): Zhipu (GLM-4.5) API 直接呼び出しクライアント。
 * Think モード選択機能 Phase 2 で追加。
 *
 * - 公式: https://api.z.ai/api/paas/v4/chat/completions
 * - body に `thinking.type`（enabled|disabled）のみ付与
 * - Zhipu API は `reasoning_effort` パラメータを持たないため effort は送信しない
 */
import type { LlmClient, ThinkingConfig } from './types';

const ZHIPU_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZHIPU_DEFAULT_MODEL = 'glm-4.5';

/**
 * v0.40.0 (F-040): Zhipu (GLM-4.5) API 直接呼び出しクライアントを生成。
 * thinking.type のみを body に付与する（effort は送信しない）。
 */
export function createZhipuClient(
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  return {
    id: 'zhipu',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-zhipu-api] no api key');
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
          model: ZHIPU_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          thinking: { type: thinking.enabled ? 'enabled' : 'disabled' },
        };
        const res = await fetch(ZHIPU_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-zhipu-api] HTTP ${res.status}`);
          return null;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-zhipu-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}