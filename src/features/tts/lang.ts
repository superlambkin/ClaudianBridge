/**
 * v0.20.0: テキスト言語判定。
 * core.ts の pickWebSpeechLang を分離（edge-tts-local と共用のため）。
 */

import type { TtsLanguageMode } from '../../core/settings';

/** v0.27.1: TTS 言語コード型（pickLang / pickWebSpeechLang の戻り値・resolveTtsLang の受け渡しに使用） */
export type TtsLang = 'zh' | 'ja' | 'en';

/** Detect a likely IETF language code for the given text (best-effort). */
export function pickWebSpeechLang(text: string): TtsLang {
  const counts = { kana: 0, cjk: 0, latin: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x309f) counts.kana++; // hiragana
    else if (cp >= 0x30a0 && cp <= 0x30ff) counts.kana++; // katakana
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.cjk++; // CJK ideographs
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) counts.latin++;
  }
  // v0.27.3: かな（ひらがな/カタカナ）は中国語で使用されないため、1 文字でも存在すれば ja。
  // 旧ロジック（kana > cjk で ja）は漢字多めの通常の日本語文を zh に誤判定していた。
  if (counts.kana > 0) return 'ja';
  if (counts.cjk > counts.latin) return 'zh';
  return 'en';
}

/** v0.27.0: 言語モードに応じた言語を解決 */
export function pickLang(text: string, mode: TtsLanguageMode): TtsLang {
  if (mode === 'auto') return pickWebSpeechLang(text);
  return mode;
}
