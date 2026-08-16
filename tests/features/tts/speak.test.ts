// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { speakText, resolveSpeechFilter } from '../../../src/features/tts/speak';
import type { ClaudianBridgeSettings } from '../../../src/core/settings';
import { DEFAULT_SPEECH_FILTER_OPTIONS } from '../../../src/core/settings';

const addTextToTTS = vi.fn(async () => true);
vi.mock('../../../src/features/tts/core', () => ({
  addTextToTTS: (...a: unknown[]) => addTextToTTS(...a),
}));

// obsidian.Notice をモックして副作用（トースト表示）をアサートする
const { noticeMock } = vi.hoisted(() => ({ noticeMock: vi.fn() }));
vi.mock('obsidian', () => ({ Notice: noticeMock }));

function makeCfg(overrides?: Partial<ClaudianBridgeSettings['tts']>): ClaudianBridgeSettings {
  return {
    general: { enabled: true, migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false, claudeTtsSettings: false }, migrationResetAvailable: true, quotaEnabled: false, quotaRefreshSec: 60, quotaSwitchSec: 5, codeCopyFence: true },
    quota: {} as never,
    selection: {} as never,
    tts: {
      enabled: true,
      engine: 'edge',
      edgeTtsModulePath: '',
      voices: { edge: { zh: 'x', ja: 'n', en: 'a' }, webspeech: { zh: '', ja: '', en: '' } },
      chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
      speechFilter: {
        selection: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        autoRead: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        message: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
        inputAi: { ...DEFAULT_SPEECH_FILTER_OPTIONS },
      },
      ...overrides,
    },
    office: {} as never,
    whitelist: {} as never,
    chroma: {} as never,
  };
}

describe('resolveSpeechFilter', () => {
  it('md は selection を共有する', () => {
    const cfg = makeCfg();
    expect(resolveSpeechFilter(cfg, 'md')).toBe(cfg.tts.speechFilter.selection);
    expect(resolveSpeechFilter(cfg, 'message')).toBe(cfg.tts.speechFilter.message);
  });

  it('各タイプが対応するフィルタに自己マッピングされる', () => {
    const cfg = makeCfg();
    expect(resolveSpeechFilter(cfg, 'selection')).toBe(cfg.tts.speechFilter.selection);
    expect(resolveSpeechFilter(cfg, 'autoRead')).toBe(cfg.tts.speechFilter.autoRead);
    expect(resolveSpeechFilter(cfg, 'message')).toBe(cfg.tts.speechFilter.message);
    expect(resolveSpeechFilter(cfg, 'inputAi')).toBe(cfg.tts.speechFilter.inputAi);
    expect(resolveSpeechFilter(cfg, 'md')).toBe(cfg.tts.speechFilter.selection);
  });
});

describe('speakText', () => {
  beforeEach(() => { addTextToTTS.mockReset(); addTextToTTS.mockResolvedValue(true); noticeMock.mockClear(); });

  it('空テキスト時は noticeOnEmpty=true で Notice「入力がありません」を出し false を返す', async () => {
    const noticeSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await speakText('selection', '   ', makeCfg(), { noticeOnEmpty: true });
    expect(r).toBe(false);
    expect(noticeMock).toHaveBeenCalledWith('入力がありません');
    expect(addTextToTTS).not.toHaveBeenCalled();
    noticeSpy.mockRestore();
  });

  it('空テキスト時は noticeOnEmpty 無指定なら Notice を出さない', async () => {
    const r = await speakText('selection', '', makeCfg());
    expect(r).toBe(false);
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it('タイプ別フィルタを適用して addTextToTTS に渡す', async () => {
    const cfg = makeCfg();
    cfg.tts.speechFilter.selection.emoji = false;
    const r = await speakText('selection', '📢 完了', cfg);
    expect(r).toBe(true);
    expect(addTextToTTS).toHaveBeenCalledTimes(1);
    const text = addTextToTTS.mock.calls[0][1] as string;
    expect(text).not.toContain('📢');
  });

  it('chunkMaxChars を TtsSettings に含めて渡す（エンジン別オブジェクト）', async () => {
    await speakText('selection', 'テキスト', makeCfg());
    expect(addTextToTTS.mock.calls[0][2].chunkMaxChars).toEqual({ edge: 500, webspeech: 140, plachta: 140 });
  });

  it('失敗時（false）はエラー Notice「⚠️ 読み上げに失敗しました」を出す', async () => {
    addTextToTTS.mockResolvedValue(false);
    const r = await speakText('selection', 'テキスト', makeCfg(), {});
    expect(r).toBe(false);
    expect(noticeMock).toHaveBeenCalledWith('⚠️ 読み上げに失敗しました');
  });

  it('fallbackText 指定時は失敗後に元文で再試行する（⑤用）', async () => {
    addTextToTTS.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const r = await speakText('inputAi', '整形文', makeCfg(), { fallbackText: '元文' });
    expect(r).toBe(true);
    expect(addTextToTTS).toHaveBeenCalledTimes(2);
    expect(addTextToTTS.mock.calls[1][1]).toBe('元文');
  });

  it('フィルタ適用後が空なら読まず true を返す', async () => {
    const cfg = makeCfg();
    cfg.tts.speechFilter.selection.emoji = false;
    const r = await speakText('selection', ':tada:', cfg);
    expect(r).toBe(true);
    expect(addTextToTTS).not.toHaveBeenCalled();
  });
});
