import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

type NoticeFn = (m: string) => void;

export interface TtsSettings {
  engine: 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax';
}

export async function claudettsHttpSpeak(text: string, _settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const cmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('python', [cmd, 'speak'], { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ClaudeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }
    let err = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      noticeFn(`⚠️ ClaudeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(true);
      else {
        noticeFn(`⚠️ ClaudeTTS 失敗 (exit ${code}): ${err.slice(0, 200)}`);
        resolve(false);
      }
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

export async function addTextToTTS(_app: App | null, text: string, settings: TtsSettings): Promise<boolean> {
  const noticeFn = (m: string) => new Notice(m);
  if (settings.engine === 'edge' || settings.engine === 'claudetts' || settings.engine === 'auto') {
    return claudettsHttpSpeak(text, settings, noticeFn);
  }
  noticeFn('⚠️ このエンジンは P2 で未実装（P3/P4 以降で対応）');
  return false;
}
