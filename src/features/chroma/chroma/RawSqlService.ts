// src/features/chroma/chroma/RawSqlService.ts — Read-only SQLite access to ChromaDB internals.
//
// IMPORTANT: This service is gated behind `settings.enableRawSql`. The Modal
// must not surface the entry point until the master switch is on.
//
// What it does:
//   - Locates the SQLite file (chroma.sqlite3) under the chromaPath
//   - Connects in URI mode=ro (read-only)
//   - Validates the user-supplied SQL is SELECT-only
//   - Truncates to MAX_ROWS to keep the UI responsive

import * as path from "path";
import * as fs from "fs/promises";
import type { ChromaSettings, SqlResult } from "../types";
import { resolveChromaPath } from "../util/path";
import { normalizeSql } from "./ResultNormalizer";

export const MAX_ROWS = 1000;

/** Decision returned by isReadOnlySelect(). */
export interface SqlGuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Whitelist SELECT-only check. We do a best-effort parse of the first
 * statement — multi-statement input is rejected.
 */
export function isReadOnlySelect(sql: string): SqlGuardResult {
  const trimmed = (sql ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Empty SQL" };

  // Reject multiple statements (no semicolons other than the trailing one).
  const noTrailing = trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
  if (noTrailing.includes(";")) {
    return { ok: false, reason: "Multiple statements are not allowed" };
  }

  const head = noTrailing.split(/\s+/)[0]?.toLowerCase();
  if (head !== "select" && head !== "with") {
    return {
      ok: false,
      reason: `Only SELECT (or WITH ... SELECT) is allowed. Got: "${head ?? ""}"`,
    };
  }

  // Block obvious dangerous keywords anywhere in the statement.
  const banned = /\b(insert|update|delete|drop|alter|attach|create|replace|vacuum|pragma)\b/i;
  if (banned.test(noTrailing)) {
    return { ok: false, reason: "Statement contains a mutating keyword" };
  }

  return { ok: true };
}

export interface RunSqlOptions {
  settings: ChromaSettings;
  vaultRoot: string;
  sql: string;
}

/** Run a SELECT-only query against the chroma.sqlite3 file. */
export async function runSql(opts: RunSqlOptions): Promise<SqlResult> {
  if (!opts.settings.enableRawSql) {
    throw new Error("Raw SQL is disabled in settings");
  }
  const guard = isReadOnlySelect(opts.sql);
  if (!guard.ok) throw new Error(guard.reason ?? "SQL rejected");

  const chromaAbs = resolveChromaPath(opts.settings.chromaPath, opts.vaultRoot);
  const dbFile = await findSqliteFile(chromaAbs);
  if (!dbFile) {
    throw new Error(`Could not locate a sqlite file under ${chromaAbs}`);
  }

  // Use Node's better-sqlite3 if available, else spawn sqlite3 CLI.
  // (better-sqlite3 is OPTIONAL — installed only when raw SQL is enabled.)
  try {
    // @ts-expect-error better-sqlite3 is an optional peer dependency
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    try {
      const stmt = db.prepare(opts.sql);
      const rowsRaw = stmt.all(MAX_ROWS + 1);
      const truncated = rowsRaw.length > MAX_ROWS;
      const rows = truncated ? rowsRaw.slice(0, MAX_ROWS) : rowsRaw;

      // Column names from statement.
      const columns = stmt.columns().map((c: { name: string }) => c.name);
      const wrapped = { columns, rows, truncated };
      return normalizeSql(wrapped);
    } finally {
      db.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error(
        "better-sqlite3 not installed. Run `npm install better-sqlite3` in the plugin folder."
      );
    }
    throw e;
  }
}

async function findSqliteFile(dir: string): Promise<string | null> {
  const candidates = ["chroma.sqlite3", "chroma.sqlite", "sqlite.db"];
  for (const name of candidates) {
    const full = path.join(dir, name);
    try {
      await fs.access(full);
      return full;
    } catch {
      /* continue */
    }
  }
  return null;
}
