import { describe, it, expect } from 'vitest';

import { buildTimestamp, resolveDestName } from '../../../src/features/backup/backup-runner';

describe('backup-runner', () => {
  describe('buildTimestamp', () => {
    it('YYYYMMDD_HHMMSS 形式で 14 文字', () => {
      const ts = buildTimestamp();
      expect(ts).toMatch(/^\d{8}_\d{6}$/);
      expect(ts.length).toBe(15);
    });

    it('現在時刻を反映している', () => {
      const before = new Date();
      const ts = buildTimestamp();
      const after = new Date();
      // YYYYMMDD_HHMMSS → Date 復元（タイムゾーンずれは無視して年月日のみ確認）
      const yyyy = parseInt(ts.slice(0, 4), 10);
      const mm = parseInt(ts.slice(4, 6), 10);
      const dd = parseInt(ts.slice(6, 8), 10);
      expect(yyyy).toBe(before.getFullYear());
      expect(mm).toBe(before.getMonth() + 1);
      expect(dd).toBeGreaterThanOrEqual(before.getDate() - 1);
      expect(dd).toBeLessThanOrEqual(after.getDate() + 1);
    });
  });

  describe('resolveDestName', () => {
    it('ファイル: note.md → note_<TS>.md', () => {
      const name = resolveDestName('note.md', false);
      expect(name).toMatch(/^note_\d{8}_\d{6}\.md$/);
    });

    it('ファイル: 拡張子なし → 拡張子なし', () => {
      const name = resolveDestName('README', false);
      expect(name).toMatch(/^README_\d{8}_\d{6}$/);
    });

    it('フォルダ: notes → notes_<TS>', () => {
      const name = resolveDestName('notes', true);
      expect(name).toMatch(/^notes_\d{8}_\d{6}$/);
    });

    it('フォルダ: サブディレクトリ含む path → basename 使用', () => {
      const name = resolveDestName('subdir/notes', true);
      expect(name).toMatch(/^notes_\d{8}_\d{6}$/);
    });

    it('ファイル: サブディレクトリ含む path → basename+拡張子', () => {
      const name = resolveDestName('sub/dir/note.md', false);
      expect(name).toMatch(/^note_\d{8}_\d{6}\.md$/);
    });
  });
});

