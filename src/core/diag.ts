/**
 * 起動時診断ログ（debug.load.log）
 *
 * プラグイン読み込み失敗の原因特定用。モジュールロード時から
 * onload の各ステップ・全エラーをファイルに記録する。
 * 問題解決後は main.ts の呼び出しを削除して無効化できる。
 */
import * as fs from 'fs';
import * as path from 'path';

let logPath: string | null = null;
let enabled = false;

/** ログファイルのパスを決定（プラグインディレクトリ直下） */
export function initDiag(pluginDir: string): void {
  try {
    logPath = path.join(pluginDir, 'debug.load.log');
    const header = `=== claudian-bridge load diag ${new Date().toISOString()} ===\n`;
    fs.writeFileSync(logPath, header, 'utf-8');
    enabled = true;
    diag('diag initialized', { pluginDir, cwd: process.cwd(), platform: process.platform });
  } catch (e) {
    // ログ自体が書けない環境では静かに失敗
    enabled = false;
  }
}

/**
 * モジュールロード時に自動で書き込み可能な場所を探して初期化。
 * Obsidian では __dirname / process.cwd() が信用できないため、
 * 複数候補を順に試す。
 */
export function initDiagAuto(): void {
  if (enabled) return;
  const candidates: string[] = [];
  try {
    // 1. __dirname（プラグインローダが設定している場合）
    candidates.push(__dirname);
  } catch { /* ignore */ }
  try {
    // 2. process.cwd()（vault ルートの場合）
    candidates.push(process.cwd());
  } catch { /* ignore */ }
  try {
    // 3. OS 一時ディレクトリ（確実に書き込める最後の候補）
    candidates.push(require('os').tmpdir());
  } catch { /* ignore */ }

  for (const dir of candidates) {
    try {
      const candidate = path.join(dir, 'claudian-bridge-load.log');
      fs.writeFileSync(candidate, `=== claudian-bridge load diag ${new Date().toISOString()} ===\n`, 'utf-8');
      logPath = candidate;
      enabled = true;
      diag('diag initialized (auto)', { dir, cwd: process.cwd(), platform: process.platform });
      return;
    } catch {
      continue;
    }
  }
}

/** イベント/エラーを追記（Obsidian コンソールにも出力） */
export function diag(...args: unknown[]): void {
  // コンソールには常に出力（ファイル書き込みが失敗する環境でも確認可能）
  try {
    const prefix = '[claudian-bridge-diag]';
    if (args.some((a) => a instanceof Error)) {
      console.error(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
  } catch { /* 無視 */ }

  if (!enabled || !logPath) return;
  try {
    const ts = new Date().toISOString();
    const parts = args.map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `Error: ${a.message}\n  ${(a.stack ?? '').split('\n').slice(0, 6).join('\n  ')}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    });
    fs.appendFileSync(logPath, `[${ts}] ${parts.join(' ')}\n`, 'utf-8');
  } catch {
    /* 記録失敗は無視 */
  }
}

/** グローバルエラーを捕捉してログに記録 */
export function installGlobalErrorHandlers(): void {
  if (!enabled) return;

  try {
    const win = window as unknown as {
      addEventListener?: (t: string, cb: (e: unknown) => void) => void;
      onerror?: (...a: unknown[]) => void;
    };
    win.addEventListener?.('error', (e) => {
      const ev = e as { message?: string; error?: unknown; filename?: string; lineno?: number };
      diag('WINDOW ERROR', ev?.message ?? String(e), ev?.error ?? '');
    });
    win.addEventListener?.('unhandledrejection', (e) => {
      const ev = e as { reason?: unknown };
      diag('UNHANDLED REJECTION', ev?.reason);
    });
  } catch (e) {
    diag('installGlobalErrorHandlers failed', e);
  }

  try {
    const p = process as unknown as {
      on?: (evt: string, cb: (e: unknown) => void) => void;
    };
    p.on?.('uncaughtException', (e) => diag('UNCAUGHT EXCEPTION', e));
    p.on?.('unhandledRejection', (e) => diag('PROCESS UNHANDLED REJECTION', e));
  } catch (e) {
    diag('process handlers failed', e);
  }
}
