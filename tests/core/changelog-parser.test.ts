import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../../src/core/changelog-parser';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const changelogMd = readFileSync(`${repoRoot}/CHANGELOG.md`, 'utf-8');

describe('parseChangelog（実物 CHANGELOG.md）', () => {
  it('全エントリをパースできる（40 件以上）', () => {
    const entries = parseChangelog(changelogMd);
    expect(entries.length).toBeGreaterThanOrEqual(40);
  });

  it('全エントリで version / date が抽出される', () => {
    const entries = parseChangelog(changelogMd);
    for (const e of entries) {
      expect(e.version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(e.sections)).toBe(true);
    }
  });

  it('既知エントリ 0.38.0 を正しく抽出する', () => {
    const entry = parseChangelog(changelogMd).find((e) => e.version === '0.38.0');
    expect(entry).toBeDefined();
    expect(entry!.date).toBe('2026-09-07');
    expect(entry!.title).toContain('選択ポップアップ位置設定');
    const added = entry!.sections.find((s) => s.name === 'Added');
    expect(added).toBeDefined();
    expect(added!.items.length).toBeGreaterThan(0);
    expect(added!.items.some((i) => i.includes('popupPosition'))).toBe(true);
  });

  it('CHANGELOG.md の全バージョン見出しが欠落なくパースされる', () => {
    const headings = changelogMd.match(/^## \[([^\]]+)\]/gm)?.length ?? 0;
    expect(parseChangelog(changelogMd).length).toBe(headings);
  });
});

describe('parseChangelog（不正入力）', () => {
  it('空文字は空配列', () => {
    expect(parseChangelog('')).toEqual([]);
  });

  it('空白のみは空配列', () => {
    expect(parseChangelog('   \n\t\n')).toEqual([]);
  });

  it('バージョン見出しの無いテキストは空配列', () => {
    expect(parseChangelog('# Changelog\n\nただのテキスト\n- 箇条書き\n')).toEqual([]);
  });
});
