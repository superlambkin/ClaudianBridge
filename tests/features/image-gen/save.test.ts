import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildFilename,
  resolveAssetDir,
  uniqueAssetPath,
  writeAsset,
} from '../../../src/features/image-gen/save';

describe('image-gen/save', () => {
  describe('buildFilename', () => {
    it('基本: text2img_<date>.<ext>', () => {
      const f = buildFilename('jpg', undefined, '20260907');
      expect(f).toBe('text2img_20260907.jpg');
    });
    it('hash 付き: text2img_<date>_<hash>.{ext}', () => {
      const f = buildFilename('png', 'abcdef1234567890', '20260907');
      expect(f).toBe('text2img_20260907_abcdef12.png');
    });
    it('hash は最大 8 文字に切り詰める', () => {
      const f = buildFilename('jpg', 'abcdefghij1234567890', '20260907');
      expect(f).toContain('abcdefgh');
      expect(f).not.toContain('abcdefghij1234');
    });
    it('jpeg は jpg に正規化', () => {
      const f = buildFilename('jpeg', undefined, '20260907');
      expect(f).toBe('text2img_20260907.jpg');
    });
  });

  describe('resolveAssetDir', () => {
    it('Vault root + output/Assets', () => {
      expect(resolveAssetDir('C:/vault')).toBe(path.join('C:/vault', 'output', 'Assets'));
      expect(resolveAssetDir('/home/user/vault')).toBe(path.join('/home/user/vault', 'output', 'Assets'));
    });
  });

  describe('uniqueAssetPath', () => {
    let tmpDir: string;
    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cb-imagegen-'));
    });
    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    it('新規ファイル名はそのまま返す', async () => {
      const p = await uniqueAssetPath(tmpDir, 'test.png');
      expect(p).toBe(path.join(tmpDir, 'test.png'));
    });
    it('既存ファイルは -1 付与', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.png'), 'a');
      const p = await uniqueAssetPath(tmpDir, 'test.png');
      expect(p).toBe(path.join(tmpDir, 'test-1.png'));
    });
    it('既存 + -1 既存は -2 付与', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.png'), 'a');
      await fs.writeFile(path.join(tmpDir, 'test-1.png'), 'a');
      const p = await uniqueAssetPath(tmpDir, 'test.png');
      expect(p).toBe(path.join(tmpDir, 'test-2.png'));
    });
  });

  describe('writeAsset', () => {
    let tmpRoot: string;
    beforeEach(async () => {
      tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cb-imagegen-vault-'));
    });
    afterEach(async () => {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    });
    it('output/Assets/ を作成してファイルを書き込む', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const res = await writeAsset(tmpRoot, bytes, 'png', 'abcdef1234');
      expect(res.absolutePath).toContain('output');
      expect(res.absolutePath).toContain('Assets');
      expect(res.absolutePath).toMatch(/text2img_\d{8}_abcdef12\.png$/);
      expect(res.vaultRelativePath).toMatch(/^output\/Assets\/text2img_\d{8}_abcdef12\.png$/);
      const written = await fs.readFile(res.absolutePath);
      expect(written.length).toBe(3);
    });
    it('output/Assets が無ければ mkdir する', async () => {
      const bytes = new Uint8Array([1]);
      const res = await writeAsset(tmpRoot, bytes, 'jpg');
      const dir = path.dirname(res.absolutePath);
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });
    it('既存ファイル名は -1 付与で衝突回避', async () => {
      const bytes = new Uint8Array([1]);
      const a = await writeAsset(tmpRoot, bytes, 'jpg', 'samehash1');
      const b = await writeAsset(tmpRoot, bytes, 'jpg', 'samehash1');
      expect(a.absolutePath).not.toBe(b.absolutePath);
      expect(b.absolutePath).toMatch(/-1\.jpg$/);
    });
  });
});
