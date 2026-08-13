import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  plachtaTtsSpeak,
  PLACHTA_DEFAULT_SPEAKER,
  PLACHTA_PRESETS,
  type PlachtaSettings,
} from '../../../src/features/tts/plachta-tts';
import type { TtsSettings } from '../../../src/features/tts/core';

// グローバル fetch のモック
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

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

  it('TC-P01: fetch 成功: event_id 取得 → poll → wav URL → fetch → resolve(true)', async () => {
    // POST /call/tts_fn → event_id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc123' }),
    });
    // GET /results (1回目: 処理中)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [null, null] }),
    });
    // GET /results (2回目: 完了)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ['ok', 'https://example.com/out.wav'] }),
    });
    // GET wav URL
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
  });

  it('TC-P03: poll 60 回タイムアウトで resolve(false) + Timeout Notice', async () => {
    // 60 秒の setTimeout ループを高速化するため fake timers を使用
    // （vitest デフォルト 5s timeout で現実時間待たないため）
    vi.useFakeTimers();
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ event_id: 'abc' }),
      });
      // poll は毎回 [null, null]
      for (let i = 0; i < 60; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [null, null] }),
        });
      }

      const notice = vi.fn();
      const promise = plachtaTtsSpeak('こんにちは', makePlachtaSettings(), notice);
      // 60 秒 + 余裕で 65_000ms 進める（全 setTimeout を発火させる）
      await vi.advanceTimersByTimeAsync(65_000);
      const result = await promise;
      expect(result).toBe(false);
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('タイムアウト'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('TC-P04: POST /call/tts_fn が HTTP 500 → resolve(false) + HTTP 500 Notice', async () => {
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

  it('TC-P07: text が 1001 文字 → resolve(false) + too-long Notice', async () => {
    const notice = vi.fn();
    const longText = 'あ'.repeat(1001);
    const result = await plachtaTtsSpeak(longText, makePlachtaSettings(), notice);
    expect(result).toBe(false);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('長い'));
  });

  it('TC-P08: speaker が空文字 → defaults で補完され resolve(true)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: 'abc' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ['ok', 'https://example.com/out.wav'] }),
    });
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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ['ok', 'https://example.com/out.wav'] }),
    });
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
