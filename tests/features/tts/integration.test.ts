import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * commands.py speak の実起動統合テスト。
 *
 * claudian-bridge 本体と同じ呼び出し方（stdin にテキストを書き込む）で
 * `python commands.py speak` を実行し、音声合成が成功することを検証する。
 * 実環境依存（edge-tts のネットワーク + 再生）のため:
 * - デフォルトはスキップ（opt-in）。`RUN_INTEGRATION=1` の時のみ実 TTS を起動
 * - Python / commands.py が無ければスキップ
 */
const commandsPy = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');
const pythonBin = 'python';

const shouldSkip =
  process.env.RUN_INTEGRATION !== '1' || !fs.existsSync(commandsPy);

interface SpeakResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runSpeak(text: string, timeoutMs = 30_000): Promise<SpeakResult> {
  return new Promise<SpeakResult>((resolve, reject) => {
    const child = spawn(pythonBin, [commandsPy, 'speak'], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`integration test timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

describe.skipIf(shouldSkip)('commands.py speak (integration)', () => {
  it('実 TTS 起動: exit 0 かつ stderr に usage/failed なし（日本語 UTF-8）', async () => {
    // 日本語 UTF-8 で検証: stdin の誤デコードがあると edge-tts が失敗し
    // stderr に "engine ... failed" が出て、非 Edge 音声にフォールバックする
    const result = await runSpeak('こんにちは、元気ですか');
    expect(result.code).toBe(0);
    expect(result.stderr).not.toMatch(/使い方|usage|failed|UnicodeEncodeError/i);
  }, 35_000);
});
