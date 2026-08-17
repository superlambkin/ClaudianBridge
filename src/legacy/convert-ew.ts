import type { ClaudianBridgeSettings } from '../core/settings';
import { DEFAULT_WHITELIST_SETTINGS } from '../core/settings';

function normalizeExtList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WHITELIST_SETTINGS.extensions];
  return raw
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
    .filter((e) => e.length > 0);
}

export function convertFromExtensionWhitelist(raw: unknown): Partial<ClaudianBridgeSettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    whitelist: {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_WHITELIST_SETTINGS.enabled,
      extensions: normalizeExtList(r.extensions),
      alwaysShowFolders: typeof r.alwaysShowFolders === 'boolean' ? r.alwaysShowFolders : DEFAULT_WHITELIST_SETTINGS.alwaysShowFolders,
      // v0.22.0: _ フォルダ非表示（既定 ON）
      hideUnderscoreFolders: DEFAULT_WHITELIST_SETTINGS.hideUnderscoreFolders,
    },
  };
}
