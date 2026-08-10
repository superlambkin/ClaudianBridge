// src/features/chroma/types.ts — Shared TypeScript types for chroma-inspector

/** Plugin settings persisted via Obsidian's saveData/loadData. */
export interface ChromaSettings {
  /** ChromaDB directory (Vault-relative by default; absolute accepted). */
  chromaPath: string;
  /** Python interpreter executable (e.g. "py" on Windows, "python3" elsewhere). */
  pythonPath: string;
  /** Embedding model name for semantic query (empty = query disabled). */
  embeddingModel: string;
  /** Default result count for queries. */
  defaultNResults: number;
  /** Document preview length in characters. */
  recordPreviewLength: number;
  /** Show progress modal during long operations. */
  showProgressModal: boolean;
  /** Master switch for the Advanced raw SQL feature. */
  enableRawSql: boolean;
  /** Optional override of the path to _chroma_inspect.py (defaults to vault root). */
  scriptPath: string;
}

/** A Chroma collection (as returned by `client.list_collections()`). */
export interface ChromaCollection {
  name: string;
  count: number | null;
  metadata: Record<string, unknown> | null;
}

/** A single Chroma record returned by get/where/query. */
export interface ChromaRecord {
  id: string;
  metadata: Record<string, unknown> | null;
  document: string | null;
  embedding: number[] | null;
  /** Distance score — only present on query() results. */
  distance: number | null;
}

/** Filter inputs from the SearchPanel — converted by FilterBuilder. */
export interface FilterSpec {
  /** Equality filter on a metadata field (e.g. { source: "x.pdf" }). */
  metadataEqual: Record<string, string | number | boolean>;
  /** `$in` filter on a metadata field. */
  metadataIn: Record<string, Array<string | number>>;
  /** `$contains` filter on document body. */
  documentContains: string;
  /** Optional semantic search text. */
  queryText: string;
  /** Result count. */
  nResults: number;
}

/** Raw structured response from Python CLI. */
export interface CliEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

/** Result of PythonRunner.run(). */
export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Options accepted by ChromaService.list/get/query/where. */
export interface ServiceCallOptions {
  vaultRoot: string;
  settings: ChromaSettings;
  /** Optional request token for stale-response suppression. */
  token?: number;
}

/** Result of a list collection call. */
export interface ListResult {
  collections: ChromaCollection[];
}

/** Result of a get call. */
export interface GetResult {
  records: ChromaRecord[];
  total: number;
}

/** Result of a query (semantic) call. */
export interface QueryResult {
  records: ChromaRecord[];
  total: number;
  /** Echoed query text — useful for UI display. */
  queryText: string;
}

/** Raw SQL execution row. */
export interface SqlRow {
  [column: string]: string | number | null;
}

/** Raw SQL service result. */
export interface SqlResult {
  columns: string[];
  rows: SqlRow[];
  truncated: boolean;
}
