import { describe, it, expect, vi } from 'vitest';
import { chunkText, speakChunks } from '../../../src/features/tts/chunking';

describe('chunkText', () => {
  it('短文はそのまま返す', () => {
    expect(chunkText('こんにちは', 100)).toEqual(['こんにちは']);
  });

  it('句読点で分割する', () => {
    const text = 'こんにちは。お元気ですか？今日は。';
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(['こんにちは。', 'お元気ですか？', '今日は。']);
  });

  it('区切り文字がない場合は強制分割する', () => {
    const text = 'あ'.repeat(100);
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBe(4); // 30+30+30+10
    expect(chunks.every((c) => c.length <= 30)).toBe(true);
  });

  it('単一セグメントが max 超ならハード分割する', () => {
    const text = 'あ'.repeat(50);
    const chunks = chunkText(text, 20);
    expect(chunks).toEqual(['あ'.repeat(20), 'あ'.repeat(20), 'あ'.repeat(10)]);
  });

  it('改行も区切りとして扱う', () => {
    // max=4 で各行が独立チャンクになる
    const text = '一行目\n二行目\n三行目';
    const chunks = chunkText(text, 4);
    expect(chunks).toEqual(['一行目\n', '二行目\n', '三行目']);
  });

  it('短い文は max まで詰める（パッキング）', () => {
    const chunks = chunkText('あ。'.repeat(30), 20);
    expect(chunks.length).toBe(3); // 10 units per chunk = 20 chars
    expect(chunks.every((c) => c.length <= 20)).toBe(true);
    expect(chunks.every((c) => c.endsWith('。'))).toBe(true);
  });
});

describe('speakChunks', () => {
  it('全チャンクを順に speak する', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    const ok = await speakChunks(['a', 'b', 'c'], speak);
    expect(ok).toBe(true);
    expect(speak).toHaveBeenCalledTimes(3);
    expect(speak.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('speak が false を返したら中断して false', async () => {
    const speak = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const ok = await speakChunks(['a', 'b', 'c'], speak);
    expect(ok).toBe(false);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('onCancel が true なら中断して false', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    let calls = 0;
    const ok = await speakChunks(['a', 'b', 'c'], speak, () => ++calls > 1);
    expect(ok).toBe(false);
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
