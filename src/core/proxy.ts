/**
 * v0.38.0: プロキシ設定のプロセス env 適用ヘルパー。
 *
 * Node 18+ の undici fetch は HTTPS_PROXY / HTTP_PROXY / NO_PROXY 環境変数を
 * 自動的に尊重する。プロキシ設定が有効なときだけセット・無効なとき解除する。
 *
 * 注意:
 * - Obsidian の requestUrl (Electron net.request) はこの env 変数を尊重しないため、
 *   プロキシ有効時は httpGet/httpPostJson 側で requestUrl をスキップして Node fetch に
 *   フォールバックさせる（`getRequestUrlOrNull` で判定）。
 */

import type { ProxySettings } from './settings';

const HTTPS_PROXY = 'HTTPS_PROXY';
const HTTP_PROXY = 'HTTP_PROXY';
const NO_PROXY = 'NO_PROXY';

/** env 適用後の状態（テスト・デバッグ用） */
export function applyProxyEnv(proxy: ProxySettings | undefined): void {
  if (proxy?.enabled && proxy.url) {
    process.env[HTTPS_PROXY] = proxy.url;
    process.env[HTTP_PROXY] = proxy.url;
    process.env[NO_PROXY] = proxy.noProxyHosts || '';
  } else {
    delete process.env[HTTPS_PROXY];
    delete process.env[HTTP_PROXY];
    delete process.env[NO_PROXY];
  }
}

/**
 * プロキシが有効で、かつ対象ホストが NO_PROXY リストに含まれない場合は true。
 * `useFetchFallback: true` のヒントとして使う。
 */
export function shouldForceFetchForProxy(
  proxy: ProxySettings | undefined,
  targetHost: string,
): boolean {
  if (!proxy?.enabled || !proxy.url) return false;
  // NO_PROXY 判定
  const noProxy = (proxy.noProxyHosts ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const pattern of noProxy) {
    if (!pattern) continue;
    if (pattern.startsWith('.')) {
      // サフィックス一致（example.com → foo.example.com）
      if (targetHost.endsWith(pattern) || targetHost === pattern.slice(1)) return false;
    } else {
      // 完全一致
      if (targetHost === pattern) return false;
    }
  }
  // localhost はデフォルトで除外
  if (targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost.endsWith('.local')) {
    return false;
  }
  return true;
}

/** ホスト名抽出（URL 文字列から）。失敗時は入力をそのまま返す */
export function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
