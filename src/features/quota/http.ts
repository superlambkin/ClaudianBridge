/**
 * CORS を回避する HTTP GET ヘルパー。
 *
 * Obsidian レンダラーではブラウザの fetch が CORS を強制するため、
 * api.kimi.com 等は Authorization ヘッダーのプリフライト (OPTIONS) で 404 を返し失敗する。
 * Obsidian の requestUrl (メインプロセス経由) なら CORS 制約を受けない。
 * Node/テスト環境では fetch にフォールバックする。
 */

export interface HttpResponse {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}

type RequestUrlLike = (opts: {
  url: string;
  method: string;
  headers: Record<string, string>;
}) => Promise<{ status: number; json?: unknown; text?: string; arrayBuffer?: ArrayBuffer }>;

function resolveObsidianRequestUrl(): RequestUrlLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const obs = require('obsidian') as { requestUrl?: RequestUrlLike };
    if (typeof obs.requestUrl === 'function') return obs.requestUrl;
  } catch {
    /* obsidian が解決できない環境（テスト等）は無視 */
  }
  return null;
}

/** requestUrl を遅延解決（初回呼び出し時に確定） */
let cachedRequestUrl: RequestUrlLike | null | undefined;
function getRequestUrl(): RequestUrlLike | null {
  if (cachedRequestUrl === undefined) cachedRequestUrl = resolveObsidianRequestUrl();
  return cachedRequestUrl;
}

/** v0.38.0: プロセス env に HTTPS_PROXY がセットされていれば自動的に fetch フォールバック */
function hasProxyEnv(): boolean {
  return Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
}

/** v0.38.0: プロキシ有効時は requestUrl をスキップして fetch フォールバックに強制 */
export interface HttpGetOptions {
  /** true のとき Obsidian requestUrl をスキップ（プロキシ経由で fetch を使う用途） */
  forceFetch?: boolean;
}

/**
 * GET リクエストを実行。Obsidian では requestUrl、それ以外では fetch を使用。
 * forceFetch=true または HTTPS_PROXY 環境変数がセットされているときは必ず fetch を使う。
 */
export async function httpGet(
  url: string,
  headers: Record<string, string>,
  options?: HttpGetOptions,
): Promise<HttpResponse> {
  const ru = (options?.forceFetch || hasProxyEnv()) ? null : getRequestUrl();
  if (ru) {
    const res = await ru({ url, method: 'GET', headers });
    const ok = res.status >= 200 && res.status < 300;
    return {
      status: res.status,
      ok,
      async json() {
        // requestUrl は json をパース済みで返す
        if (res.json !== undefined) return res.json;
        const text = res.text ?? '';
        return JSON.parse(text);
      },
    };
  }
  // フォールバック: グローバル fetch（Node / テスト / 非 Obsidian）
  const res = await fetch(url, { headers });
  return {
    status: res.status,
    ok: res.ok,
    json: () => res.json(),
  };
}
