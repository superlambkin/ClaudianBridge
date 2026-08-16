// src/features/chroma/chroma/ChromaService.ts — Façade over the Python CLI.
//
// All public methods follow the same pattern:
//   1. Build CLI args from a typed spec
//   2. Spawn PythonRunner.run()
//   3. Parse the JSON envelope via ResultNormalizer
//   4. Return typed objects (or throw)
//
// Methods are async; each call generates a fresh `requestId` for stale-response
// suppression at the call-site.

import type {
  ChromaSettings,
  FilterSpec,
  GetResult,
  ListResult,
  QueryResult,
  RunResult,
} from "../types";
import { resolveChromaPath, resolveScriptPath } from "../util/path";
import { parsePythonError, runPython, detectDimensionError } from "./chroma-runner";
import {
  normalizeGet,
  normalizeList,
  normalizeQuery,
} from "./ResultNormalizer";
import { buildWhereJson } from "./FilterBuilder";

export interface ListOptions {
  settings: ChromaSettings;
  vaultRoot: string;
  /** Plugin folder (default location of _chroma_inspect.py). */
  pluginDir?: string;
}

export interface GetOptions extends ListOptions {
  collection: string;
  limit?: number;
  offset?: number;
  ids?: string[];
  filter?: FilterSpec;
}

export interface QueryOptions extends ListOptions {
  collection: string;
  filter?: FilterSpec;
  embeddingModel?: string;
}

export interface QueryInput {
  text: string;
  nResults: number;
}

export class ChromaService {
  /** List all collections in the configured ChromaDB. */
  static async listCollections(opts: ListOptions): Promise<ListResult> {
    const run = await runPython({
      pythonPath: opts.settings.pythonPath,
      scriptPath: resolveScriptPath(opts.settings.scriptPath, opts.vaultRoot, opts.pluginDir),
      args: [
        "--json",
        "--path",
        resolveChromaPath(opts.settings.chromaPath, opts.vaultRoot),
        "list",
      ],
      cwd: opts.vaultRoot,
    });
    ensureOk(run);
    return normalizeList(JSON.parse(run.stdout || "null"));
  }

  /** get() with metadata filter and optional ID list.
   *
   * Skips `--where` entirely when there are no metadata clauses, so chroma
   * does not receive `{}` which it rejects.
   */
  static async get(opts: GetOptions): Promise<GetResult> {
    const args: string[] = [
      "--json",
      "--path",
      resolveChromaPath(opts.settings.chromaPath, opts.vaultRoot),
      "get",
      "--collection",
      opts.collection,
      "--limit",
      String(opts.limit ?? opts.settings.defaultNResults),
      "--offset",
      String(opts.offset ?? 0),
    ];
    if (opts.ids && opts.ids.length > 0) {
      args.push("--ids", opts.ids.join(","));
    }
    const whereJson = opts.filter ? buildWhereJson(opts.filter) : null;
    if (whereJson) args.push("--where", whereJson);
    const run = await runPython({
      pythonPath: opts.settings.pythonPath,
      scriptPath: resolveScriptPath(opts.settings.scriptPath, opts.vaultRoot, opts.pluginDir),
      args,
      cwd: opts.vaultRoot,
    });
    ensureOk(run);
    return normalizeGet(JSON.parse(run.stdout || "null"));
  }

  /** where() — metadata filter only (no semantic search).
   *
   * If the filter has no metadata clauses, the `--where` argument is omitted
   * entirely so chroma doesn't reject the empty `{}` value.
   */
  static async where(opts: GetOptions): Promise<GetResult> {
    const args: string[] = [
      "--json",
      "--path",
      resolveChromaPath(opts.settings.chromaPath, opts.vaultRoot),
      "where",
      "--collection",
      opts.collection,
      "--limit",
      String(opts.limit ?? opts.settings.defaultNResults),
    ];
    const whereJson = opts.filter
      ? buildWhereJson(opts.filter)
      : null;
    if (whereJson) args.push("--where", whereJson);
    if (opts.filter?.documentContains) {
      args.push("--key", opts.filter.documentContains);
    }
    const run = await runPython({
      pythonPath: opts.settings.pythonPath,
      scriptPath: resolveScriptPath(opts.settings.scriptPath, opts.vaultRoot, opts.pluginDir),
      args,
      cwd: opts.vaultRoot,
    });
    ensureOk(run);
    return normalizeGet(JSON.parse(run.stdout || "null"));
  }

  /** query() — semantic search. Requires an embedding function. */
  static async query(opts: QueryOptions, input: QueryInput): Promise<QueryResult> {
    const args: string[] = [
      "--json",
      "--path",
      resolveChromaPath(opts.settings.chromaPath, opts.vaultRoot),
      "query",
      "--collection",
      opts.collection,
      "--text",
      input.text,
      "-n",
      String(Math.max(1, input.nResults)),
    ];
    if (opts.filter?.documentContains) {
      args.push("--include", "metadatas,documents,distances");
    } else {
      args.push("--include", "metadatas,documents,distances");
    }
    const whereJson = opts.filter ? buildWhereJson(opts.filter) : null;
    if (whereJson) args.push("--where", whereJson);
    const run = await runPython({
      pythonPath: opts.settings.pythonPath,
      scriptPath: resolveScriptPath(opts.settings.scriptPath, opts.vaultRoot, opts.pluginDir),
      args,
      cwd: opts.vaultRoot,
      timeoutMs: 120_000, // semantic queries can take longer
    });
    ensureOk(run);
    return normalizeQuery(JSON.parse(run.stdout || "null"));
  }

  /** Probe Python + DB version (for Test connection). */
  static async version(opts: ListOptions): Promise<{ version: string; hasPeek: boolean }> {
    const run = await runPython({
      pythonPath: opts.settings.pythonPath,
      scriptPath: resolveScriptPath(opts.settings.scriptPath, opts.vaultRoot, opts.pluginDir),
      args: ["--json", "version"],
      cwd: opts.vaultRoot,
    });
    ensureOk(run);
    const parsed = JSON.parse(run.stdout || "null") as {
      data?: { version?: string; hasPeek?: boolean };
    };
    return {
      version: parsed?.data?.version ?? "?",
      hasPeek: parsed?.data?.hasPeek === true,
    };
  }
}

function emptyFilter(): FilterSpec {
  return {
    metadataEqual: {},
    metadataIn: {},
    documentContains: "",
    queryText: "",
    nResults: 0,
  };
}

function ensureOk(run: RunResult): void {
  if (run.exitCode !== 0) {
    const msg = parsePythonError(run);
    const dim = detectDimensionError(msg);
    if (dim) throw dim;
    throw new Error(msg);
  }
}
