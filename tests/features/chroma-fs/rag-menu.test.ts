import { describe, it, expect } from 'vitest';
import { isChromaFsTarget, resolveRagPaths } from '../../../src/features/chroma-fs/rag-menu';

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

describe('chroma-fs rag-menu resolveRagPaths', () => {
  const pluginDir = 'C:/vault/.obsidian/plugins/claudian-bridge';

  it('空欄 + pluginDir → プラグインフォルダの query.py / config.yaml を参照', () => {
    const r = resolveRagPaths('', '', pluginDir);
    expect(r.ok).toBe(true);
    expect(r.scriptPath.replace(/\\/g, '/')).toBe(`${pluginDir}/query.py`);
    expect(r.configPath.replace(/\\/g, '/')).toBe(`${pluginDir}/config.yaml`);
  });

  it('明示パスがあればそのまま使う', () => {
    const r = resolveRagPaths('D:/rag/query.py', 'D:/rag/config.yaml', pluginDir);
    expect(r.ok).toBe(true);
    expect(r.scriptPath).toBe('D:/rag/query.py');
    expect(r.configPath).toBe('D:/rag/config.yaml');
  });

  it('片方だけ設定 → 片方は pluginDir フォールバック', () => {
    const r = resolveRagPaths('D:/rag/query.py', '', pluginDir);
    expect(r.ok).toBe(true);
    expect(r.scriptPath).toBe('D:/rag/query.py');
    expect(r.configPath.replace(/\\/g, '/')).toBe(`${pluginDir}/config.yaml`);
  });

  it('空欄 + pluginDir なし → ok:false', () => {
    const r = resolveRagPaths('', '', undefined);
    expect(r.ok).toBe(false);
  });
});
