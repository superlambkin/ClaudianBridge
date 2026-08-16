// src/legacy/convert-chroma.ts — Convert legacy chroma-inspector data.json to ClaudianBridgeSettings.
//
// The legacy chroma-inspector plugin stored its settings at the top level of
// data.json (no wrapping object). We map every field straight onto the
// `chroma.*` block of the new settings; `enabled` is forced to true when the
// user had a populated config (since they were actively using the feature).

import type { ClaudianBridgeSettings, ChromaSettings } from '../core/settings';
import { DEFAULT_CHROMA_SETTINGS } from '../core/settings';

export function convertFromChromaInspector(raw: unknown): Partial<ClaudianBridgeSettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const chroma: ChromaSettings = {
    enabled: true,
    chromaPath:
      typeof r.chromaPath === 'string' && r.chromaPath.trim() !== ''
        ? r.chromaPath
        : DEFAULT_CHROMA_SETTINGS.chromaPath,
    pythonPath:
      typeof r.pythonPath === 'string' && r.pythonPath.trim() !== ''
        ? r.pythonPath
        : DEFAULT_CHROMA_SETTINGS.pythonPath,
    embeddingModel:
      typeof r.embeddingModel === 'string' ? r.embeddingModel : DEFAULT_CHROMA_SETTINGS.embeddingModel,
    defaultNResults: Number.isFinite(r.defaultNResults)
      ? Number(r.defaultNResults)
      : DEFAULT_CHROMA_SETTINGS.defaultNResults,
    recordPreviewLength: Number.isFinite(r.recordPreviewLength)
      ? Number(r.recordPreviewLength)
      : DEFAULT_CHROMA_SETTINGS.recordPreviewLength,
    showProgressModal:
      typeof r.showProgressModal === 'boolean'
        ? r.showProgressModal
        : DEFAULT_CHROMA_SETTINGS.showProgressModal,
    enableRawSql:
      typeof r.enableRawSql === 'boolean' ? r.enableRawSql : DEFAULT_CHROMA_SETTINGS.enableRawSql,
    scriptPath:
      typeof r.scriptPath === 'string' ? r.scriptPath : DEFAULT_CHROMA_SETTINGS.scriptPath,
    hideInternal: DEFAULT_CHROMA_SETTINGS.hideInternal,
    ragEnabled: DEFAULT_CHROMA_SETTINGS.ragEnabled,
    ragScriptPath: DEFAULT_CHROMA_SETTINGS.ragScriptPath,
    ragConfigPath: DEFAULT_CHROMA_SETTINGS.ragConfigPath,
  };

  return { chroma };
}
