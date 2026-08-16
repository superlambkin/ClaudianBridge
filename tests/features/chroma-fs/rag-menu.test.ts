import { describe, it, expect } from 'vitest';
import { isChromaFsTarget } from '../../../src/features/chroma-fs/rag-menu';

describe('chroma-fs rag-menu isChromaFsTarget', () => {
  it('chroma_db/PDF/ 配下の .pdf を対象にする', () => {
    expect(isChromaFsTarget('chroma_db/PDF/Marantz_SR6015F.pdf', 'chroma_db')).toBe(true);
  });

  it('chroma_db/DOCX/ 配下の .docx を対象にする', () => {
    expect(isChromaFsTarget('chroma_db/DOCX/英語教師.docx', 'chroma_db')).toBe(true);
  });

  it('スペースを含むファイル名も対象にする', () => {
    expect(isChromaFsTarget('chroma_db/PDF/REGZA 42J8.pdf', 'chroma_db')).toBe(true);
  });

  it('chroma_db 直下（PDF/DOCX 以外）は対象外', () => {
    expect(isChromaFsTarget('chroma_db/chroma.sqlite3', 'chroma_db')).toBe(false);
    expect(isChromaFsTarget('chroma_db/9422e6f0-865d-468a-bb60-d668a3a56a57/data_level0.bin', 'chroma_db')).toBe(false);
  });

  it('chromaPath が絶対パスでも Vault 相対の filePath は対象外（設定は Vault 相対推奨）', () => {
    expect(isChromaFsTarget('chroma_db/PDF/a.pdf', 'C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/chroma_db')).toBe(false);
  });

  it('拡張子が pdf/docx 以外は対象外', () => {
    expect(isChromaFsTarget('chroma_db/PDF/note.txt', 'chroma_db')).toBe(false);
  });
});
