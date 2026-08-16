import { describe, it, expect } from 'vitest';
import { parseRagJsonOutput } from '../../../src/features/chroma-fs/rag-query';

describe('chroma-fs rag-query parseRagJsonOutput', () => {
  it('正常な JSON をパースする', () => {
    const stdout = JSON.stringify({
      ok: true,
      answer: 'HDMI は背面の INPUT 3 です。',
      sources: [{ source: 'REGZA 42J8.pdf', page: 5, score: 0.82 }],
    });
    const r = parseRagJsonOutput(stdout);
    expect(r.ok).toBe(true);
    expect(r.answer).toContain('HDMI');
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].source).toBe('REGZA 42J8.pdf');
  });

  it('空 stdout → ok:false + エラーメッセージ', () => {
    const r = parseRagJsonOutput('');
    expect(r.ok).toBe(false);
    expect(r.answer).toBeTruthy();
    expect(r.sources).toEqual([]);
  });

  it('不正 JSON → ok:false + エラーメッセージ', () => {
    const r = parseRagJsonOutput('not json');
    expect(r.ok).toBe(false);
    expect(r.answer).toContain('JSON');
  });

  it('ok:false の envelope → エラーを answer に反映', () => {
    const r = parseRagJsonOutput(JSON.stringify({ ok: false, answer: 'RAG_ERROR' }));
    expect(r.ok).toBe(false);
    expect(r.answer).toBe('RAG_ERROR');
  });
});
