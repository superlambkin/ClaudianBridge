import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { Platform } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { createIdleSnapshot, EVENT_QUOTA_UPDATED, type QuotaSnapshot, type QuotaStatus } from './types';
import { httpGet } from './http';

export interface ClaudeQuotaServiceOptions {
  app: App;
  store: ConfigStore;
  refreshSec: number;
}

export class ClaudeQuotaService {
  private snapshot: QuotaSnapshot = createIdleSnapshot();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(snap: QuotaSnapshot) => void> = new Set();
  private inFlight = false;

  constructor(private readonly opts: ClaudeQuotaServiceOptions) {}

  /** Token 読み取り（macOS Keychain 優先 → ファイル fallback → null） */
  async readToken(): Promise<string | null> {
    if (Platform.isMobile) return null;
    try {
      if (process.platform === 'darwin') {
        const macToken = await this.readFromKeychain();
        if (macToken) {
          this.snapshot.tokenSource = 'keychain';
          return macToken;
        }
      }
    } catch {
      // Keychain 失敗 → ファイルに fallback
    }
    try {
      const fileToken = await this.readFromFile();
      if (fileToken) {
        this.snapshot.tokenSource = 'file';
        return fileToken;
      }
    } catch {
      // ファイル不存在
    }
    this.snapshot.tokenSource = 'none';
    return null;
  }

  private async readFromKeychain(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const proc = spawn('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`keychain exit ${code}`));
        try {
          const json = JSON.parse(stdout.trim()) as Record<string, Record<string, unknown>>;
          const oauth = json?.claudeAiOauth ?? json?.['claude.ai_oauth'];
          const token = (oauth as { accessToken?: unknown })?.accessToken;
          resolve(typeof token === 'string' ? token : null);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }

  private async readFromFile(): Promise<string | null> {
    const home = os.homedir();
    const credPath = path.join(home, '.claude', '.credentials.json');
    const raw = await fs.readFile(credPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const oauth = json?.claudeAiOauth ?? json?.['claude.ai_oauth'];
    const token = (oauth as { accessToken?: unknown })?.accessToken;
    return typeof token === 'string' ? token : null;
  }

  /** OAuth Usage API を叩いて残量スナップショットを取得 */
  async fetchQuota(token: string): Promise<QuotaSnapshot> {
    try {
      const res = await httpGet('https://api.anthropic.com/api/oauth/usage', {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claudian-bridge/1.0',
      });
      if (res.status === 401 || res.status === 403) {
        return this.setStatus('expired', `HTTP ${res.status}`);
      }
      if (res.status === 429) {
        // 前回値を保持して error 扱いにしない
        return this.setStatus('success', undefined);
      }
      if (!res.ok) {
        return this.setStatus('error', `HTTP ${res.status}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      return this.parseUsageResponse(json);
    } catch (e) {
      return this.setStatus('error', e instanceof Error ? e.message : String(e));
    }
  }

  private parseUsageResponse(json: Record<string, unknown>): QuotaSnapshot {
    const windowFrom = (w: unknown): { utilization: number | null; resetsAt: string | null } => {
      if (!w || typeof w !== 'object') return { utilization: null, resetsAt: null };
      const obj = w as { utilization?: unknown; resets_at?: unknown };
      return {
        utilization: typeof obj.utilization === 'number' ? obj.utilization : null,
        resetsAt: typeof obj.resets_at === 'string' ? obj.resets_at : null,
      };
    };

    const extra = json.extra_usage as
      | { is_enabled?: unknown; utilization?: unknown; resets_at?: unknown }
      | undefined;

    const snapshot: QuotaSnapshot = {
      status: 'success',
      windows: {
        fiveHour: windowFrom(json.five_hour),
        sevenDay: windowFrom(json.seven_day),
      },
      extraUsage: extra
        ? {
            isEnabled: Boolean(extra.is_enabled),
            utilization: typeof extra.utilization === 'number' ? extra.utilization : null,
            resetsAt: typeof extra.resets_at === 'string' ? extra.resets_at : null,
          }
        : null,
      fetchedAt: Date.now(),
      tokenSource: this.snapshot.tokenSource,
    };
    if (json.seven_day_opus) snapshot.windows.sevenDayOpus = windowFrom(json.seven_day_opus);
    if (json.seven_day_sonnet) snapshot.windows.sevenDaySonnet = windowFrom(json.seven_day_sonnet);
    this.snapshot = snapshot;
    return snapshot;
  }

  private setStatus(status: QuotaStatus, error?: string): QuotaSnapshot {
    this.snapshot = { ...this.snapshot, status, error, fetchedAt: Date.now() };
    return this.snapshot;
  }

  // --- ライフサイクル (Task 6) ---

  /** Service を起動（タイマー開始 + 即座に 1 回フェッチ） */
  async start(): Promise<void> {
    if (Platform.isMobile) {
      this.snapshot = { ...this.snapshot, status: 'unsupported' };
      // Mobile では emit しない（per 仕様: fetch しない）
      return;
    }
    await this.refreshOnce();
    if (this.opts.refreshSec > 0 && !this.timer) {
      this.timer = setInterval(() => {
        void this.refreshOnce();
      }, this.opts.refreshSec * 1000);
    }
  }

  /** Service を停止（タイマー解除 + 購読者クリア） */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }

  /** 手動即時フェッチ */
  async forceRefresh(): Promise<QuotaSnapshot> {
    await this.refreshOnce();
    return this.snapshot;
  }

  /** 現在のスナップショットを返す */
  getSnapshot(): QuotaSnapshot {
    return this.snapshot;
  }

  /** スナップショット更新の購読（unsubscribe 関数を返す） */
  onUpdate(cb: (snap: QuotaSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** 1 回フェッチ（in-flight ガード付き） */
  private async refreshOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.snapshot = { ...this.snapshot, status: 'fetching' };
      this.emit();
      const token = await this.readToken();
      if (!token) {
        this.snapshot = { ...this.snapshot, status: 'expired', error: 'no token' };
        this.emit();
        return;
      }
      this.snapshot = await this.fetchQuota(token);
      this.emit();
    } finally {
      this.inFlight = false;
    }
  }

  /** 全購読者にスナップショットを通知 */
  private emit(): void {
    const snap = this.snapshot;
    // workspace.trigger は Obsidian 内部で例外を投げることがある（未知イベント名/環境依存）。
    // quota 機能の通知は自前の listeners で完結するため、workspace 連携は best-effort とし
    // 例外が onload を失敗させないよう try/catch で保護する。
    try {
      const trigger = (this.opts.app as { workspace?: { trigger?: (n: string, ...a: unknown[]) => void } }).workspace?.trigger;
      if (typeof trigger === 'function') trigger(EVENT_QUOTA_UPDATED, snap);
    } catch (e) {
      console.warn('[claudian-bridge] workspace.trigger(EVENT_QUOTA_UPDATED) failed:', e);
    }
    for (const cb of this.listeners) {
      try {
        cb(snap);
      } catch {
        /* listener error は握り潰す */
      }
    }
  }
}

let _instance: ClaudeQuotaService | null = null;
export function getClaudeQuotaService(): ClaudeQuotaService | null { return _instance; }
