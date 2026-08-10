import { describe, it, expect } from 'vitest';
import { VaultPath } from '../../../src/features/office/path';

describe('VaultPath', () => {
  it('absolute は vault と rel を join', () => {
    expect(VaultPath.absolute('C:/vault', 'folder/a.md')).toBe('C:/vault/folder/a.md');
  });
  it('splitName は dir/stem/ext を分離', () => {
    expect(VaultPath.splitName('folder/a.b.md')).toEqual({ dir: 'folder', stem: 'a.b', ext: 'md' });
  });
  it('splitName は拡張子なしも扱う', () => {
    expect(VaultPath.splitName('folder/readme')).toEqual({ dir: 'folder', stem: 'readme', ext: '' });
  });
  it('sanitizeStem は不正文字を _ に置換', () => {
    expect(VaultPath.sanitizeStem('a/b:c*?')).toBe('a_b_c__');
  });
  it('sanitizeStem は 120 文字で切り詰める', () => {
    expect(VaultPath.sanitizeStem('x'.repeat(200)).length).toBe(120);
  });
  it('outputPath は suffix と ext を付与', () => {
    expect(VaultPath.outputPath('folder/doc.docx', '_split', 'md')).toBe('folder/doc_split.md');
  });
});
