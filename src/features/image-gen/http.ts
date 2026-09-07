/**
 * CORS を回避する HTTP POST (JSON body) ヘルパー。
 *
 * Obsidian レンダラーではブラウザ fetch が CORS を強制するため、Authorization
 * ヘッダーのプリフライト (OPTIONS) で失敗する API もある。Obsidian の
 * requestUrl は main プロセス経由なので CORS 制約を受けない。
 * Node/テスト環境では fetch にフォールバックする。
 *
 * 設計は src/features/quota/http.ts (httpGet) を踏襲。
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
  body?: string;
  throw?: boolean;
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

let cachedRequestUrl: RequestUrlLike | null | undefined;
function getRequestUrl(): RequestUrlLike | null {
  if (cachedRequestUrl === undefined) cachedRequestUrl = resolveObsidianRequestUrl();
  return cachedRequestUrl;
}

/**
 * POST リクエスト（JSON body）を実行。
 * Obsidian 環境では requestUrl、それ以外では fetch を使用。
 */
export async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<HttpResponse> {
  const jsonBody = JSON.stringify(body);
  const mergedHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };

  const ru = getRequestUrl();
  if (ru) {
    const res = await ru({ url, method: 'POST', headers: mergedHeaders, body: jsonBody });
    const ok = res.status >= 200 && res.status < 300;
    return {
      status: res.status,
      ok,
      async json() {
        if (res.json !== undefined) return res.json;
        const text = res.text ?? '';
        return JSON.parse(text);
      },
    };
  }

  // フォールバック: グローバル fetch (Node / テスト / 非 Obsidian)
  const res = await fetch(url, {
    method: 'POST',
    headers: mergedHeaders,
    body: jsonBody,
    ...(signal ? { signal } : {}),
  });
  return {
    status: res.status,
    ok: res.ok,
    json: () => res.json(),
  };
}
