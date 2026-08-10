// src/features/chroma/chroma/ResultNormalizer.ts — Convert Python JSON envelope → typed objects.
//
// Defensive against:
//   - missing fields (metadata null, document null, embedding null)
//   - non-string IDs
//   - legacy responses without { ok, data, error } envelope

import type {
  CliEnvelope,
  ChromaCollection,
  ChromaRecord,
  ListResult,
  GetResult,
  QueryResult,
  SqlRow,
  SqlResult,
} from "../types";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function asNumberArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((n) => (typeof n === "number" ? n : Number(n)));
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isCliEnvelope<T>(v: unknown): v is CliEnvelope<T> {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return "ok" in r && "data" in r && "error" in r;
}

/** Unwrap an envelope; on failure, throw with the error string. */
function unwrap<T>(raw: unknown): T {
  if (isCliEnvelope<T>(raw)) {
    if (raw.ok && raw.data !== null && raw.data !== undefined) {
      return raw.data as T;
    }
    throw new Error(raw.error ?? "Unknown CLI error");
  }
  // Legacy un-enveloped output — assume `raw` is the data directly.
  return raw as T;
}

// ─────────────────────── list ───────────────────────
export function normalizeList(raw: unknown): ListResult {
  const data = unwrap<{ collections?: unknown[] }>(raw);
  const cols = (data.collections ?? []) as unknown[];
  const collections: ChromaCollection[] = cols.map((c) => {
    const r = asRecord(c) ?? {};
    return {
      name: asString(r.name) ?? "<unknown>",
      count: asNumber(r.count),
      metadata: asRecord(r.metadata),
    };
  });
  return { collections };
}

// ─────────────────────── get / where (shared shape) ───────────────────────
function normalizeRecord(v: unknown): ChromaRecord {
  const r = asRecord(v) ?? {};
  return {
    id: asString(r.id) ?? "<no-id>",
    metadata: asRecord(r.metadata),
    document: asString(r.document),
    embedding: asNumberArray(r.embedding),
    distance: null, // get/where never includes distance
  };
}

export function normalizeGet(raw: unknown): GetResult {
  const data = unwrap<{ records?: unknown[]; total?: unknown }>(raw);
  const records = ((data.records ?? []) as unknown[]).map(normalizeRecord);
  const total = asNumber(data.total) ?? records.length;
  return { records, total };
}

// ─────────────────────── query ───────────────────────
function normalizeQueryRecord(v: unknown): ChromaRecord {
  const r = asRecord(v) ?? {};
  return {
    id: asString(r.id) ?? "<no-id>",
    metadata: asRecord(r.metadata),
    document: asString(r.document),
    embedding: asNumberArray(r.embedding),
    distance: asNumber(r.distance),
  };
}

export function normalizeQuery(raw: unknown): QueryResult {
  const data = unwrap<{
    records?: unknown[];
    total?: unknown;
    queryText?: unknown;
  }>(raw);
  const records = ((data.records ?? []) as unknown[]).map(normalizeQueryRecord);
  const total = asNumber(data.total) ?? records.length;
  const queryText = asString(data.queryText) ?? "";
  return { records, total, queryText };
}

// ─────────────────────── raw SQL ───────────────────────
export function normalizeSql(raw: unknown): SqlResult {
  const data = unwrap<{
    columns?: string[];
    rows?: unknown[];
    truncated?: boolean;
  }>(raw);
  const columns = Array.isArray(data.columns) ? data.columns.map(String) : [];
  const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
  const rows: SqlRow[] = rowsRaw.map((r) => {
    const rec = asRecord(r) ?? {};
    const out: SqlRow = {};
    for (const col of columns) {
      const v = rec[col];
      out[col] = v === undefined ? null : (v as string | number | null);
    }
    return out;
  });
  return {
    columns,
    rows,
    truncated: data.truncated === true,
  };
}
