/**
 * v0.33.0: Mermaid 描画エラーログ（debug.mermaid.log）
 * src/core/diag.ts と同型の追記式ログ。書き込めない環境では静かに無効化。
 */
import * as fs from 'fs';
import * as path from 'path';

let logPath: string | null = null;

/** ログ初期化（プラグインディレクトリ直下の debug.mermaid.log） */
export function initMermaidLog(pluginDir: string): void {
  try {
    logPath = path.join(pluginDir, 'debug.mermaid.log');
    fs.appendFileSync(logPath, `=== mermaid-render log ${new Date().toISOString()} ===\n`, 'utf-8');
  } catch {
    logPath = null; // 書けない環境では静かに無効
  }
}

/** イベント/エラーを追記（Obsidian コンソールにも出力） */
export function mermaidLog(...args: unknown[]): void {
  try {
    const prefix = '[claudian-bridge-mermaid]';
    if (args.some((a) => a instanceof Error)) console.error(prefix, ...args);
    else console.log(prefix, ...args);
  } catch { /* 無視 */ }

  if (!logPath) return;
  try {
    const ts = new Date().toISOString();
    const parts = args.map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `Error: ${a.message}\n  ${(a.stack ?? '').split('\n').slice(0, 6).join('\n  ')}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    });
    fs.appendFileSync(logPath, `[${ts}] ${parts.join(' ')}\n`, 'utf-8');
  } catch { /* 記録失敗は無視 */ }
}
