/**
 * GitHub Releases の最新版を取得し、ローカルバージョンと比較する。
 * Spec: docs/superpowers/specs/2026-09-03-self-update-design.md (D4, D5)
 */
import { httpGet } from '../quota/http';
import type { ReleaseAsset, UpdateCheckResult } from './types';

export const RELEASES_LATEST_URL =
  'https://api.github.com/repos/superlambkin/ClaudianBridge/releases/latest';

const GH_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ClaudianBridge-Plugin',
};

/** タグの `v` プレフィックスを除去（D5） */
export function stripVPrefix(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

/** semver 厳密比較（a<b:負 / a>b:正 / 同等:0）。Major.Minor.Patch のみ */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface GithubLatestRelease {
  tag_name?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

interface RawResponse {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}

/**
 * 最新 Release の JSON を取得する。
 * requestUrl 経由で 404 等の場合は fetch（GitHub API は CORS 許可）へフォールバックする。
 */
async function fetchReleaseJson(): Promise<GithubLatestRelease> {
  const attempt = async (): Promise<RawResponse> => {
    const res = await httpGet(RELEASES_LATEST_URL, GH_HEADERS);
    return { status: res.status, ok: res.ok, json: () => res.json() };
  };
  let res: RawResponse = await attempt();
  if (!res.ok && typeof fetch === 'function') {
    // requestUrl 経路の失敗（404 等）は環境固有の可能性があるため fetch で再試行
    try {
      const fres = await fetch(RELEASES_LATEST_URL, { headers: GH_HEADERS });
      res = { status: fres.status, ok: fres.ok, json: () => fres.json() };
    } catch {
      /* fetch 失敗時は元のレスポンスで処理 */
    }
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.status === 404) {
    const detail = body ? ` — ${JSON.stringify(body).slice(0, 200)}` : '';
    throw new Error(`GitHub API 404: Release が見つかりません${detail}`);
  }
  if (res.status === 403) throw new Error('GitHub API 403: レート制限です。1 時間後に再試行してください');
  if (!res.ok || typeof body !== 'object' || body === null) {
    throw new Error(`GitHub API error: HTTP ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body as GithubLatestRelease;
}

/** 最新 Release を取得してローカルバージョンと比較する */
export async function checkForUpdate(localVersion: string): Promise<UpdateCheckResult> {
  const body = await fetchReleaseJson();
  const tagName = body.tag_name ?? '';
  const assets: ReleaseAsset[] = (body.assets ?? [])
    .filter((a): a is { name: string; browser_download_url: string } =>
      typeof a.name === 'string' && typeof a.browser_download_url === 'string')
    .map((a) => ({ name: a.name, browser_download_url: a.browser_download_url }));
  return {
    updateAvailable: compareSemver(stripVPrefix(tagName), localVersion) > 0,
    tagName,
    assets,
  };
}
