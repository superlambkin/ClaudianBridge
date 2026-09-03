/**
 * 更新前のプラグイン 3 ファイルを <pluginDir>/.backup/<UTC-ISO>/ へ退避する。
 * Spec: docs/superpowers/specs/2026-09-03-self-update-design.md (D7)
 */
import type { DataAdapter } from 'obsidian';

export const BACKUP_TARGET_FILES = ['main.js', 'manifest.json', 'styles.css'] as const;

/** Date を UTC-ISO 風のディレクトリ名へ（例: 2026-09-04T12-34-56Z） */
function toUtcDirName(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/** プラグイン 3 ファイルを退避し、退避先パスを返す（衝突時は -001 連番） */
export async function backupPluginFiles(
  pluginDir: string,
  adapter: DataAdapter,
  now: Date = new Date(),
): Promise<string> {
  const base = `${pluginDir}/.backup`;
  let dirName = toUtcDirName(now);
  for (let n = 0; await adapter.exists(`${base}/${dirName}`); n++) {
    dirName = `${toUtcDirName(now)}-${String(n + 1).padStart(3, '0')}`;
  }
  const backupDir = `${base}/${dirName}`;
  await adapter.mkdir(backupDir);
  for (const f of BACKUP_TARGET_FILES) {
    const src = `${pluginDir}/${f}`;
    if (await adapter.exists(src)) {
      await adapter.writeBinary(`${backupDir}/${f}`, await adapter.readBinary(src));
    }
  }
  return backupDir;
}
