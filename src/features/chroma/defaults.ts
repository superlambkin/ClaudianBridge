// src/features/chroma/defaults.ts — Default values for ChromaSettings

import type { ChromaSettings } from "./types";

// Platform-aware Python interpreter (matches vault-office-bridge pattern).
const DEFAULT_PYTHON =
  typeof process !== "undefined" && process.platform === "win32"
    ? "py"
    : "python3";

export const DEFAULT_CHROMA_SETTINGS: ChromaSettings = {
  chromaPath: "chroma_db",
  pythonPath: DEFAULT_PYTHON,
  embeddingModel: "",
  defaultNResults: 5,
  recordPreviewLength: 240,
  showProgressModal: true,
  enableRawSql: false, // Security: default OFF
  scriptPath: "", // Empty = vault root / _chroma_inspect.py
};

export const MAX_QUERY_RESULTS = 100;
export const MIN_QUERY_RESULTS = 1;
export const MAX_PREVIEW_LENGTH = 10_000;
export const MIN_PREVIEW_LENGTH = 20;
