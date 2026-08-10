// src/features/chroma/chroma/FilterBuilder.ts — Convert FilterSpec → Chroma where / where_document.

import type { FilterSpec } from "../types";

export interface BuiltFilter {
  /** Chroma `where` filter — sent verbatim to the Python CLI. */
  where: Record<string, unknown> | null;
  /** Chroma `where_document` filter. */
  whereDocument: Record<string, unknown> | null;
}

/**
 * Build a Chroma-compatible `where`/`where_document` object from a FilterSpec.
 *
 * Rules:
 * - All `metadataEqual` entries are AND-combined via top-level $and.
 * - `metadataIn` entries use `{ field: { $in: [...] } }`.
 * - `documentContains` becomes `{ $contains: text }`.
 * - Empty spec → both null.
 */
export function buildWhere(filter: FilterSpec): BuiltFilter {
  const clauses: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(filter.metadataEqual ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    clauses.push({ [key]: value });
  }

  for (const [key, values] of Object.entries(filter.metadataIn ?? {})) {
    const cleaned = (values ?? []).filter((v) => v !== "" && v !== null && v !== undefined);
    if (cleaned.length === 0) continue;
    clauses.push({ [key]: { $in: cleaned } });
  }

  const where =
    clauses.length === 0
      ? null
      : clauses.length === 1
        ? clauses[0]
        : { $and: clauses };

  const doc = (filter.documentContains ?? "").trim();
  const whereDocument = doc ? { $contains: doc } : null;

  return { where, whereDocument };
}

/**
 * Split a comma-separated string of values into the typed array used by
 * `metadataIn`. Trims and drops empties.
 */
export function parseCsv(input: string): string[] {
  return (input ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a JSON string suitable for `--where` CLI argument.
 * Returns null when there's nothing to filter.
 */
export function buildWhereJson(filter: FilterSpec): string | null {
  const { where } = buildWhere(filter);
  return where ? JSON.stringify(where) : null;
}
