import { httpPostJson } from '../http';
import type {
  ImageGenProvider,
  ImageGenRequest,
  ImageGenOutcome,
  ImageGenProviderId,
} from '../types';

const ENDPOINT = 'https://api.minimaxi.com/v1/image_generation';
const ENV_KEYS = ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'] as const;

interface MiniMaxResponseBody {
  data?: {
    image_base64?: string[];
    image_urls?: string[];
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MiniMax image URL fetch failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * MiniMax (image-01) 文生図プロバイダ。
 * src/features/quota/providers/minimax.ts の fetch パターンを踏襲。
 */
export function createMiniMaxImageProvider(
  getKey: () => string | undefined = () =>
    process.env.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_API_KEY,
): ImageGenProvider {
  return {
    id: 'minimax' satisfies ImageGenProviderId,
    label: 'MiniMax (image-01)',
    envKeys: [...ENV_KEYS],
    isConfigured: () => Boolean(getKey()),
    async fetch(req: ImageGenRequest): Promise<ImageGenOutcome> {
      const key = getKey();
      if (!key) return { ok: false, error: { kind: 'no_key', providerId: 'minimax' } };

      const httpRes = await httpPostJson(
        ENDPOINT,
        { Authorization: `Bearer ${key}` },
        {
          model: 'image-01',
          prompt: req.prompt,
          response_format: 'base64',
          aspect_ratio: req.aspectRatio,
        },
      );

      if (httpRes.status === 401 || httpRes.status === 403) {
        return { ok: false, error: { kind: 'expired', providerId: 'minimax', httpStatus: httpRes.status } };
      }
      if (!httpRes.ok) {
        return {
          ok: false,
          error: { kind: 'error', providerId: 'minimax', httpStatus: httpRes.status, message: `HTTP ${httpRes.status}` },
        };
      }

      let body: MiniMaxResponseBody;
      try {
        body = (await httpRes.json()) as MiniMaxResponseBody;
      } catch (e) {
        return {
          ok: false,
          error: {
            kind: 'error',
            providerId: 'minimax',
            httpStatus: httpRes.status,
            message: `JSON parse failed: ${(e as Error).message}`,
          },
        };
      }

      if (body.base_resp && body.base_resp.status_code !== undefined && body.base_resp.status_code !== 0) {
        return {
          ok: false,
          error: {
            kind: 'error',
            providerId: 'minimax',
            httpStatus: httpRes.status,
            message: body.base_resp.status_msg ?? `MiniMax base_resp.status_code=${body.base_resp.status_code}`,
          },
        };
      }

      const base64 = body.data?.image_base64?.[0];
      if (base64) {
        const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
        return { ok: true, result: { bytes, ext: 'jpg' } };
      }

      const url = body.data?.image_urls?.[0];
      if (url) {
        try {
          const bytes = await downloadFromUrl(url);
          return { ok: true, result: { bytes, ext: 'jpg' } };
        } catch (e) {
          return {
            ok: false,
            error: { kind: 'error', providerId: 'minimax', message: (e as Error).message },
          };
        }
      }

      return {
        ok: false,
        error: { kind: 'error', providerId: 'minimax', message: 'No image data in MiniMax response' },
      };
    },
  };
}
