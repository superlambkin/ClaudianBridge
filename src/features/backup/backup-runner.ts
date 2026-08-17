import { App, TFile, TFolder, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressModal } from '../office/progress-modal';

type BackupTarget = TFile | TFolder;

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
  // 1. 保存先ダイアログ（Obsidian 公式 API）
  const openFolderDialog = (app as unknown as {
    openFolderDialog?: (title: string) => Promise<string | null>;
  }).openFolderDialog;
  const destRoot = openFolderDialog
    ? await openFolderDialog.call(app, 'バックアップ保存先を選択')
    : null;
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