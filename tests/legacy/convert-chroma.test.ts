import { describe, it, expect } from 'vitest';
import { convertFromChromaInspector } from '../../src/legacy/convert-chroma';

describe('convertFromChromaInspector', () => {
  it('正常な data.json を変換して chroma ブロックを返す', () => {
    const r = convertFromChromaInspector({
      chromaPath: 'my_chroma_db',
      pythonPath: 'py',
      embeddingModel: 'all-MiniLM-L6-v2',
      defaultNResults: 10,
      recordPreviewLength: 500,
      showProgressModal: false,
      enableRawSql: true,
      scriptPath: '',
    });
    expect(r).not.toBeNull();
    expect(r!.chroma).toEqual({
      enabled: true, // 既存ユーザーなので ON
      chromaPath: 'my_chroma_db',
      pythonPath: 'py',
      embeddingModel: 'all-MiniLM-L6-v2',
      defaultNResults: 10,
      recordPreviewLength: 500,
      showProgressModal: false,
      enableRawSql: true,
      scriptPath: '',
    });
  });

  it('空 chromaPath → デフォルト chroma_db を埋める', () => {
    const r = convertFromChromaInspector({ pythonPath: 'py' });
    expect(r!.chroma.chromaPath).toBe('chroma_db');
  });

  it('不正な型はデフォルトにフォールバック', () => {
    const r = convertFromChromaInspector({
      defaultNResults: 'oops' as unknown as number,
      recordPreviewLength: null as unknown as number,
    });
    expect(r!.chroma.defaultNResults).toBe(5);
    expect(r!.chroma.recordPreviewLength).toBe(240);
  });

  it('null / non-object は null を返す', () => {
    expect(convertFromChromaInspector(null)).toBeNull();
    expect(convertFromChromaInspector('foo')).toBeNull();
    expect(convertFromChromaInspector(undefined)).toBeNull();
  });
});
