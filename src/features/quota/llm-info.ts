import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LlmProviderId = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'unknown';

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
