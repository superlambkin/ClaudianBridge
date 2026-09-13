/**
 * OpenVPN CLI プロセス管理。
 * v0.43.0 (F-041): ネットワークタブ・OpenVPN 接続機能で追加。
 *
 * F-041 review fixes:
 *  - Critical: stderr 'data' ハンドラ内で throw しない（Node クラッシュ回避）
 *  - Critical: spawn 直後に 'error' リスナーを登録（ENOENT/EACCES を捕捉）
 *  - Important: 並行 ensureVpnConnected() 呼び出しで同一 Promise を共有
 *  - Important: stop() はプロセス終了を await してから status を確定
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
  /** 直近のエラーメッセージ。status が 'error' の間のみ有効。 */
  getLastError(): string | null;
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void;
}

const RECENT_LOG_MAX = 2000;
const STOP_TIMEOUT_MS = 5000;

class OpenVpnControllerImpl implements OpenVpnController {
  private status: OpenVpnStatus = 'disconnected';
  private process: ChildProcess | null = null;
  private authFilePath: string | null = null;
  private recentLog: string[] = [];
  private emitter = new EventEmitter();
  private lastError: string | null = null;
  private stopRequested = false;
  /** In-flight start() の Promise（並行呼び出しの race 回避用） */
  private startPromise: Promise<void> | null = null;
  private startResolvers: Array<() => void> = [];

  getStatus(): OpenVpnStatus { return this.status; }
  getRecentLog(): string { return this.recentLog.join(''); }
  getLastError(): string | null { return this.lastError; }
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  private setStatus(next: OpenVpnStatus): void {
    const wasConnecting = this.status === 'connecting';
    this.status = next;
    this.emitter.emit('change', next, this.getRecentLog());
    // 'connecting' から離脱した瞬間に start() 待機 Promise を解決する
    if (wasConnecting && next !== 'connecting' && this.startResolvers.length > 0) {
      const resolvers = this.startResolvers;
      this.startResolvers = [];
      this.startPromise = null;
      for (const r of resolvers) r();
    }
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
    // 並行呼び出し対策: 既に in-flight なら同じ Promise を返す
    if (this.startPromise) return this.startPromise;

    // F-041 review fix #6: 既に connected なら新規 spawn しない（直接呼び出し時の多重起動防止）
    if (this.status === 'connected') return;

    // 'connecting' 状態の二重ガード: startPromise 設定前に status が変わった場合に備える
    if (this.status === 'connecting' && this.startPromise) return this.startPromise;

    // バリデーション（状態変更前に同期 throw）
    if (!settings.configPath) throw new Error('configPath が未設定です');
    if (!existsSync(settings.configPath)) {
      throw new Error(`configPath が見つかりません: ${settings.configPath}`);
    }

    const binary = settings.openvpnBinaryPath || 'openvpn';
    const args: string[] = ['--config', settings.configPath, '--mute-replay-warnings'];

    // v0.43.2 (F-044): Server Override — CLI 引数は config ファイルの remote より優先される
    if (settings.serverOverride) {
      const [host, port] = settings.serverOverride.split(':');
      args.push('--remote', host, port || '1194');
    }

    if (settings.username || settings.password) {
      this.authFilePath = `${tmpdir()}/cb-openvpn-auth-${randomUUID()}`;
      writeFileSync(
        this.authFilePath,
        `${settings.username}\n${settings.password}\n`,
        { mode: 0o600 },
      );
      try { chmodSync(this.authFilePath, 0o600); } catch { /* Windows: ACL は OS 任せ */ }
      args.push('--auth-user-pass', this.authFilePath);
    }

    this.lastError = null;
    this.stopRequested = false;

    // In-flight Promise を status 変更前に確立（後続呼び出しが同期的に拾える）
    this.startPromise = new Promise<void>((resolve) => {
      this.startResolvers.push(resolve);
    });

    this.setStatus('connecting');

    try {
      this.process = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      // spawn 同期失敗 (e.g. EACCES, 引数エラー)
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      this.appendLog(`spawn error: ${message}\n`);
      this.cleanupAuthFile();
      this.setStatus('error');
      throw err;
    }

    // CRITICAL fix #2: spawn 由来の非同期エラー（ENOENT 等）を
    // 'error' イベントで受け取る。リスナー未登録だと Node がクラッシュする。
    this.process.on('error', (err) => {
      this.lastError = err.message;
      this.appendLog(`spawn error: ${err.message}\n`);
      this.cleanupAuthFile();
      this.setStatus('error');
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.appendLog(text);
      if (text.includes('Initialization Sequence Completed')) {
        this.setStatus('connected');
      } else if (text.includes('AUTH_FAILED') || text.includes('TLS Error')) {
        // CRITICAL fix #1: 非同期イベントリスナ内で throw しない。
        // Node は 'error' リスナー不在のまま例外を投げられ、
        // 未処理 'error' イベントでプロセスごとクラッシュする。
        // 失敗は status='error' + lastError で表現し、start() 待機側は
        // setStatus のリゾルバ解放で完了通知を受け取る。
        const firstLine = text.split('\n')[0];
        this.lastError = `OpenVPN エラー: ${firstLine}`;
        this.appendLog(`${this.lastError}\n`);
        try { this.process?.kill(); } catch { /* 既に死んでいる場合は無視 */ }
        this.setStatus('error');
      }
    });

    this.process.on('exit', (code) => {
      if (this.stopRequested) {
        this.setStatus('disconnected');
      } else if (code === 0) {
        this.setStatus('disconnected');
      } else if (this.status !== 'error') {
        this.lastError = `OpenVPN exited with code ${code ?? 'null'}`;
        this.setStatus('error');
      }
      this.process = null;
      this.cleanupAuthFile();
    });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (!this.process) {
      this.cleanupAuthFile();
      if (this.status !== 'disconnected') this.setStatus('disconnected');
      return;
    }
    this.stopRequested = true;
    const proc = this.process;

    // IMPORTANT fix #4: kill は fire-and-forget なので 'exit' を待ってから戻る。
    // こうしないと stop() が即座に status='disconnected' を立て、
    // 後から 'exit' が走って code !== 0 のときに status='error' に
    // 戻ってしまい、購読側で flicker する。
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      proc.once('exit', done);
      try {
        proc.kill();
      } catch {
        done();
      }
      // 'exit' が既に発火済み（ゾンビ状態）場合の安全網
      setImmediate(done);
      // さらに念のためタイムアウト
      setTimeout(done, STOP_TIMEOUT_MS).unref();
    });
    // status 更新は 'exit' ハンドラに任せる（stopRequested=true で
    // disconnected に遷移する）。
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

export async function ensureVpnConnected(settings: OpenVpnSettings): Promise<void> {
  if (!settings.enabled || !settings.autoConnectOnLlm) return;
  const c = getOpenVpnController();
  const status = c.getStatus();
  if (status === 'connected') return;
  // status === 'connecting' のケースは start() 内の in-flight Promise 共有で処理される
  // (status === 'disconnected' / 'error' のケースでは新規 start() を発火する)
  await c.start(settings);
}