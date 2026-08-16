/**
 * v0.17.0: 共通読み上げエントリ関数。
 * 全エントリポイント（選択/自動/メッセージ/AI/MD）が speakText を呼ぶ。
 * 空チェック・タイプ別フィルタ・失敗 Notice・フォールバックを一元化。
 */
import { Notice } from 'obsidian';
import type { ClaudianBridgeSettings, SpeechFilterOptions } from '../../core/settings';
import type { TtsSettings } from './core';
import { addTextToTTS } from './core';
import { filterSpeechText } from './speech-filter';

export type TtsReadType = 'selection' | 'autoRead' | 'message' | 'inputAi' | 'md';

export interface SpeakTextOpts {
  /** 空テキスト時に Notice「入力がありません」を出すか（②は対象なしスキップのため false） */
  noticeOnEmpty?: boolean;
  /** 失敗時に再試行する元テキスト（⑤AI のみ使用） */
  fallbackText?: string;
}

/** 読み上げタイプ → フィルタ設定を解決。md は selection を共有（設計書 7 章） */
export function resolveSpeechFilter(cfg: ClaudianBridgeSettings, type: TtsReadType): SpeechFilterOptions {
  switch (type) {
    case 'selection': return cfg.tts.speechFilter.selection;
    case 'autoRead': return cfg.tts.speechFilter.autoRead;
    case 'message': return cfg.tts.speechFilter.message;
    case 'inputAi': return cfg.tts.speechFilter.inputAi;
    case 'md': return cfg.tts.speechFilter.selection;
  }
}

function toTtsSettings(cfg: ClaudianBridgeSettings): TtsSettings {
  return {
    engine: cfg.tts.engine,
    voices: cfg.tts.voices,
    plachta: cfg.tts.plachta,
    cli: cfg.tts.cli,
    chunkMaxChars: cfg.tts.chunkMaxChars,
  };
}

export async function speakText(
  type: TtsReadType,
  text: string,
  cfg: ClaudianBridgeSettings,
  opts?: SpeakTextOpts,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    if (opts?.noticeOnEmpty) new Notice('入力がありません');
    return false;
  }

  const filter = resolveSpeechFilter(cfg, type);
  const optimized = filterSpeechText(trimmed, filter);
  if (!optimized.trim()) return true; // フィルタ後空なら読まない（エラー扱いしない）

  const settings = toTtsSettings(cfg);
  const ok = await addTextToTTS(null, optimized, settings);
  if (ok) return true;

  // 失敗時: fallbackText があれば元文で再試行（⑤）、なければエラー Notice
  if (opts?.fallbackText && opts.fallbackText.trim() !== '') {
    return addTextToTTS(null, opts.fallbackText.trim(), settings);
  }
  new Notice('⚠️ 読み上げに失敗しました');
  return false;
}
