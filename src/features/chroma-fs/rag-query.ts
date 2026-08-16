// src/features/chroma-fs/rag-query.ts — Run word-pdf-rag query.py with --source filter.
//
// Reuses runPython/parsePythonError/parseJsonOutput from features/chroma/chroma-runner.
// query.py is spawned with cwd = its own directory so relative paths (./Model, config.yaml)
// resolve correctly.

import * as path from 'path';
import { runPython, parsePythonError, parseJsonOutput } from '../chroma/chroma/chroma-runner';

export interface RagSource {
  source: string;
  page?: string | number;
  score?: number;
}

export interface RagQueryResult {
  ok: boolean;
  answer: string;
  sources: RagSource[];
}

/** Parse query.py --json stdout into a RagQueryResult. Never throws. */
export function parseRagJsonOutput(stdout: string): RagQueryResult {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) {
    return { ok: false, answer: 'query.py が出力を返しませんでした', sources: [] };
  }
  try {
    const j = JSON.parse(trimmed) as {
      ok?: boolean;
      answer?: string;
      sources?: RagSource[];
    };
    if (j.ok === false) {
      return { ok: false, answer: j.answer ?? 'RAG 検索に失敗しました', sources: [] };
    }
    return {
      ok: true,
      answer: j.answer ?? '',
      sources: Array.isArray(j.sources) ? j.sources : [],
    };
  } catch (e) {
    return { ok: false, answer: `JSON parse error: ${(e as Error).message}`, sources: [] };
  }
}

/** Spawn query.py --json with --source filter, return parsed result. */
export async function runRagQuery(opts: {
  pythonPath: string;
  scriptPath: string;
  configPath: string;
  source: string;
  question: string;
}): Promise<RagQueryResult> {
  const run = await runPython({
    pythonPath: opts.pythonPath,
    scriptPath: opts.scriptPath,
    args: [
      opts.configPath,
      '--source',
      opts.source,
      '--ask',
      opts.question,
      '--json',
    ],
    cwd: path.dirname(opts.scriptPath),
    timeoutMs: 120_000,
  });
  if (run.exitCode !== 0) {
    return { ok: false, answer: parsePythonError(run), sources: [] };
  }
  const result = parseRagJsonOutput(run.stdout);
  if (!result.ok) {
    // タイムアウト / spawn 失敗時は stderr を優先して返す
    if (run.stderr) return { ok: false, answer: run.stderr.trim(), sources: [] };
  }
  return result;
}
