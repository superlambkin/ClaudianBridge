import type { ImageGenProviderId, ImageGenAspectRatio } from '../../core/settings';

/**
 * v0.38.0 (F-038): 文生図（Text-to-Image）機能のコア型定義。
 *
 * 既存の QuotaProvider (src/features/quota/types.ts) の抽象を踏襲。
 * resolveApiKey (src/features/quota/service.ts:24-35) と同じ優先順
 * (settings → env vars) で API キーを解決する factory パターン。
 */

export type { ImageGenProviderId, ImageGenAspectRatio };

export interface ImageGenRequest {
  prompt: string;
  aspectRatio: ImageGenAspectRatio;
}

export interface ImageGenResult {
  /** 生成画像のバイト列（保存用） */
  bytes: Uint8Array;
  /** Provider 推奨拡張子 */
  ext: 'png' | 'jpg' | 'jpeg';
}

export type ImageGenError =
  | { kind: 'no_key'; providerId: ImageGenProviderId }
  | { kind: 'expired'; providerId: ImageGenProviderId; httpStatus: number }
  | { kind: 'error'; providerId: ImageGenProviderId; httpStatus?: number; message: string };

export type ImageGenOutcome =
  | { ok: true; result: ImageGenResult }
  | { ok: false; error: ImageGenError };

export interface ImageGenProvider {
  id: ImageGenProviderId;
  label: string;
  envKeys: string[];
  isConfigured(): boolean;
  fetch(req: ImageGenRequest): Promise<ImageGenOutcome>;
}

/** ImageGenError を人間が読める文字列にフォーマット（UI 表示用） */
export function formatImageGenError(err: ImageGenError): string {
  switch (err.kind) {
    case 'no_key': return `${err.providerId} API key not configured`;
    case 'expired': return `${err.providerId} API key expired (HTTP ${err.httpStatus})`;
    case 'error': {
      const statusPart = err.httpStatus !== undefined ? ` (HTTP ${err.httpStatus})` : '';
      return `${err.providerId} error${statusPart}: ${err.message}`;
    }
  }
}
