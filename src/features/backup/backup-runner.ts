import { App, TFile, TFolder, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressModal } from '../office/progress-modal';

type BackupTarget = TFile | TFolder;

/**
 * Electron のダイアログ API。
 * Obsidian の型定義 (obsidian.d.ts) には存在しないため、ローカルで定義する。
 * esbuild の external に 'electron' が含まれており、実行時に require で解決される。
 */
export interface BackupDialog {
  showOpenDialog(opts: {
    title?: string;
    properties?: string[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/**
 * Electron の require('electron') 戻り値から dialog を解決する。
 * dialog モジュールは main-process 専用のため、レンダラープロセスでは
 * electron.dialog が undefined の場合がある。
 * Obsidian は remote を有効にしているため、electron.remote?.dialog に
 * フォールバックする。
 */
export function resolveBackupDialog(electron: {
  dialog?: BackupDialog;
  remote?: { dialog?: BackupDialog };
}): BackupDialog | null {
  return electron.dialog ?? electron.remote?.dialog ?? null;
}

/**
 * 保存先フォルダを選択するダイアログを開く。
 * キャンセル時は null を返す。
 */
export async function pickBackupDestination(
  dialog: BackupDialog,
  title: string,
): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

/**
 * 現在時刻を "YYYYMMDD_HHMMSS" 形式で返す。
 * ファイル名安全（Windows / macOS / Linux 全対応）。
 */
export function buildTimestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * バックアップ名を解決: "<元basename>_<TS>" or "<元basename>_<TS>.<ext>"
 * srcPath: Vault 相対パス
 * isDir: フォルダかどうか
 */
export function resolveDestName(srcPath: string, isDir: boolean): string {
  const base = path.basename(srcPath);
  const ext = path.extname(base);
  const stem = isDir || ext === '' ? base : base.slice(0, -ext.length);
  const ts = buildTimestamp();
  return `${stem}_${ts}${isDir ? '' : ext}`;
}

/**
 * バックアップ実行: ダイアログ → ProgressModal → fs.promises.cp
 */
export async function runBackup(
  app: App,
  target: BackupTarget,
  pluginDir?: string,
): Promise<void> {
  // 1. 保存先ダイアログ（OS ネイティブ / Electron）
  //    Obsidian の App/Workspace にはフォルダ選択 API が存在しない。
  //    dialog モジュールは main-process 専用のため、レンダラープロセスでは
  //    electron.dialog が undefined の場合がある。Obsidian は remote を
  //    有効にしているため、electron.remote?.dialog にフォールバックする。
  const electron = require('electron') as {
    dialog?: BackupDialog;
    remote?: { dialog?: BackupDialog };
  };
  const dialog = resolveBackupDialog(electron);
  if (!dialog) {
    new Notice('⚠️ 保存先ダイアログを開けません');
    return;
  }
  const destRoot = await pickBackupDestination(dialog, 'バックアップ保存先を選択');
  if (!destRoot) return; // ユーザーキャンセル

  // 2. パス解決
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  const vaultRoot = adapter.getBasePath?.() ?? process.cwd();
  const srcPath = path.join(vaultRoot, target.path);
  const isDir = target instanceof TFolder;
  const destName = resolveDestName(target.path, isDir);
  const destPath = path.join(destRoot, destName);

  // 3. ProgressModal 起動
  const modal = new ProgressModal(app, {
    title: `💾 バックアップ: ${destName}`,
    showSplit: false,
  });
  modal.open();

  // 4. コピー実行（recursive: true でディレクトリを再帰、force は fs.cp デフォルト true で上書き）
  try {
    await fs.promises.cp(srcPath, destPath, { recursive: true });
    modal.appendLog(`✅ 完了: ${destPath}`);
    new Notice(`✅ バックアップ完了: ${destName}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: false, settings: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    modal.appendLog(`[ERROR] ${msg}`);
    new Notice(`⚠️ バックアップ失敗: ${msg}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: false, settings: false });
  }
}
