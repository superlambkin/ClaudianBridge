import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface MarkItDownResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ResolvedPython {
  cmd: string;
  useShell: boolean;
}

const SCRIPT_VAULT_REL = '00_Vault管理/_設定ファイル/_scripts/_run_markitdown.py';

const PY_UTF8_ENV = {
  ...process.env,
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
};

export function spawnPython(resolved: ResolvedPython, args: string[], cwd: string): ChildProcess {
  if (resolved.useShell) {
    const cmdLine = [resolved.cmd, ...args].map((a) => `"${a}"`).join(' ');
    return spawn(cmdLine, [], { cwd, shell: true, env: PY_UTF8_ENV });
  }
  return spawn(resolved.cmd, args, { cwd, env: PY_UTF8_ENV });
}

export class MarkItDownRunner {
  static async probePython(cmd: string, useShell = false): Promise<boolean> {
    return new Promise((resolve) => {
      let proc: ChildProcess;
      try {
        proc = useShell ? spawn(`"${cmd}" -V`, [], { shell: true }) : spawn(cmd, ['-V']);
      } catch {
        resolve(false);
        return;
      }
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => resolve(code === 0));
    });
  }

  static windowsPythonCandidates(): string[] {
    const found: { ver: number; p: string }[] = [];
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const root = path.join(localAppData, 'Programs', 'Python');
      try {
        for (const entry of fs.readdirSync(root)) {
          const m = /^Python3(\d+)$/i.exec(entry);
          if (m) found.push({ ver: parseInt(m[1], 10), p: path.join(root, entry, 'python.exe') });
        }
      } catch { /* no per-user Python installs */ }
    }
    found.sort((a, b) => b.ver - a.ver);
    const abs = found.map((f) => f.p);
    if (localAppData) abs.push(path.join(localAppData, 'Programs', 'Python', 'Launcher', 'py.exe'));
    abs.push('C:\\Windows\\py.exe');
    return abs;
  }

  static async resolvePython(pythonPath: string): Promise<ResolvedPython | null> {
    const isWin = process.platform === 'win32';
    if (path.isAbsolute(pythonPath)) {
      return (await MarkItDownRunner.probePython(pythonPath)) ? { cmd: pythonPath, useShell: false } : null;
    }
    const bareCandidates = isWin ? [pythonPath, 'py', 'python', 'python3'] : [pythonPath, 'python3', 'python'];
    const tried = new Set<string>();
    for (const name of bareCandidates) {
      if (tried.has(name)) continue;
      tried.add(name);
      if (await MarkItDownRunner.probePython(name, isWin)) return { cmd: name, useShell: isWin };
    }
    if (isWin) {
      for (const abs of MarkItDownRunner.windowsPythonCandidates()) {
        if (await MarkItDownRunner.probePython(abs)) return { cmd: abs, useShell: false };
      }
    }
    return null;
  }

  static async run(srcAbs: string, settings: { pythonPath: string }, vaultRoot: string): Promise<MarkItDownResult> {
    const scriptAbs = path.join(vaultRoot, SCRIPT_VAULT_REL);
    if (!fs.existsSync(scriptAbs)) {
      return {
        exitCode: 127,
        stdout: '',
        stderr: `[claudian-bridge] helper script not found:\n  ${scriptAbs}\nExpected at: <vault>/${SCRIPT_VAULT_REL}`,
      };
    }
    const resolved = await MarkItDownRunner.resolvePython(settings.pythonPath);
    if (!resolved) {
      return {
        exitCode: 127,
        stdout: '',
        stderr: `[claudian-bridge] Python interpreter not found.\nConfigured: "${settings.pythonPath}"\nFix: 設定 → ファイル変換 → Python Path にフルパスを設定`,
      };
    }
    return new Promise((resolve) => {
      const cwd = path.dirname(scriptAbs);
      const proc = spawnPython(resolved, [scriptAbs, srcAbs], cwd);
      let stdout = '';
      let stderr = '';
      proc.stdout!.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
      proc.stderr!.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
      proc.on('error', (err: NodeJS.ErrnoException) => {
        resolve({ exitCode: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: `[claudian-bridge] spawn failed: ${err.message}\nTried: ${resolved.cmd}` });
      });
      proc.on('exit', (code) => {
        try {
          const env = JSON.parse(stdout) as { exitCode?: unknown; stdout?: unknown; stderr?: unknown };
          if (env && typeof env === 'object' && 'exitCode' in env) {
            resolve({
              exitCode: typeof env.exitCode === 'number' ? env.exitCode : code ?? -1,
              stdout: typeof env.stdout === 'string' ? env.stdout : '',
              stderr: typeof env.stderr === 'string' && env.stderr.length > 0 ? env.stderr : stderr,
            });
            return;
          }
        } catch { /* not an envelope */ }
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
    });
  }
}
