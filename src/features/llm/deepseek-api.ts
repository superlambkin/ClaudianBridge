/**
 * v0.40.0 (F-040): DeepSeek API 直接呼び出しクライアント。
 * Think モード選択機能 Phase 2 で追加。
 *
 * - 公式: https://api.deepseek.com/v1/chat/completions
 * - body に `thinking.type`（enabled|disabled）と `reasoning_effort`（low|high|max）を付与
 * - DeepSeek API は medium を受け付けないため、medium は high にフォールバック
 */
import type { LlmClient, ThinkingConfig, ThinkingEffort } from './types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/** DeepSeek の effort を API の reasoning_effort 値にマップ（medium / off は high にフォールバック） */
function mapEffort(effort: ThinkingEffort): 'low' | 'high' | 'max' {
  if (effort === 'low') return 'low';
  if (effort === 'high') return 'high';
  return 'high'; // medium / off → high フォールバック
}

/**
 * v0.40.0 (F-040): DeepSeek API 直接呼び出しクライアントを生成。
 * thinking.type + reasoning_effort を body に付与する。
 */
export function createDeepSeekClient(
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  return {
    id: 'deepseek',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-deepseek-api] no api key');
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
          model: DEEPSEEK_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          thinking: { type: thinking.enabled ? 'enabled' : 'disabled' },
          reasoning_effort: mapEffort(thinking.effort),
        };
        const res = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-deepseek-api] HTTP ${res.status}`);
          return null;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-deepseek-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
