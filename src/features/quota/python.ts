import { spawn } from 'child_process';

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunPythonOptions {
  pythonPath: string;
  scriptPath: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

/** Python CLI を同期実行（タイムアウト付き・shell:false → インジェクション防止）。 */
export function runPython(opts: RunPythonOptions): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let child;
    try {
      child = spawn(opts.pythonPath, ['-u', opts.scriptPath, ...opts.args], {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}), PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        shell: false,
        windowsHide: true,
      });
    } catch (e) {
      resolve({ exitCode: -1, stdout: '', stderr: `spawn failed: ${(e as Error).message}` });
      return;
    }
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: stderr || `spawn error: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: killed ? -1 : code ?? -1, stdout, stderr });
    });
  });
}

/** stdout を JSON としてパース（絶対に throw しない）。 */
export function parseJsonOutput<T>(stdout: string):
  | { ok: true; data: T }
  | { ok: false; error: string; data: null } {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return { ok: false, error: 'empty stdout', data: null };
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}`, data: null };
  }
}
