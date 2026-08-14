import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  plachtaTtsSpeak,
  plachtaSpeakChunksPipelined,
  PLACHTA_DEFAULT_SPEAKER,
  PLACHTA_PRESETS,
  PLACHTA_SPACE_URL,
  type PlachtaSettings,
} from '../../../src/features/tts/plachta-tts';
import type { TtsSettings } from '../../../src/features/tts/core';

// グローバル fetch のモック
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

// SSE ストリームモック用ヘルパ（process_completed 等のイベント列を返す）
function makeSseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    body: stream,
  } as unknown as Response;
}

function makePlachtaSettings(overrides: Partial<PlachtaSettings> = {}): TtsSettings {
  return {
    engine: 'edge',
    voices: {
      edge: { zh: '', ja: '', en: '' },
      webspeech: { zh: '', ja: '', en: '' },
    },
    plachta: {
      speaker: PLACHTA_DEFAULT_SPEAKER,
      language: '日本語',
      speed: 1.0,
      ...overrides,
    },
  };
}

describe('plachta-tts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('TC-P01: Gradio 5.x 正常系: POST /gradio_api/queue/join → SSE process_completed → fetch wav → resolve(true)', async () => {
    // Step 1: POST /gradio_api/queue/join → event_id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc123' }),
    });
    // Step 2: GET SSE /gradio_api/queue/data (process_completed を含むストリーム)
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        { msg: 'estimation', event_id: 'abc123', rank: 0, queue_size: 1, rank_eta: 5.0 },
        { msg: 'process_starts', event_id: 'abc123', eta: 5.0 },
        {
          msg: 'process_completed',
          event_id: 'abc123',
          output: {
            data: [
              'Success',
              { path: '/tmp/gradio/abc/out.wav', url: 'https://example.com/out.wav', size: 12345 },
            ],
          },
        },
        { msg: 'close_stream', event_id: null },
      ])
    );
    // Step 3: GET wav URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Audio.play() をモック化（Node 環境で Audio を上書き）
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
    };

    const notice = vi.fn();
    const result = await plachtaTtsSpeak(
      'こんにちは',
      makePlachtaSettings(),
      notice
    );
    expect(result).toBe(true);
    expect(notice).not.toHaveBeenCalled();

    // POST が /gradio_api/queue/join に対するもの
    const postCall = mockFetch.mock.calls[0];
    expect(postCall[0]).toBe(`${PLACHTA_SPACE_URL}/gradio_api/queue/join`);
    const postBody = JSON.parse(postCall[1].body);
    expect(postBody.data).toEqual(['こんにちは', PLACHTA_DEFAULT_SPEAKER, '日本語', 1.0, false]);
    expect(postBody.fn_index).toBeDefined();
    expect(postBody.session_hash).toBeTypeOf('string');
    expect(postBody.request_id).toBeTypeOf('string');
  });

  it('TC-P03: SSE 60 秒タイムアウトで resolve(false) + Timeout Notice', async () => {
    // fake timers で 60 秒待機を短縮
    vi.useFakeTimers();
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ event_id: 'abc' }),
      });
      // SSE は close_stream 以外のイベントだけ送って完了しないストリーム
      mockFetch.mockResolvedValueOnce(
        makeSseResponse([
          { msg: 'estimation', event_id: 'abc', rank: 0, queue_size: 1, rank_eta: 60.0 },
          // process_completed を意図的に送らない
        ])
      );

      const notice = vi.fn();
      const promise = plachtaTtsSpeak('こんにちは', makePlachtaSettings(), notice);
      // 60 秒 + 余裕で 65_000ms 進める
      await vi.advanceTimersByTimeAsync(65_000);
      const result = await promise;
      expect(result).toBe(false);
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('タイムアウト'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('TC-P04: POST /gradio_api/queue/join が HTTP 500 → resolve(false) + HTTP 500 Notice', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const notice = vi.fn();
    const result = await plachtaTtsSpeak(
      'こんにちは',
      makePlachtaSettings(),
      notice
    );
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'));
  });

  it('TC-P05: fetch が TypeError（ネット断）→ resolve(false) + Offline Notice', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const notice = vi.fn();
    const result = await plachtaTtsSpeak(
      'こんにちは',
      makePlachtaSettings(),
      notice
    );
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('ネット'));
  });

  it('TC-P06: text が空 → resolve(false) + empty Notice', async () => {
    const notice = vi.fn();
    const result = await plachtaTtsSpeak('', makePlachtaSettings(), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('空'));
  });

  it('TC-P07: text が 151 文字（実測上限150字超）→ resolve(false) + too-long Notice', async () => {
    const notice = vi.fn();
    const longText = 'あ'.repeat(151);
    const result = await plachtaTtsSpeak(longText, makePlachtaSettings(), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('長い'));
  });

  it('TC-P07b: text が 150 文字（実測上限ギリギリ）→ 検証を通過して API 呼び出しに進む', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc' }),
    });
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        {
          msg: 'process_completed',
          event_id: 'abc',
          output: { data: ['Success', { url: 'https://example.com/out.wav' }] },
        },
      ])
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
    };

    const notice = vi.fn();
    const okText = 'あ'.repeat(150);
    const result = await plachtaTtsSpeak(okText, makePlachtaSettings(), notice);
    expect(result).toBe(true);
    // POST 本文に 150 字が渡る
    const postCall = mockFetch.mock.calls[0];
    const body = JSON.parse(postCall[1].body);
    expect(body.data[0].length).toBe(150);
  });

  it('TC-P08: speaker が空文字 → defaults で補完され resolve(true)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc' }),
    });
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        {
          msg: 'process_completed',
          event_id: 'abc',
          output: { data: ['Success', { url: 'https://example.com/out.wav' }] },
        },
      ])
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
    };

    const notice = vi.fn();
    const settings = makePlachtaSettings({ speaker: '' });
    const result = await plachtaTtsSpeak('こんにちは', settings, notice);
    expect(result).toBe(true);
  });

  it('TC-P09: speed が範囲外（3.0）→ 1.0 にクランプ', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc' }),
    });
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        {
          msg: 'process_completed',
          event_id: 'abc',
          output: { data: ['Success', { url: 'https://example.com/out.wav' }] },
        },
      ])
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
    };

    const notice = vi.fn();
    const settings = makePlachtaSettings({ speed: 3.0 });
    await plachtaTtsSpeak('こんにちは', settings, notice);

    // POST のリクエスト本文に speed=1.0 が含まれていることを確認
    const postCall = mockFetch.mock.calls[0];
    const body = JSON.parse(postCall[1].body);
    expect(body.data[3]).toBe(1.0);  // speed がクランプされている
  });

  it('PLACHTA_PRESETS は 9 個存在する', () => {
    expect(PLACHTA_PRESETS.length).toBe(9);
  });

  it('PLACHTA_PRESETS の各要素は speaker と language を持つ', () => {
    for (const preset of PLACHTA_PRESETS) {
      expect(preset.speaker).toBeTruthy();
      expect(['日本語', '简体中文', 'English', 'Mix']).toContain(preset.language);
    }
  });
});

describe('plachtaSpeakChunksPipelined (v0.10.0 パイプライン再生)', () => {
  /** 2 チャンク分の fetch シーケンス（join / SSE / wav × 2）を返す */
  function makeTwoChunkFetchSequence(): Array<unknown> {
    return [
      // chunk0
      { ok: true, json: async () => ({ event_id: 'e0' }) },
      makeSseResponse([
        { msg: 'process_completed', event_id: 'e0', output: { data: ['Success', { url: 'https://example.com/0.wav' }] } },
      ]),
      { ok: true, arrayBuffer: async () => new ArrayBuffer(100) },
      // chunk1
      { ok: true, json: async () => ({ event_id: 'e1' }) },
      makeSseResponse([
        { msg: 'process_completed', event_id: 'e1', output: { data: ['Success', { url: 'https://example.com/1.wav' }] } },
      ]),
      { ok: true, arrayBuffer: async () => new ArrayBuffer(100) },
    ];
  }

  it('TC-PL1: チャンク0 の再生中に チャンク1 の合成（4回目のfetch）が開始済みである', async () => {
    makeTwoChunkFetchSequence().forEach((r) => mockFetch.mockResolvedValueOnce(r));

    let playCount = 0;
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> {
        playCount++;
        if (playCount === 1) {
          // 1回目の再生時点で chunk1 の join POST（4回目の fetch）が開始済みのはず
          expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
        }
        this.onended();
        return Promise.resolve();
      }
    };

    const notice = vi.fn();
    const result = await plachtaSpeakChunksPipelined(
      ['あ'.repeat(140), 'い'.repeat(140)],
      makePlachtaSettings(),
      notice,
    );
    expect(result).toBe(true);
    expect(playCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('TC-PL2: チャンクを順に全再生し、全合成失敗時は false', async () => {
    makeTwoChunkFetchSequence().forEach((r) => mockFetch.mockResolvedValueOnce(r));
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onended(); return Promise.resolve(); }
    };

    const notice = vi.fn();
    const ok = await plachtaSpeakChunksPipelined(
      ['あ'.repeat(140), 'い'.repeat(140)],
      makePlachtaSettings(),
      notice,
    );
    expect(ok).toBe(true);

    // 失敗系: 1チャンク目が合成失敗（join HTTP 500）
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const bad = await plachtaSpeakChunksPipelined(
      ['あ'.repeat(140)],
      makePlachtaSettings(),
      notice,
    );
    expect(bad).toBe(false);
  });

  it('TC-PL3: チャンク0 再生失敗（onerror）で中断して false', async () => {
    makeTwoChunkFetchSequence().forEach((r) => mockFetch.mockResolvedValueOnce(r));
    (globalThis as unknown as { Audio: unknown }).Audio = class {
      src = '';
      onended: () => void = () => {};
      onerror: () => void = () => {};
      play(): Promise<void> { this.onerror(); return Promise.reject(new Error('play rejected')); }
    };

    const notice = vi.fn();
    const result = await plachtaSpeakChunksPipelined(
      ['あ'.repeat(140), 'い'.repeat(140)],
      makePlachtaSettings(),
      notice,
    );
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('再生'));
  });
});
