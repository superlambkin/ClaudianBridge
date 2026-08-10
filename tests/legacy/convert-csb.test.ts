import { describe, it, expect } from 'vitest';
import { convertFromClaudianSelectionBridge } from '../../src/legacy/convert-csb';

describe('convertFromClaudianSelectionBridge', () => {
  it('null 入力 → null', () => {
    expect(convertFromClaudianSelectionBridge(null)).toBeNull();
  });
  it('期待される形式を返す', () => {
    const raw = {
      enabled: true,
      delayMs: 500,
      tts: {
        engine: 'claudetts',
        voices: { zh: 'zh-voice', ja: '', en: '' },
        minimax: { enabled: true, apiKey: 'k', voiceIdZh: 'Z', voiceIdJa: 'J', voiceIdEn: 'E', speed: 1.2, vol: 1, pitch: 0, audioFormat: 'mp3', showInEngineList: true },
        voice: '',
      },
    };
    const result = convertFromClaudianSelectionBridge(raw);
    expect(result).toMatchObject({
      selection: { enabled: true, folderEnabled: true, delayMs: 500 },
      tts: { engine: 'claudetts', voices: { zh: 'zh-voice' }, minimax: { apiKey: 'k' } },
    });
  });
});
