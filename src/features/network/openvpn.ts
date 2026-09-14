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
import { spawn, execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, writeFileSync, unlinkSync, chmodSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { OpenVpnSettings, OpenVpnStatus, VpnRoute } from './types';
import type { RemoveStaleResult } from './types';

/** v0.44.0: 自前プロセスの識別マーカー（auth 一時ファイル名の接頭辞） */
const AUTH_FILE_PREFIX = 'cb-openvpn-auth-';
/** v0.44.0: --writepid で書き出す PID ファイル */
const PID_FILE_PATH = `${tmpdir()}/cb-openvpn.pid`;

/**
 * v0.44.0: 前回セッションで残った自前の openvpn.exe を回収してアダプタを解放する。
 *
 * Obsidian がクラッシュ/強制終了すると onunload の stop() が走らず、openvpn.exe が
 * 生き残って TAP アダプタを占有し続ける。その状態では新しい接続が
 * 「All tap-windows6 adapters on this system are currently in use」で必ず失敗する。
 *
 * 回収対象は **本プラグインが起動したものだけ**（auth 一時ファイルの接頭辞で照合）に
 * 限定し、OpenVPN GUI 等の外部接続は触らない。
 *
 * @returns 何かしらの回収・掃除を行った場合 true
 */
export function reapOrphanOpenVpn(): boolean {
  let reaped = false;

  // 1) --writepid の PID ファイル（本バージョン以降が残した場合の主経路）
  try {
    if (existsSync(PID_FILE_PATH)) {
      const pid = Number.parseInt(readFileSync(PID_FILE_PATH, 'utf-8').trim(), 10);
      if (Number.isFinite(pid) && pid > 0 && isOpenVpnProcess(pid)) {
        killProcess(pid);
        reaped = true;
      }
      try { unlinkSync(PID_FILE_PATH); } catch { /* ignore */ }
    }
  } catch { /* best-effort */ }

  // 2) コマンドラインのマーカー照合（旧バージョンが残した孤児も回収）
  try {
    for (const pid of findOwnedOpenVpnPids()) {
      killProcess(pid);
      reaped = true;
    }
  } catch { /* best-effort */ }

  // 3) 古い auth 一時ファイルの掃除（認証情報の残留を避ける）
  try {
    const dir = tmpdir();
    for (const name of readdirSync(dir)) {
      if (name.startsWith(AUTH_FILE_PREFIX)) {
        try { unlinkSync(`${dir}/${name}`); } catch { /* ignore */ }
      }
    }
  } catch { /* best-effort */ }

  return reaped;
}

/** v0.44.0: 指定 PID が openvpn プロセスか（PID 再利用による誤殺を防ぐ） */
function isOpenVpnProcess(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return /openvpn\.exe/i.test(out);
    }
    const out = execSync(`ps -p ${pid} -o comm=`, {
      encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /openvpn/i.test(out);
  } catch {
    return false;
  }
}

/** v0.44.0: マーカー付き（= 本プラグイン起動）の openvpn PID 一覧 */
function findOwnedOpenVpnPids(): number[] {
  const pids: number[] = [];

  if (process.platform === 'win32') {
    // ネストした引用符を避けるため一時 .ps1 を書き出して実行する
    const scriptPath = `${tmpdir()}/cb-openvpn-probe.ps1`;
    writeFileSync(
      scriptPath,
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'openvpn.exe' } | ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }\n",
      'utf-8',
    );
    try {
      const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
        encoding: 'utf-8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(AUTH_FILE_PREFIX)) continue;
        const m = line.match(/^(\d+)\|/);
        if (m) pids.push(Number(m[1]));
      }
    } finally {
      try { unlinkSync(scriptPath); } catch { /* ignore */ }
    }
    return pids;
  }

  const out = execSync('ps -eo pid,args', {
    encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
  });
  for (const line of out.split('\n')) {
    if (!line.includes(AUTH_FILE_PREFIX)) continue;
    const m = line.trim().match(/^(\d+)/);
    if (m) pids.push(Number(m[1]));
  }
  return pids;
}

/** v0.44.0: PID を強制終了する */
function killProcess(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 5000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch { /* 既に死んでいる場合は無視 */ }
}

export interface OpenVpnController {
  start(settings: OpenVpnSettings): Promise<void>;
  stop(): Promise<void>;
  getStatus(): OpenVpnStatus;
  getRecentLog(): string;
  /** 直近のエラーメッセージ。status が 'error' の間のみ有効。 */
  getLastError(): string | null;
  /**
   * v0.44.1: 接続は確立したが経路が入っていない場合などの警告。
   * status が 'connected' のままでも実用できない状態を可視化するために使う。
   */
  getWarning(): string | null;
  subscribe(listener: (status: OpenVpnStatus, log: string) => void): () => void;
  /** v0.43.6: OS ルーティングまたは TUN アダプタをスキャンして外部 VPN 接続を認識 */
  detectExternalConnection(): 'connected' | 'disconnected';
  /** F-046: 残骸経路（expectedGateway 以外の VPN 関連ルート）を削除する */
  removeStaleRoutes(): Promise<RemoveStaleResult>;
}

const RECENT_LOG_MAX = 2000;
const STOP_TIMEOUT_MS = 5000;
/** v0.44.1: 初期化完了後、経路が確定するまで待ってから検証する時間 */
const ROUTE_CHECK_DELAY_MS = 2500;
/** v0.45.0: 経路が 1 本も入っていない場合の警告文 */
const ROUTE_MISSING_MESSAGE =
  'VPN 経路が確立できませんでした（管理者権限不足の可能性があります）。'
  + 'Obsidian を管理者として実行してから再接続してください。';

class OpenVpnControllerImpl implements OpenVpnController {
  private status: OpenVpnStatus = 'disconnected';
  private process: ChildProcess | null = null;
  private authFilePath: string | null = null;
  private recentLog: string[] = [];
  private emitter = new EventEmitter();
  private lastError: string | null = null;
  /** v0.44.1: 接続済みだが実用できない状態の警告 */
  private warning: string | null = null;
  /** v0.44.1: 経路検証タイマー */
  private routeCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** v0.45.0: openvpn ログの DHCP-serv = このセッションの正しいトンネル相手 */
  private expectedGateway: string | null = null;
  private stopRequested = false;
  /** In-flight start() の Promise（並行呼び出しの race 回避用） */
  private startPromise: Promise<void> | null = null;
  private startResolvers: Array<() => void> = [];

  getStatus(): OpenVpnStatus { return this.status; }
  getRecentLog(): string { return this.recentLog.join(''); }
  getLastError(): string | null { return this.lastError; }
  getWarning(): string | null { return this.warning; }

  /**
   * v0.44.1: 「Initialization Sequence Completed」直後は route 追加がまだ確定していない
   * ため、少し待ってから経路を検証する。
   */
  private scheduleRouteVerification(): void {
    // 経路検証は Windows の route print に依存するため Windows のみ
    if (process.platform !== 'win32') return;
    if (this.routeCheckTimer !== null) clearTimeout(this.routeCheckTimer);
    this.routeCheckTimer = setTimeout(() => {
      this.routeCheckTimer = null;
      this.verifyRoutes();
    }, ROUTE_CHECK_DELAY_MS);
    const t = this.routeCheckTimer as unknown as { unref?: () => void };
    t.unref?.();
  }

  /**
   * v0.44.1: 接続は確立したが VPN 経路が入っていない状態を検出して警告する。
   * 非管理者で route 追加が拒否されると 🟢 表示のまま LAN に到達できない。
   */
  private verifyRoutes(): void {
    if (this.status !== 'connected') return;

    const gateways = this.getVpnRouteGateways();
    if (gateways === null) return; // route print が取れない環境は判定しない

    const expected = this.expectedGateway;
    if (!expected) {
      // 期待ゲートウェイ不明（ログ未取得）: 経路の有無のみで判定
      this.setWarning(gateways.length > 0 ? null : ROUTE_MISSING_MESSAGE);
      return;
    }

    const hasExpected = gateways.includes(expected);
    const stale = gateways.filter((g) => g !== expected);

    if (!hasExpected) {
      this.setWarning(
        stale.length > 0
          ? `VPN 経路が確立できませんでした（管理者権限不足）。`
            + `さらに過去セッションの残骸経路（${stale.join(' / ')}）が残っており通信が妨げられます。`
            + `管理者として実行し、残骸経路を削除してから再接続してください。`
          : ROUTE_MISSING_MESSAGE,
      );
      return;
    }

    // 正常に経路が入っていても、死んだセッションの経路が混在していれば警告する
    this.setWarning(
      stale.length > 0
        ? `過去セッションの残骸経路が残っています（${stale.join(' / ')}）。`
          + `通信が不安定になるため、管理者権限で削除するか PC を再起動してください。`
        : null,
    );
  }

  /**
   * v0.45.0: route print から VPN 関連経路のゲートウェイ一覧を抽出する。
   * 対象は redirect-gateway の 0.0.0.0/1・128.0.0.0/1 と 10.8.0.0/8 宛の経路。
   * 判定不能（route print 失敗）なら null。
   */
  private getVpnRouteGateways(): string[] | null {
    try {
      const out = execSync('route print -4', {
        encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const gws = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(
          /^\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\.\d+\.\d+\.\d+\s+\d+\s*$/,
        );
        if (!m) continue;
        const [, dest, mask, gateway] = m;
        const isVpnDest =
          (dest === '0.0.0.0' && mask === '128.0.0.0')
          || (dest === '128.0.0.0' && mask === '128.0.0.0')
          || dest.startsWith('10.8.');
        if (isVpnDest) gws.add(gateway);
      }
      return [...gws];
    } catch {
      return null;
    }
  }

  /**
   * F-046: VPN 関連ルートの dest/mask/gateway 3-tuple を抽出する。
   * v0.45.0 の getVpnRouteGateways() を拡張し、dest/mask 情報を保持する。
   * 判定不能（route print 失敗）なら null。
   */
  private getVpnRoutes(): VpnRoute[] | null {
    try {
      const out = execSync('route print -4', {
        encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const routes: VpnRoute[] = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(
          /^\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\.\d+\.\d+\.\d+\s+\d+\s*$/,
        );
        if (!m) continue;
        const [, dest, mask, gateway] = m;
        const isVpnDest =
          (dest === '0.0.0.0' && mask === '128.0.0.0')
          || (dest === '128.0.0.0' && mask === '128.0.0.0')
          || dest.startsWith('10.8.');
        if (isVpnDest) routes.push({ dest, mask, gateway });
      }
      return routes;
    } catch {
      return null;
    }
  }

  /** Test-only escape hatch for getVpnRoutes(). */
  public getVpnRoutesForTest(): VpnRoute[] | null {
    return this.getVpnRoutes();
  }

  /**
   * F-046: expectedGateway と異なるゲートウェイを持つルートを stale として返す。
   * expectedGateway が null の場合は全 VPN ルートを stale 扱い（安全側）。
   */
  private findStaleRoutes(routes: VpnRoute[], expectedGateway: string | null): VpnRoute[] {
    if (expectedGateway === null) return [...routes];
    return routes.filter((r) => r.gateway !== expectedGateway);
  }

  /** Test-only escape hatch for findStaleRoutes(). */
  public findStaleRoutesForTest(routes: VpnRoute[], expectedGateway: string | null): VpnRoute[] {
    return this.findStaleRoutes(routes, expectedGateway);
  }

  /**
   * F-046: プロセスが管理者として実行されているか判定する。
   * 失敗確実な route delete コマンドを試し打ちし、stderr で判定する。
   * - exit 0 → 管理者
   * - stderr に "ERROR_ACCESS_DENIED" → 非管理者
   */
  private isRunningAsAdmin(): boolean {
    try {
      execSync('route delete 0.0.0.0 mask 128.0.0.0 10.255.255.255', {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000,
      });
      return true;
    } catch (e) {
      const stderr = (e as { stderr?: Buffer | string }).stderr;
      const text = stderr ? (typeof stderr === 'string' ? stderr : stderr.toString()) : '';
      if (text.includes('ERROR_ACCESS_DENIED')) return false;
      return false; // その他のエラーも安全側に倒して非管理者扱い
    }
  }

  /** Test-only escape hatch for isRunningAsAdmin(). */
  public isRunningAsAdminForTest(): boolean {
    return this.isRunningAsAdmin();
  }

  /**
   * F-046: 残骸経路を削除する（公開 API）。
   * 1. isRunningAsAdmin() で管理者判定
   * 2. getVpnRoutes() で VPN ルート取得
   * 3. findStaleRoutes() で expectedGateway 以外を抽出
   * 4. 各 stale ルートに対し route delete を実行
   * 5. 結果を RemoveStaleResult で返す
   */
  public async removeStaleRoutes(): Promise<RemoveStaleResult> {
    if (!this.isRunningAsAdmin()) {
      return { ok: false, reason: 'need-admin', detail: 'Obsidian を管理者として再起動してください' };
    }

    const routes = this.getVpnRoutes();
    if (routes === null) {
      return { ok: false, reason: 'no-routes', detail: 'route print に失敗しました' };
    }

    const stale = this.findStaleRoutes(routes, this.expectedGateway);
    if (stale.length === 0) {
      return { ok: true, removed: 0, failed: [] };
    }

    let removed = 0;
    const failed: string[] = [];
    for (const r of stale) {
      try {
        execSync(`route delete ${r.dest} mask ${r.mask} ${r.gateway}`, {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 3000,
        });
        removed++;
      } catch (e) {
        failed.push(`${r.dest}/${r.mask} via ${r.gateway}`);
      }
    }

    // 削除後に警告を再評価
    this.verifyRoutes();

    return { ok: true, removed, failed };
  }

  /** Test-only escape hatch for removeStaleRoutes(). */
  public async removeStaleRoutesForTest(): Promise<RemoveStaleResult> {
    return this.removeStaleRoutes();
  }

  /** Test-only escape hatch for setting expectedGateway. */
  public setExpectedGatewayForTest(gw: string | null): void {
    this.expectedGateway = gw;
  }

  private setWarning(next: string | null): void {
    if (this.warning === next) return;
    this.warning = next;
    this.emitter.emit('change', this.status, this.getRecentLog());
  }

  private clearRouteCheck(): void {
    if (this.routeCheckTimer !== null) {
      clearTimeout(this.routeCheckTimer);
      this.routeCheckTimer = null;
    }
  }

  /** v0.43.6: OS ルーティングまたは TUN/TAP アダプタをスキャンして外部 VPN 接続を認識 */
  detectExternalConnection(): 'connected' | 'disconnected' {
    try {
      // Windows: route print で 10.8.0.0/24 経路があれば VPN 接続中とみなす
      const routeOut = execSync('route print -4', { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
      if (/10\.8\.0\.\d+\s+255\.255\.255\.\d+\s+On-link/.test(routeOut)) return 'connected';
      // フォールバック: ipconfig で tun/TAP アダプタ検出
      const ipOut = execSync('ipconfig /all', { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
      if (/tun\d+|OpenVPN Data Channel Offload|TAP-Windows Adapter/i.test(ipOut)) return 'connected';
    } catch { /* best-effort detection */ }
    return 'disconnected';
  }
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

    // v0.44.0: 前回セッションの孤児プロセスが TAP アダプタを占有していると
    // 新規接続が必ず失敗するため、まず回収してアダプタを解放する
    // （この時点で自前プロセスは存在しない = status が connected/connecting なら上で return 済み）
    reapOrphanOpenVpn();

    // バリデーション（状態変更前に同期 throw）
    if (!settings.configPath) throw new Error('configPath が未設定です');
    if (!existsSync(settings.configPath)) {
      throw new Error(`configPath が見つかりません: ${settings.configPath}`);
    }

    // v0.43.4: 空欄時の既定バイナリ（Windows は OpenVPN Community の標準インストール先）
    const defaultBinary = process.platform === 'win32'
      ? 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe'
      : 'openvpn';
    const binary = settings.openvpnBinaryPath || defaultBinary;
    const args: string[] = ['--config', settings.configPath, '--mute-replay-warnings'];

    // v0.43.2 (F-044): Server Override — CLI 引数は config ファイルの remote より優先される
    if (settings.serverOverride) {
      const [host, port] = settings.serverOverride.split(':');
      args.push('--remote', host, port || '1194');
    }

    if (settings.username || settings.password) {
      this.authFilePath = `${tmpdir()}/${AUTH_FILE_PREFIX}${randomUUID()}`;
      writeFileSync(
        this.authFilePath,
        `${settings.username}\n${settings.password}\n`,
        { mode: 0o600 },
      );
      try { chmodSync(this.authFilePath, 0o600); } catch { /* Windows: ACL は OS 任せ */ }
      args.push('--auth-user-pass', this.authFilePath);
    }

    // v0.44.0: PID を記録し、次回起動時に孤児プロセスを回収できるようにする
    args.push('--writepid', PID_FILE_PATH);

    this.lastError = null;
    this.warning = null;
    this.expectedGateway = null;
    this.stopRequested = false;
    this.clearRouteCheck();

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
      this.cleanupRuntimeFiles();
      this.setStatus('error');
      throw err;
    }

    // CRITICAL fix #2: spawn 由来の非同期エラー（ENOENT 等）を
    // 'error' イベントで受け取る。リスナー未登録だと Node がクラッシュする。
    this.process.on('error', (err) => {
      this.lastError = err.message;
      this.appendLog(`spawn error: ${err.message}\n`);
      this.cleanupRuntimeFiles();
      this.setStatus('error');
    });

    // v0.43.3 (F-044 対策): Windows 版 openvpn 2.7.x はログを **stdout** に
    // 出力する（WSL/Linux 版は stderr）。両ストリームを同一ハンドラで監視しないと
    // Windows で「Initialization Sequence Completed」を検出できず
    // 接続成功しても 🟡 connecting のまま止まる。
    const handleStreamChunk = (chunk: Buffer): void => {
      const text = chunk.toString();
      this.appendLog(text);
      // v0.45.0: 「[DHCP-serv: 10.8.0.13, ...]」からこのセッションの正しいトンネル相手を記録する
      const dhcp = text.match(/DHCP-serv:\s*([0-9.]+)/);
      if (dhcp) this.expectedGateway = dhcp[1];

      if (text.includes('Initialization Sequence Completed')) {
        this.setStatus('connected');
        // v0.44.1: 初期化完了直後に経路を検証する。
        // 非管理者環境では route addition が「アクセス拒否」で失敗しても
        // Initialization Sequence Completed は出るため、🟢 表示でも実用不可な状態になる。
        this.scheduleRouteVerification();
      } else if (
        // v0.44.0: TAP アダプタを確保できない（他クライアントが占有 / サービス不通）
        text.includes('currently in use or disabled') ||
        text.includes('could not talk to service')
      ) {
        this.lastError =
          'OpenVPN アダプタを確保できません（他の OpenVPN クライアントが使用中か、'
          + '管理者権限/interactive service が不足しています）';
        this.appendLog(`${this.lastError}\n`);
        try { this.process?.kill(); } catch { /* 既に死んでいる場合は無視 */ }
        this.setStatus('error');
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
    };
    this.process.stderr?.on('data', handleStreamChunk);
    this.process.stdout?.on('data', handleStreamChunk);

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
      this.cleanupRuntimeFiles();
    });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.clearRouteCheck();
    this.warning = null;
    if (!this.process) {
      this.cleanupRuntimeFiles();
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
      // v0.44.2: Obsidian（ブラウザ環境）の setTimeout は数値を返すため unref が無い。
      // Node 環境の Timeout のみ unref を持つので optional 呼び出しにする。
      const stopTimer = setTimeout(done, STOP_TIMEOUT_MS) as unknown as { unref?: () => void };
      stopTimer.unref?.();
    });
    // status 更新は 'exit' ハンドラに任せる（stopRequested=true で
    // disconnected に遷移する）。
  }

  /** v0.44.0: 認証一時ファイルと PID ファイルを削除する（孤児化の痕跡を残さない） */
  private cleanupRuntimeFiles(): void {
    if (this.authFilePath) {
      try { unlinkSync(this.authFilePath); } catch { /* ignore */ }
      this.authFilePath = null;
    }
    try { unlinkSync(PID_FILE_PATH); } catch { /* ignore */ }
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