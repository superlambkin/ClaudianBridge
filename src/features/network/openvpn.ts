/**
 * OpenVPN CLI プロセス管理。
 * v0.43.0 (F-041): ネットワークタブ・OpenVPN 接続機能で追加。
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { OpenVpnSettings, OpenVpnStatus } from './types';

export interface OpenVpnController {
  start(settings: OpenVpnSettings): Promise<void>;
  stop(): Promise<void>;
  getStatus(): OpenVpnStatus;
  getRecentLog(): string;
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void;
}

const RECENT_LOG_MAX = 2000;

class OpenVpnControllerImpl implements OpenVpnController {
  private status: OpenVpnStatus = 'disconnected';
  private process: ChildProcess | null = null;
  private authFilePath: string | null = null;
  private recentLog: string[] = [];
  private emitter = new EventEmitter();

  getStatus(): OpenVpnStatus { return this.status; }
  getRecentLog(): string { return this.recentLog.join(''); }
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  private setStatus(next: OpenVpnStatus): void {
    this.status = next;
    this.emitter.emit('change', next, this.getRecentLog());
  }

  private appendLog(chunk: string): void {
    this.recentLog.push(chunk);
    let total = this.recentLog.reduce((s, c) => s + c.length, 0);
    while (total > RECENT_LOG_MAX && this.recentLog.length > 1) {
      const removed = this.recentLog.shift();
      if (removed) total -= removed.length;
    }
    this.emitter.emit('change', this.status, this.getRecentLog());
  }

  async start(settings: OpenVpnSettings): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return;
    if (!settings.configPath) throw new Error('configPath が未設定です');
    if (!existsSync(settings.configPath)) throw new Error(`configPath が見つかりません: ${settings.configPath}`);

    const binary = settings.openvpnBinaryPath || 'openvpn';
    const args: string[] = ['--config', settings.configPath, '--mute-replay-warnings'];

    if (settings.username || settings.password) {
      this.authFilePath = `${tmpdir()}/cb-openvpn-auth-${randomUUID()}`;
      writeFileSync(this.authFilePath, `${settings.username}\n${settings.password}\n`, { mode: 0o600 });
      try { chmodSync(this.authFilePath, 0o600); } catch { /* Windows: ACL は OS 任せ */ }
      args.push('--auth-user-pass', this.authFilePath);
    }

    this.setStatus('connecting');
    this.process = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.appendLog(text);
      if (text.includes('Initialization Sequence Completed')) {
        this.setStatus('connected');
      } else if (text.includes('AUTH_FAILED') || text.includes('TLS Error')) {
        this.setStatus('error');
        this.process?.kill();
        throw new Error(`OpenVPN エラー: ${text.split('\n')[0]}`);
      }
    });

    this.process.on('exit', (code) => {
      if (code === 0) this.setStatus('disconnected');
      else if (this.status !== 'error') this.setStatus('error');
      this.process = null;
      this.cleanupAuthFile();
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.cleanupAuthFile();
    this.setStatus('disconnected');
  }

  private cleanupAuthFile(): void {
    if (this.authFilePath) {
      try { unlinkSync(this.authFilePath); } catch { /* ignore */ }
      this.authFilePath = null;
    }
  }
}

let controller: OpenVpnController | null = null;
export function getOpenVpnController(): OpenVpnController {
  if (!controller) controller = new OpenVpnControllerImpl();
  return controller;
}

let connectPromise: Promise<void> | null = null;

export async function ensureVpnConnected(settings: OpenVpnSettings): Promise<void> {
  if (!settings.enabled || !settings.autoConnectOnLlm) return;
  const c = getOpenVpnController();
  const status = c.getStatus();
  if (status === 'connected') return;
  if (status === 'connecting' && connectPromise) return connectPromise;
  connectPromise = c.start(settings).finally(() => { connectPromise = null; });
  await connectPromise;
}
