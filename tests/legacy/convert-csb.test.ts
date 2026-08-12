import { describe, it, expect } from 'vitest';
import { convertFromClaudianSelectionBridge } from '../../src/legacy/convert-csb';

describe('convertFromClaudianSelectionBridge', () => {
  it('null 入力 → null', () => {
    expect(convertFromClaudianSelectionBridge(null)).toBeNull();
  });
  it('期待される形式を返す（v0.6.0: engine→edge, voices ネスト化, minimax 廃止）', () => {
    const raw = {
      enabled: true,
      delayMs: 500,
      tts: {
        engine: 'claudetts',
        voices: { zh: 'zh-voice', ja: 'ja-voice', en: 'en-voice' },
        minimax: { enabled: true, apiKey: 'k', voiceIdZh: 'Z', voiceIdJa: 'J', voiceIdEn: 'E', speed: 1.2, vol: 1, pitch: 0, audioFormat: 'mp3', showInEngineList: true },
        voice: '',
      },
    };
    const result = convertFromClaudianSelectionBridge(raw);
    expect(result).toMatchObject({
      selection: { enabled: true, folderEnabled: true, delayMs: 500 },
      tts: {
        engine: 'edge',  // 'claudetts' は非対応エンジン → 'edge' にフォールバック
        voices: {
          edge:      { zh: 'zh-voice', ja: 'ja-voice', en: 'en-voice' },  // 平型 → ネスト edge へ
          webspeech: { zh: '',         ja: '',         en: '' },          // 新規
        },
      },
    });
    // minimax と voice フィールドは存在しない
    expect(result?.tts).not.toHaveProperty('minimax');
    expect(result?.tts).not.toHaveProperty('voice');
  });

  it('webspeech engine はそのまま保持される', () => {
    const raw = {
      tts: {
        engine: 'webspeech',
        voices: { zh: '', ja: '', en: '' },
      },
    };
    const result = convertFromClaudianSelectionBridge(raw);
    expect(result?.tts.engine).toBe('webspeech');
  });
});
