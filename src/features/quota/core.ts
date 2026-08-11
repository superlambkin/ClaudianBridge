import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { Platform } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { createIdleSnapshot, type QuotaSnapshot } from './types';

export interface ClaudeQuotaServiceOptions {
  app: App;
  store: ConfigStore;
  refreshSec: number;
}

export class ClaudeQuotaService {
  private snapshot: QuotaSnapshot = createIdleSnapshot();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(snap: QuotaSnapshot) => void> = new Set();
  private inFlight = false;

  constructor(private readonly opts: ClaudeQuotaServiceOptions) {}

  /** Token 読み取り（macOS Keychain 優先 → ファイル fallback → null） */
  async readToken(): Promise<string | null> {
    if (Platform.isMobile) return null;
    try {
      if (process.platform === 'darwin') {
        const macToken = await this.readFromKeychain();
        if (macToken) {
          this.snapshot.tokenSource = 'keychain';
          return macToken;
        }
      }
    } catch {
      // Keychain 失敗 → ファイルに fallback
    }
    try {
      const fileToken = await this.readFromFile();
      if (fileToken) {
        this.snapshot.tokenSource = 'file';
        return fileToken;
      }
    } catch {
      // ファイル不存在
    }
    this.snapshot.tokenSource = 'none';
    return null;
  }

  private async readFromKeychain(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const proc = spawn('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`keychain exit ${code}`));
        try {
          const json = JSON.parse(stdout.trim()) as Record<string, Record<string, unknown>>;
          const oauth = json?.claudeAiOauth ?? json?.['claude.ai_oauth'];
          const token = (oauth as { accessToken?: unknown })?.accessToken;
          resolve(typeof token === 'string' ? token : null);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }

  private async readFromFile(): Promise<string | null> {
    const home = os.homedir();
    const credPath = path.join(home, '.claude', '.credentials.json');
    const raw = await fs.readFile(credPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const oauth = json?.claudeAiOauth ?? json?.['claude.ai_oauth'];
    const token = (oauth as { accessToken?: unknown })?.accessToken;
    return typeof token === 'string' ? token : null;
  }

  // --- 以下は Task 5-6 で実装するスタブ ---
  start(): Promise<void> { return Promise.resolve(); }
  stop(): Promise<void> { return Promise.resolve(); }
  forceRefresh(): Promise<QuotaSnapshot> { return Promise.resolve(this.snapshot); }
  getSnapshot(): QuotaSnapshot { return this.snapshot; }
  onUpdate(_cb: (snap: QuotaSnapshot) => void): () => void { return () => {}; }
}

let _instance: ClaudeQuotaService | null = null;
export function getClaudeQuotaService(): ClaudeQuotaService | null { return _instance; }
