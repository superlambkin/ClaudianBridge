/**
 * v0.17.0: 読み上げ文最適化（speech_filter）。
 * チェック=含めて読む。filter の各項目が false のとき該当要素を除去する。
 * （v0.12.1 の filterSpeechText を 8 項目設定に対応して分離・意味を反転）
 */
import type { SpeechFilterOptions } from '../../core/settings';

/** Emoji 主要 Unicode ブロック */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍⃣]+/gu;
/** 顔文字特徴文字 */
const KAOMOJI_CHARS = new Set('^_*;Tω∀ﾟД≧≦´`･・艸皿><▽'.split(''));
/** ASCII 表情 */
const ASCII_EMOTICON_RE = /(?<![\w])(?::-?[)DdPp]+|;-?[)DdPp]|X-?[Dd]|<3+|>:\(?)(?![\w])/g;
/** Emoji 短コード :smile: */
const SHORTCODE_RE = /:[a-z0-9_+\-]{2,}:/g;
/** 空になった括弧対 */
const EMPTY_PAREN_RE = /[(（]\s*[)）]/g;
/** v0.18.1: ツール呼び出し行 [Tool Name input: ...] を除去（DOM 除外の保険） */
const TOOL_CALL_LINE_RE = /^\[Tool [^\n]+\]\s*$/gm;

function stripKaomoji(text: string): string {
  return text.replace(/[(（]([^()（）]*)[)）]/g, (m, inner: string) => {
    const count = [...inner].filter((ch) => KAOMOJI_CHARS.has(ch)).length;
    return count >= 2 ? ' ' : m;
  });
}

/** filter の各項目: true=読む（除去しない）/ false=除去する */
export function filterSpeechText(text: string, filter: Partial<SpeechFilterOptions>): string {
  let t = text;
  if (filter.emoji === false) t = t.replace(EMOJI_RE, ' ');
  if (filter.kaomoji === false) t = stripKaomoji(t);
  if (filter.ascii_emoticon === false) t = t.replace(ASCII_EMOTICON_RE, ' ');
  if (filter.emoji_shortcode === false) t = t.replace(SHORTCODE_RE, ' ');
  if (filter.toolCommands === false) t = t.replace(TOOL_CALL_LINE_RE, ' ');
  t = t.replace(EMPTY_PAREN_RE, '');
  // 除去で生じた前後の空白を除去（brief テスト: 'OK (^_^)' → 'OK' など）
  return t.trim();
}
