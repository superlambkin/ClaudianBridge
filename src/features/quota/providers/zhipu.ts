import * as path from 'path';
import type { ProviderQuota, QuotaProvider } from '../types';
import { runPython, parseJsonOutput } from '../python';

export interface ZhipuProviderOptions {
  getKey: () => string | undefined;
  getPythonPath: () => string;
  getVaultRoot: () => string;
}

/** Vault 内のヘルパースクリプト相対パス */
const SCRIPT_VAULT_REL = '00_Vault管理/_設定ファイル/_scripts/_query_zhipu_quota.py';

/**
 * 智谱 (Zhipu) GLM Coding Plan 使用率プロバイダ。
 *
 * Python スクリプト（zai-sdk）を spawn し、5 時間窓使用率 % を取得する。
 * - 成功: value = "<pct>%"
 * - 401/403: expired
 * - その他 / Python 不在 / JSON 不正: error
 */
export function createZhipuProvider(opts: ZhipuProviderOptions): QuotaProvider {
  return {
    id: 'zhipu',
    label: 'Zhipu',
    envKeys: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
    isConfigured: () => Boolean(opts.getKey()),
    async fetch(): Promise<ProviderQuota> {
      const key = opts.getKey();
      if (!key) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: 'no key' };
      }
      const scriptPath = path.join(opts.getVaultRoot(), SCRIPT_VAULT_REL);
      const run = await runPython({
        pythonPath: opts.getPythonPath(),
        scriptPath,
        args: [],
        cwd: path.dirname(scriptPath),
        timeoutMs: 30_000,
        env: { ZHIPU_API_KEY: key },
      });
      if (run.exitCode !== 0) {
        return {
          status: 'error',
          providerId: 'zhipu',
          label: 'Zhipu',
          value: '',
          pct: null,
          error: run.stderr.trim() || `exit ${run.exitCode}`,
        };
      }
      const parsed = parseJsonOutput<{ ok: boolean; pct?: number; nextResetTime?: string | null; unit?: number; error?: string }>(run.stdout);
      if (!parsed.ok) {
        return { status: 'error', providerId: 'zhipu', label: 'Zhipu', value: '', pct: null, error: `python: ${parsed.error}` };
      }
      const d = parsed.data;
      if (!d.ok) {
        return {
          status: d.error === 'expired' ? 'expired' : 'error',
          providerId: 'zhipu',
          label: 'Zhipu',
          value: '',
          pct: null,
          error: d.error ?? 'unknown',
        };
      }
      const pct = typeof d.pct === 'number' && Number.isFinite(d.pct) ? d.pct : null;
      return {
        status: 'success',
        providerId: 'zhipu',
        label: 'Zhipu',
        value: pct !== null ? `${pct}%` : '--',
        pct,
        detail: d.unit === 6 ? 'week' : '5h',
      };
    },
  };
}
