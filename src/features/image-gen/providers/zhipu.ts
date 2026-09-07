import { httpPostJson } from '../http';
import type {
  ImageGenProvider,
  ImageGenRequest,
  ImageGenOutcome,
  ImageGenProviderId,
  ImageGenAspectRatio,
} from '../types';

const ENDPOINT = 'https://api.z.ai/api/paas/v4/images/generations';
const ENV_KEYS = ['ZHIPU_API_KEY', 'ZAI_API_KEY'] as const;

const ASPECT_TO_SIZE: Record<ImageGenAspectRatio, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1152x864',
};

interface ZhipuResponseBody {
  data?: Array<{ url?: string }>;
  error?: { message?: string };
}

async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zhipu image URL fetch failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Zhipu GLM-Image 文生図プロバイダ。
 * POST → data[].url → 2 次 fetch で画像バイト列取得。
 * src/features/quota/providers/zhipu.ts の概念を踏襲（ただし Python 経由ではなく直接 HTTP）。
 */
export function createZhipuImageProvider(
  getKey: () => string | undefined = () => process.env.ZHIPU_API_KEY ?? process.env.ZAI_API_KEY,
  getModel: () => string = () => 'glm-image',
): ImageGenProvider {
  return {
    id: 'zhipu' satisfies ImageGenProviderId,
    label: 'Zhipu (GLM-Image)',
    envKeys: [...ENV_KEYS],
    isConfigured: () => Boolean(getKey()),
    async fetch(req: ImageGenRequest): Promise<ImageGenOutcome> {
      const key = getKey();
      if (!key) return { ok: false, error: { kind: 'no_key', providerId: 'zhipu' } };

      const httpRes = await httpPostJson(
        ENDPOINT,
        { Authorization: `Bearer ${key}` },
        {
          model: getModel(),
          prompt: req.prompt,
          quality: 'hd',
          size: ASPECT_TO_SIZE[req.aspectRatio],
        },
      );

      if (httpRes.status === 401 || httpRes.status === 403) {
        return { ok: false, error: { kind: 'expired', providerId: 'zhipu', httpStatus: httpRes.status } };
      }
      if (!httpRes.ok) {
        return {
          ok: false,
          error: { kind: 'error', providerId: 'zhipu', httpStatus: httpRes.status, message: `HTTP ${httpRes.status}` },
        };
      }

      let body: ZhipuResponseBody;
      try {
        body = (await httpRes.json()) as ZhipuResponseBody;
      } catch (e) {
        return {
          ok: false,
          error: {
            kind: 'error',
            providerId: 'zhipu',
            httpStatus: httpRes.status,
            message: `JSON parse failed: ${(e as Error).message}`,
          },
        };
      }

      if (body.error?.message) {
        return {
          ok: false,
          error: { kind: 'error', providerId: 'zhipu', httpStatus: httpRes.status, message: body.error.message },
        };
      }

      const url = body.data?.[0]?.url;
      if (!url) {
        return {
          ok: false,
          error: { kind: 'error', providerId: 'zhipu', message: 'No image URL in Zhipu response' },
        };
      }

      try {
        const bytes = await downloadFromUrl(url);
        return { ok: true, result: { bytes, ext: 'png' } };
      } catch (e) {
        return {
          ok: false,
          error: { kind: 'error', providerId: 'zhipu', message: (e as Error).message },
        };
      }
    },
  };
}
