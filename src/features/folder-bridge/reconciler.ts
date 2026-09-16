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
    while (queue.length > 0) {
      const { src, rel } = queue.shift()!;
      const entries = this.fs.readdirSync(src);
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) {
          skipped++;
          continue;
        }
        const srcPath = nodePath.join(src, entry);
        const dstPath = rel ? nodePath.join(shadowPath, rel, entry) : nodePath.join(shadowPath, entry);
        const stat = this.fs.statSync(srcPath);
        if (stat.isDirectory()) {
          this.fs.mkdirSync(dstPath, { recursive: true });
          queue.push({ src: srcPath, rel: rel ? nodePath.join(rel, entry) : entry });
        } else if (stat.isFile()) {
          this.fs.copyFileSync(srcPath, dstPath);
          copied++;
        }
      }
    }
    return { copied, skipped };
  }

  syncOne(externalPath: string, shadowPath: string, excludePatterns: string[]): void {
    const stat = this.fs.statSync(externalPath);
    if (stat.isDirectory()) {
      this.fs.mkdirSync(shadowPath, { recursive: true });
      const entries = this.fs.readdirSync(externalPath);
      for (const entry of entries) {
        if (matchesExclude(entry, excludePatterns)) continue;
        this.syncOne(
          nodePath.join(externalPath, entry),
          nodePath.join(shadowPath, entry),
          excludePatterns,
        );
      }
    } else if (stat.isFile()) {
      this.fs.mkdirSync(nodePath.dirname(shadowPath), { recursive: true });
      this.fs.copyFileSync(externalPath, shadowPath);
    }
  }

  removeFromShadow(shadowPath: string): void {
    if (this.fs.existsSync(shadowPath)) {
      this.fs.rmSync(shadowPath, { recursive: true, force: true });
    }
  }
}
