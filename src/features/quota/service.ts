import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { ClaudeQuotaService } from './core';
import type { ProviderId, ProviderQuota, QuotaProvider, QuotaSnapshot } from './types';
import { createDeepSeekProvider } from './providers/deepseek';
import { createKimiProvider } from './providers/kimi';
import { createMiniMaxProvider } from './providers/minimax';

export interface MultiQuotaServiceOptions {
  app: App;
  store: ConfigStore;
  refreshSec: number;
  switchSec: number;
  getEnv?: (k: string) => string | undefined;
  /** データ収集周期（refreshAll 完了）ごとに呼ばれるフック */
  onCollect?: () => void;
}

/** 設定の API キー（settings.quota.*）を優先し、なければ環境変数へフォールバックするキー解決 */
export function resolveApiKey(
  settingsKey: string | undefined,
  getEnv: (k: string) => string | undefined,
  envKeys: string[],
): string | undefined {
  if (settingsKey && settingsKey.trim() !== '') return settingsKey.trim();
  for (const k of envKeys) {
    const v = getEnv(k);
    if (v && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/** 接続テスト結果 */
export interface ConnectionTestResult {
  ok: boolean;
  quota?: ProviderQuota;
  error?: string;
}

/** プロバイダに一時 API キーを渡して接続テスト（fetch を 1 回実行） */
export async function testProviderConnection(
  provider: QuotaProvider,
): Promise<ConnectionTestResult> {
  if (!provider.isConfigured()) {
    return { ok: false, error: 'no key' };
  }
  try {
    const quota = await provider.fetch();
    if (quota.status === 'success') {
      return { ok: true, quota };
    }
    return { ok: false, error: quota.error ?? quota.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Claude snapshot → 汎用 ProviderQuota 変換 */
export function claudeSnapshotToProviderQuota(snap: QuotaSnapshot): ProviderQuota {
  const five = snap.windows.fiveHour;
  let status: ProviderQuota['status'];
  if (snap.status === 'success') status = 'success';
  else if (snap.status === 'expired') status = 'expired';
  else if (snap.status === 'fetching') status = 'fetching';
  else status = 'error';
  return {
    status,
    providerId: 'claude',
    label: 'Claude',
    value: five.utilization !== null ? `${five.utilization}%` : '--',
    pct: five.utilization,
    detail: snap.error,
  };
}

export class MultiQuotaService {
  private claudeService: ClaudeQuotaService;
  private providers: QuotaProvider[];
  private quotas = new Map<ProviderId, ProviderQuota>();
  private activeIdx = 0;
  private fetchTimer: ReturnType<typeof setInterval> | null = null;
  private switchTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(q: ProviderQuota | null) => void>();

  constructor(private opts: MultiQuotaServiceOptions) {
    this.claudeService = new ClaudeQuotaService({
      app: opts.app,
      store: opts.store,
      refreshSec: opts.refreshSec,
    });
    const getEnv = opts.getEnv ?? ((k: string) => process.env[k]);
    const cfg = opts.store.load();
    this.providers = [
      createDeepSeekProvider(() => resolveApiKey(cfg.quota?.deepseekApiKey, getEnv, ['DEEPSEEK_API_KEY'])),
      createKimiProvider(() => resolveApiKey(cfg.quota?.kimiApiKey, getEnv, ['KIMI_CODING_API_KEY', 'KIMI_API_KEY'])),
      createMiniMaxProvider(() => resolveApiKey(cfg.quota?.minimaxApiKey, getEnv, ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'])),
    ].filter((p) => p.isConfigured());
  }

  /** 表示対象プロバイダ ID のリスト（Claude は quotaEnabled 設定に依存、表示フラグ/接続成功のみ） */
  getAvailableIds(): ProviderId[] {
    const cfg = this.opts.store.load();
    const flags = cfg.quota?.displayModels ?? { claude: true, deepseek: true, kimi: true, minimax: true };
    const ids: ProviderId[] = [];
    if (cfg.general.quotaEnabled && flags.claude) ids.push('claude');
    for (const p of this.providers) {
      if (!flags[p.id]) continue; // 個別OFF
      const q = this.quotas.get(p.id);
      if (q && (q.status === 'error' || q.status === 'expired')) continue; // 接続失敗は非表示
      if (q && q.zeroBalance) continue; // 残金 0 はスキップ
      ids.push(p.id);
    }
    return ids;
  }

  /** 現在表示中の ProviderQuota（無ければ null） */
  getActive(): ProviderQuota | null {
    const ids = this.getAvailableIds();
    if (ids.length === 0) return null;
    const id = ids[this.activeIdx % ids.length];
    if (id === 'claude') return claudeSnapshotToProviderQuota(this.claudeService.getSnapshot());
    return (
      this.quotas.get(id) ?? {
        status: 'fetching',
        providerId: id,
        label: id,
        value: '...',
        pct: null,
      }
    );
  }

  /** 起動：Claude service start → 全プロバイダ初回フェッチ → タイマー設定 */
  async start(): Promise<void> {
    if (this.opts.store.load().general.quotaEnabled) {
      await this.claudeService.start();
    }
    await this.refreshAll();
    if (this.opts.refreshSec > 0) {
      this.fetchTimer = setInterval(() => {
        void this.refreshAll();
      }, this.opts.refreshSec * 1000);
    }
    if (this.opts.switchSec > 0) {
      this.switchTimer = setInterval(() => {
        this.next();
      }, this.opts.switchSec * 1000);
    }
  }

  /** 全プロバイダを即時フェッチ */
  async refreshAll(): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        this.quotas.set(p.id, {
          status: 'fetching',
          providerId: p.id,
          label: p.label,
          value: '',
          pct: null,
        });
        try {
          this.quotas.set(p.id, await p.fetch());
        } catch (e) {
          this.quotas.set(p.id, {
            status: 'error',
            providerId: p.id,
            label: p.label,
            value: '',
            pct: null,
            error: String(e),
          });
        }
      }),
    );
    this.emit();
    this.opts.onCollect?.();   // ← 追加
  }

  /** 表示プロバイダを次のものに進める（循環） */
  next(): void {
    const ids = this.getAvailableIds();
    if (ids.length === 0) return;
    this.activeIdx = (this.activeIdx + 1) % ids.length;
    this.emit();
  }

  /** 更新購読（戻り値で解除） */
  onUpdate(cb: (q: ProviderQuota | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    const q = this.getActive();
    for (const cb of this.listeners) cb(q);
  }

  async stop(): Promise<void> {
    if (this.fetchTimer) {
      clearInterval(this.fetchTimer);
      this.fetchTimer = null;
    }
    if (this.switchTimer) {
      clearInterval(this.switchTimer);
      this.switchTimer = null;
    }
    await this.claudeService.stop();
    this.listeners.clear();
  }
}