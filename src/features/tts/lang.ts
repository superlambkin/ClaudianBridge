/**
 * v0.20.0: テキスト言語判定。
 * core.ts の pickWebSpeechLang を分離（edge-tts-local と共用のため）。
 */

/** Detect a likely IETF language code for the given text (best-effort). */
export function pickWebSpeechLang(text: string): 'zh' | 'ja' | 'en' {
  const counts = { kana: 0, cjk: 0, latin: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x309f) counts.kana++; // hiragana
    else if (cp >= 0x30a0 && cp <= 0x30ff) counts.kana++; // katakana
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.cjk++; // CJK ideographs
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) counts.latin++;
  }
  if (counts.kana > 0 || counts.cjk > counts.latin) return counts.kana > counts.cjk ? 'ja' : 'zh';
  return 'en';
}
