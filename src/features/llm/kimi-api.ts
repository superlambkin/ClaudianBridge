/**
 * v0.40.0 (F-040): Kimi (Moonshot) API 直接呼び出しクライアント。
 * Think モード選択機能 Phase 2 で追加。
 *
 * - 公式: https://api.moonshot.cn/v1/chat/completions
 * - Moonshot API は body の `thinking` パラメータをサポートしないため、
 *   thinking ON/OFF は **モデルの選択** で切り替える:
 *     - thinking OFF: `moonshot-v1-128k`
 *     - thinking ON:  `kimi-thinking-preview`
 * - `reasoning_effort` 相当の細分化は Moonshot API では未確定のため未対応
 */
import type { LlmClient, ThinkingConfig } from './types';

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-128k';         // thinking OFF 用
const KIMI_THINKING_MODEL = 'kimi-thinking-preview';   // thinking ON 用

/**
 * v0.40.0 (F-040): Kimi (Moonshot) API 直接呼び出しクライアントを生成。
 * thinking ON/OFF は body ではなくモデルの選択で切り替える。
 */
export function createKimiClient(
  apiKey: string | undefined,
  thinking: ThinkingConfig,
): LlmClient {
  return {
    id: 'kimi',
    async runPrompt(prompt, opts) {
      if (!apiKey) {
        console.warn('[cb-kimi-api] no api key');
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
          // thinking 有効時は kimi-thinking-preview モデルを使用
          // （Moonshot API は body の thinking フィールドをサポートしないため）
          model: thinking.enabled ? KIMI_THINKING_MODEL : KIMI_DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          // thinking.type は送信しない（no-op になるため）
        };
        const res = await fetch(KIMI_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[cb-kimi-api] HTTP ${res.status}`);
          return null;
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') return null;
        return content.trim();
      } catch (e) {
        console.warn('[cb-kimi-api] error:', e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}