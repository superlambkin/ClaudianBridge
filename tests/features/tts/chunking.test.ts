import { describe, it, expect, vi } from 'vitest';
import { chunkText, speakChunks, chunkTextNatural } from '../../../src/features/tts/chunking';
import { getPlaybackController } from '../../../src/features/tts/playback-controller';

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

  it('maxChunkSize が 0 以下でもクラッシュしない', () => {
    expect(chunkText('あいう', 0)).toEqual(['あいう']);
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

  // v0.31.0 (F-028): 各 chunk speak 開始前に onChunkStart(idx) が呼ばれる
  it('onChunkStart が各 chunk 開始前に index 付きで呼ばれる', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    const hook = vi.fn();
    const ok = await speakChunks(['a', 'b', 'c'], speak, undefined, hook);
    expect(ok).toBe(true);
    expect(hook).toHaveBeenCalledTimes(3);
    expect(hook.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
    // speak より先に hook が呼ばれること（順序保証）
    expect(hook.mock.invocationCallOrder[0]).toBeLessThan(speak.mock.invocationCallOrder[0]!);
  });

  it('onChunkStart 未指定でも正常動作（後方互換）', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    const ok = await speakChunks(['a', 'b'], speak);
    expect(ok).toBe(true);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('speak が false を返したら以降の onChunkStart は呼ばれない', async () => {
    const speak = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const hook = vi.fn();
    const ok = await speakChunks(['a', 'b', 'c'], speak, undefined, hook);
    expect(ok).toBe(false);
    expect(hook).toHaveBeenCalledTimes(2); // 2 番目の chunk で中断
    expect(hook.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });
});

describe('chunkTextNatural (v0.35.0)', () => {
  it('見出し行で強制新チャンク', () => {
    const chunks = chunkTextNatural('# A\n\n本文A。\n# B\n\n本文B。', 100);
    expect(chunks[0].startsWith('# A')).toBe(true);
    expect(chunks[1].startsWith('# B')).toBe(true);
  });

  it('見出しがなく文末で区切れる場合は既存 chunkText と同一結果', () => {
    const text = 'あ'.repeat(300) + '。' + 'い'.repeat(300) + '。';
    expect(chunkTextNatural(text, 400)).toEqual(chunkText(text, 400));
  });

  it('見出し内の長文は途中分割にフォールバック', () => {
    const chunks = chunkTextNatural('# ' + 'あ'.repeat(300), 100);
    expect(chunks.every((c) => c.length <= 100 || c.length < 300)).toBe(true);
    expect(chunks.join('')).toContain('あ'.repeat(300));
  });
});

describe('speakChunks 制御統合 (v0.35.0)', () => {
  it('skip 要求で現チャンクを打ち切り次へ進む', async () => {
    const pc = getPlaybackController();
    const spoken: string[] = [];
    const p = speakChunks(['aaa', 'bbb', 'ccc'], async (t) => {
      spoken.push(t);
      if (t === 'aaa') pc.skipNext(); // 1 チャンク目の再生中にスキップ要求
      return true;
    });
    await expect(p).resolves.toBe(true);
    expect(spoken).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('speakFn が false（外部停止等）なら false を返す', async () => {
    const pc = getPlaybackController();
    const p = speakChunks(['a', 'b'], async () => false);
    await expect(p).resolves.toBe(false);
    expect(pc.consumeSkip()).toBe(false);
  });
});
