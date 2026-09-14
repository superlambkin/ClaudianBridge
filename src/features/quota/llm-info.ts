import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClaudianBridgeSettings } from '../../core/settings';

export type LlmProviderId = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu' | 'unknown';

export interface LlmInfo {
  provider: LlmProviderId;
  model: string | null;
  baseUrl: string | null;
  authTokenPresent: boolean;
}

export function defaultClaudeSettingsPath(): string {
  try {
    return path.join(os.homedir(), '.claude', 'settings.json');
  } catch {
    return 'C:\\Users\\superlambkin\\.claude\\settings.json';
  }
}

/** settings.json の env.ANTHROPIC_BASE_URL からプロバイダを推定 */
export function detectProviderFromBaseUrl(baseUrl: string | null): LlmProviderId {
  if (!baseUrl) return 'claude';
  const u = baseUrl.toLowerCase();
  if (u.includes('deepseek')) return 'deepseek';
  if (u.includes('kimi')) return 'kimi';
  if (u.includes('minimax')) return 'minimax';
  if (u.includes('bigmodel')) return 'zhipu';
  if (u.includes('z.ai')) return 'zhipu';
  return 'claude';
}

/** 指定パスの Claude Code settings.json から LLM 情報を読み取る（読めなければ unknown） */
export function readLlmInfoFromSettings(settingsPath?: string): LlmInfo {
  const p = settingsPath && settingsPath.trim() !== '' ? settingsPath : defaultClaudeSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const json = JSON.parse(raw) as {
      env?: Record<string, string | undefined>;
    };
    const env = json.env ?? {};
    const baseUrl = env.ANTHROPIC_BASE_URL ?? null;
    const model = env.ANTHROPIC_MODEL ?? null;
    const token = env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? null;
    return {
      provider: detectProviderFromBaseUrl(baseUrl),
      model,
      baseUrl,
      authTokenPresent: Boolean(token && token.trim() !== ''),
    };
  } catch {
    return { provider: 'unknown', model: null, baseUrl: null, authTokenPresent: false };
  }
}

/**
 * v0.39.0 (F-039): プロバイダ別 API キーを settings.quota から解決。
 * Claude は settings.json の ANTHROPIC_* を直接参照するため undefined。
 * Partial<Pick<>> を採用し、呼び出し側が一部フィールドのみでも渡せる。
 */
export function resolveApiKey(
  provider: LlmProviderId,
  quotaSettings: Partial<Pick<ClaudianBridgeSettings['quota'], 'deepseekApiKey' | 'kimiApiKey' | 'minimaxApiKey' | 'zhipuApiKey'>>,
): string | undefined {
  if (provider === 'claude' || provider === 'unknown') return undefined;
  const key = (() => {
    switch (provider) {
      case 'deepseek': return quotaSettings.deepseekApiKey;
      case 'kimi':     return quotaSettings.kimiApiKey;
      case 'minimax':  return quotaSettings.minimaxApiKey;
      case 'zhipu':    return quotaSettings.zhipuApiKey;
    }
  })();
  return key && key.trim() !== '' ? key : undefined;
}
