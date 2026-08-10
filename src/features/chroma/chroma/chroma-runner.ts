// src/features/chroma/chroma/chroma-runner.ts — Spawn wrapper for the Python CLI.
//
// Key safety properties (matching vault-office-bridge patterns):
//   - shell:false + args as array  → no shell injection
//   - explicit timeout (kills the process tree if exceeded)
//   - returns { exitCode, stdout, stderr } for the caller to inspect
//   - parseJsonOutput<T>() safely handles malformed JSON

import { spawn } from "child_process";
import type { RunResult } from "../types";

export interface RunOptions {
  pythonPath: string;
  scriptPath: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  /** Extra env vars merged with process.env. */
  env?: Record<string, string>;
}

/** Run a Python CLI synchronously (caller awaits the promise). */
export function runPython(opts: RunOptions): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    let child;
    try {
      child = spawn(opts.pythonPath, ["-u", opts.scriptPath, ...opts.args], {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}), PYTHONIOENCODING: "utf-8" },
        shell: false,
        windowsHide: true,
      });
    } catch (e) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: `spawn failed: ${(e as Error).message}`,
      });
      return;
    }

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr || `spawn error: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = killed ? -1 : code ?? -1;
      resolve({ exitCode, stdout, stderr });
    });
  });
}

/**
 * Parse stdout as JSON; never throws.
 * Returns `{ ok:false, error, data:null }` on any parse failure.
 */
export function parseJsonOutput<T>(stdout: string):
  | { ok: true; data: T }
  | { ok: false; error: string; data: null } {
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "empty stdout", data: null };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}`, data: null };
  }
}

/** Build a human-friendly error message from a RunResult. */
export function parsePythonError(run: RunResult): string {
  if (run.exitCode === -1 && !run.stderr) {
    return "Python process was killed (timeout or spawn failure). Check that Python is on PATH.";
  }
  // Try JSON envelope on stdout first.
  const trimmed = (run.stdout ?? "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { error?: unknown; ok?: unknown };
      if (j && j.ok === false && typeof j.error === "string") {
        return j.error;
      }
    } catch {
      /* fall through */
    }
  }
  if (run.stderr) return run.stderr.trim();
  return `Python exited with code ${run.exitCode}`;
}

/** Specialized error thrown when semantic query fails due to embedding dimension mismatch. */
export class EmbeddingDimensionError extends Error {
  readonly gotDim?: number;
  readonly expectedDim?: number;
  constructor(message: string, gotDim?: number, expectedDim?: number) {
    super(message);
    this.name = "EmbeddingDimensionError";
    this.gotDim = gotDim;
    this.expectedDim = expectedDim;
  }
}

/**
 * Inspect a CLI error string for an embedding-dimension-mismatch signature.
 * Returns the error instance if matched, otherwise null.
 */
export function detectDimensionError(message: string): EmbeddingDimensionError | null {
  // Chroma's typical error: "Collection expecting embedding with dimension of 1024, got 384"
  const m = message.match(
    /dimension\s+of\s+(\d+).*?got\s+(\d+)/i
  );
  if (m) {
    return new EmbeddingDimensionError(
      `埋め込みモデルの次元数が一致しません（期待: ${m[1]}, 実際: ${m[2]}）`,
      Number(m[2]),
      Number(m[1])
    );
  }
  return null;
}
