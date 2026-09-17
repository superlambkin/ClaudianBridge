import nodePath from 'path';
import { FolderBridgeFs } from './types';

/**
 * Phase 1: simple minimatch-style glob with * and ? only.
 * Avoids the full minimatch dependency for a starter implementation.
 * Replace with `minimatch` package in Phase 2 if patterns grow.
 */
export function matchesExclude(filename: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const re = new RegExp(
      '^' +
        p
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    );
    if (re.test(filename)) return true;
  }
  return false;
}

/**
 * v0.53.2 (F-054): NAS 切断・chokidar 競合・権限変動で発生する transient エラー
 * を許容する。致命的エラー（ENOSPC / EROFS / EIO 等）はそのまま上位へthrow。
 */
function isTransientSyncError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES' || code === 'EPERM' || code === 'EBUSY';
}

/**
 * v0.53.3 (F-055): syncAll の反復回数上限。NAS junction サイクルや chokidar
 * 無限イベントでキューが膨張するのを防止。10000 は通常の NAS（数万ファイル・
 * 数階層ネスト）でも到達しない余裕を持った値。
 */
const MAX_SYNC_ITERATIONS = 10_000;

export class ShadowReconciler {
  constructor(private fs: FolderBridgeFs) {}

  syncAll(
    externalPath: string,
    shadowPath: string,
    excludePatterns: string[],
  ): { copied: number; skipped: number } {
    let copied = 0;
    let skipped = 0;
    const queue: { src: string; rel: string }[] = [{ src: externalPath, rel: '' }];
    let iterations = 0;
    while (queue.length > 0) {
      // v0.53.3 (F-055): 反復回数上限。junction サイクルや chokidar 無限イベントで
      // キューが膨張して Obsidian が永続的に固まる事象への根本対策。
      if (++iterations > MAX_SYNC_ITERATIONS) {
        throw new Error(
          `syncAll iteration limit exceeded (${MAX_SYNC_ITERATIONS}). ` +
          `Possible cycle in ${externalPath}. Aborting to prevent freeze.`,
        );
      }
      const { src, rel } = queue.shift()!;
      // v0.53.2 (F-054): readdir 自体が失敗した場合（NAS 切断・broken junction）は
      // スキップして次のキュー要素へ。致命的エラーなら上位にthrow。
      let entries: string[];
      try {
        entries = this.fs.readdirSync(src);
      } catch (e) {
        if (isTransientSyncError(e)) {
          continue;
        }
        throw e;
      }
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) {
          skipped++;
          continue;
        }
        const srcPath = nodePath.join(src, entry);
        const dstPath = rel ? nodePath.join(shadowPath, rel, entry) : nodePath.join(shadowPath, entry);
        // v0.53.2 (F-054): readdir 後・stat 前でファイルが消えるレースを許容
        let stat: ReturnType<FolderBridgeFs['statSync']>;
        try {
          stat = this.fs.statSync(srcPath);
        } catch (e) {
          if (isTransientSyncError(e)) {
            skipped++;
            continue;
          }
          throw e;
        }
        if (stat.isDirectory()) {
          try {
            this.fs.mkdirSync(dstPath, { recursive: true });
          } catch (e) {
            if (isTransientSyncError(e)) continue;
            throw e;
          }
          queue.push({ src: srcPath, rel: rel ? nodePath.join(rel, entry) : entry });
        } else if (stat.isFile()) {
          // v0.53.2 (F-054): copyFile 失敗（NAS 切断中のファイル消失等）も
          // 個別に捕捉して次ファイルへ継続。致命的エラーなら上位にthrow。
          try {
            this.fs.copyFileSync(srcPath, dstPath);
            copied++;
          } catch (e) {
            if (isTransientSyncError(e)) {
              skipped++;
              continue;
            }
            throw e;
          }
        }
      }
    }
    return { copied, skipped };
  }

  syncOne(externalPath: string, shadowPath: string, excludePatterns: string[]): void {
    // v0.53.2 (F-054): chokidar イベントで呼び出される syncOne は、ファイルが
    // 既に削除されている可能性が高いため、ENOENT は throw せず静かにスキップ。
    let stat: ReturnType<FolderBridgeFs['statSync']>;
    try {
      stat = this.fs.statSync(externalPath);
    } catch (e) {
      if (isTransientSyncError(e)) return;
      throw e;
    }
    if (stat.isDirectory()) {
      try {
        this.fs.mkdirSync(shadowPath, { recursive: true });
      } catch (e) {
        if (isTransientSyncError(e)) return;
        throw e;
      }
      let entries: string[];
      try {
        entries = this.fs.readdirSync(externalPath);
      } catch (e) {
        if (isTransientSyncError(e)) return;
        throw e;
      }
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) continue;
        this.syncOne(
          nodePath.join(externalPath, entry),
          nodePath.join(shadowPath, entry),
          excludePatterns,
        );
      }
    } else if (stat.isFile()) {
      try {
        this.fs.mkdirSync(nodePath.dirname(shadowPath), { recursive: true });
      } catch (e) {
        if (isTransientSyncError(e)) return;
        throw e;
      }
      try {
        this.fs.copyFileSync(externalPath, shadowPath);
      } catch (e) {
        if (isTransientSyncError(e)) return;
        throw e;
      }
    }
  }

  removeFromShadow(shadowPath: string): void {
    if (this.fs.existsSync(shadowPath)) {
      this.fs.rmSync(shadowPath, { recursive: true, force: true });
    }
  }
}