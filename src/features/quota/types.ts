/** 単一ウィンドウの残量 */
export interface QuotaWindow {
  utilization: number | null;
  resetsAt: string | null;
}

/** 追加計費使用量 */
export interface ExtraUsage {
  isEnabled: boolean;
  utilization: number | null;
  resetsAt: string | null;
}

/** ステータス enum-string */
export type QuotaStatus =
  | 'idle'
  | 'fetching'
  | 'success'
  | 'expired'
  | 'error'
  | 'unsupported';

/** 1 回の API レスポンスのスナップショット */
export interface QuotaSnapshot {
  status: QuotaStatus;
  windows: {
    fiveHour: QuotaWindow;
    sevenDay: QuotaWindow;
    sevenDayOpus?: QuotaWindow;
    sevenDaySonnet?: QuotaWindow;
  };
  extraUsage: ExtraUsage | null;
  fetchedAt: number;
  error?: string;
  tokenSource: 'keychain' | 'file' | 'none';
}

/** ワークスペースイベント名 */
export const EVENT_QUOTA_UPDATED = 'claudian-quota-updated';

/** ポーリング間隔の境界 */
export const DEFAULT_QUOTA_REFRESH_SEC = 60;
export const QUOTA_REFRESH_MIN_SEC = 10;
export const QUOTA_REFRESH_MAX_SEC = 600;

/** 間隔を [MIN, MAX] にクランプ、不正値はデフォルト */
export function clampRefreshSec(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_QUOTA_REFRESH_SEC;
  return Math.max(QUOTA_REFRESH_MIN_SEC, Math.min(QUOTA_REFRESH_MAX_SEC, Math.floor(v)));
}

/** IDLE 状態の初期スナップショット */
export function createIdleSnapshot(): QuotaSnapshot {
  return {
    status: 'idle',
    windows: {
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
    },
    extraUsage: null,
    fetchedAt: 0,
    tokenSource: 'none',
  };
}
