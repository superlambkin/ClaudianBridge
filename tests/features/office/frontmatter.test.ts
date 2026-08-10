import { describe, it, expect } from 'vitest';
import { FrontmatterApplier } from '../../../src/features/office/frontmatter';

describe('FrontmatterApplier', () => {
  const vars = {
    title: 'レポート',
    sourcePath: 'docs/a.docx',
    date: '2026-08-10 12:00',
    ext: 'docx',
    sizeBytes: 1234,
    sha256: 'abcdef12',
  };
  it('全プレースホルダを展開する', () => {
    const out = FrontmatterApplier.expand('title: {{title}}\next: {{ext}}\nsha: {{sha256}}\nsize: {{sizeBytes}}', vars);
    expect(out).toContain('title: レポート');
    expect(out).toContain('ext: docx');
    expect(out).toContain('sha: abcdef12');
    expect(out).toContain('size: 1234');
  });
  it('未知キーはそのまま残す', () => {
    expect(FrontmatterApplier.expand('{{unknown}}', vars)).toBe('{{unknown}}');
  });
  it('値のバッククォートは \' に置換', () => {
    expect(FrontmatterApplier.expand('x: {{title}}', { ...vars, title: 'a`b' })).toBe('x: a\'b');
  });
});
