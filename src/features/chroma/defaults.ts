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
  scriptPath: "", // Empty = plugin folder / _chroma_inspect.py
  hideInternal: true, // chroma_db 内部の非表示 CSS を注入するか
  ragEnabled: false, // 右クリック「RAG検索」を有効化するか
  ragScriptPath: "", // query.py 絶対パス
  ragConfigPath: "", // config.yaml 絶対パス
};

export const MAX_QUERY_RESULTS = 100;
export const MIN_QUERY_RESULTS = 1;
export const MAX_PREVIEW_LENGTH = 10_000;
export const MIN_PREVIEW_LENGTH = 20;
