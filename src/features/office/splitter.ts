import * as path from 'path';
import { MarkItDownRunner, spawnPython } from './markitdown';

export interface SplitResult {
  exitCode: number;
  outputs: string[];
  stderr: string;
}

const SCRIPTS_VAULT_REL = '00_Vault管理/_設定ファイル/_scripts';

const SCRIPT_FOR_EXT: Record<string, string> = {
  docx: 'split_docx.py',
  xlsx: 'split_xlsx.py',
  pptx: 'split_pptx.py',
  pdf: 'split_pdf.py',
  html: 'split_html.py',
  htm: 'split_html.py',
  csv: 'split_csv.py',
};

export class SplitterRunner {
  static async split(
    ext: string,
    mdAbs: string,
    srcAbs: string,
    outDir: string,
    settings: { pythonPath: string },
    vaultRoot: string
  ): Promise<SplitResult> {
    const script = SCRIPT_FOR_EXT[ext.toLowerCase()];
    if (!script) {
      return { exitCode: 1, outputs: [], stderr: `unsupported extension: ${ext}` };
    }
    const scriptDir = path.join(vaultRoot, SCRIPTS_VAULT_REL);
    const resolved = await MarkItDownRunner.resolvePython(settings.pythonPath);
    if (!resolved) {
      return { exitCode: 127, outputs: [], stderr: `[claudian-bridge] Python interpreter not found (configured: "${settings.pythonPath}")` };
    }
    return new Promise((resolve) => {
      const proc = spawnPython(resolved, [path.join(scriptDir, script), mdAbs, srcAbs, outDir], scriptDir);
      let stdout = '';
      let stderr = '';
      proc.stdout!.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
      proc.stderr!.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
      proc.on('error', (err: NodeJS.ErrnoException) => {
        resolve({ exitCode: err.code === 'ENOENT' ? 127 : 1, outputs: [], stderr: `[claudian-bridge] spawn failed: ${err.message}\nTried: ${resolved.cmd}` });
      });
      proc.on('exit', (code) => {
        resolve({
          exitCode: code ?? -1,
          outputs: stdout.trim().split(/\r?\n/).filter((l) => l.trim().length > 0),
          stderr,
        });
      });
    });
  }
}
