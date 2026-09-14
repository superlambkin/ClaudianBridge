import { describe, it, expect } from 'vitest';
import { backupPluginFiles, BACKUP_TARGET_FILES } from '../../../src/features/self-update/backup-manager';

/** in-memory DataAdapter モック */
function makeAdapter() {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    put(name: string, content: string) {
      files.set(name, new TextEncoder().encode(content).buffer as ArrayBuffer);
    },
    async exists(p: string) {
      if (files.has(p)) return true;
      // ディレクトリ指定も配下ファイルがあれば true（実 DataAdapter 準拠）
      for (const k of files.keys()) if (k.startsWith(`${p}/`)) return true;
      return false;
    },
    async mkdir(p: string) { /* no-op */ },
    async list(_p: string) { return { files: [...files.keys()], folders: [] }; },
    async readBinary(p: string) {
      const b = files.get(p);
      if (!b) throw new Error(`not found: ${p}`);
      return b;
    },
    async writeBinary(p: string, data: ArrayBuffer) { files.set(p, data); },
  };
}

const FIXED_DATE = new Date('2026-09-04T12:34:56Z');

describe('backupPluginFiles', () => {
  it('対象は 3 ファイル', () => {
    expect([...BACKUP_TARGET_FILES]).toEqual(['main.js', 'manifest.json', 'styles.css']);
  });

  it('3 ファイルを .backup/<UTC-ISO>/ へ退避する', async () => {
    const ad = makeAdapter();
    ad.put('plugin/main.js', 'OLD');
    ad.put('plugin/manifest.json', '{}');
    ad.put('plugin/styles.css', 'body{}');
    const backupPath = await backupPluginFiles('plugin', ad, FIXED_DATE);
    expect(backupPath).toBe('plugin/.backup/2026-09-04T12-34-56Z');
    expect(await ad.exists('plugin/.backup/2026-09-04T12-34-56Z/main.js')).toBe(true);
    expect(new TextDecoder().decode(await ad.readBinary('plugin/.backup/2026-09-04T12-34-56Z/manifest.json'))).toBe('{}');
  });

  it('同一タイムスタンプで衝突時は -001 連番を採番する', async () => {
    const ad = makeAdapter();
    ad.put('plugin/main.js', 'OLD');
    ad.put('plugin/manifest.json', '{}');
    ad.put('plugin/styles.css', '');
    const first = await backupPluginFiles('plugin', ad, FIXED_DATE);
    const second = await backupPluginFiles('plugin', ad, FIXED_DATE);
    expect(first).toBe('plugin/.backup/2026-09-04T12-34-56Z');
    expect(second).toBe('plugin/.backup/2026-09-04T12-34-56Z-001');
  });
});
