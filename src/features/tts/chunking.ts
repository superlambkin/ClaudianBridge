/**
 * TTS チャンキングユーティリティ
 *
 * エンジン別の文字数制限（Plachta 1000 / WebSpeech ~250）に対応するため、
 * テキストを自然な区切り（句読点・改行）で分割する。
 * 「区切りまでの自然単位（atomic unit）」を max までパッキングすることで、
 * 長文でも API 呼び出し回数を最小化する。
 */

/** デフォルト区切り文字（日本語・英語の句読点 + 改行） */
export const DEFAULT_DELIMITERS = ['。', '！', '？', '.', '!', '?', '\n'];

/**
 * テキストを maxChunkSize 以下にチャンキングする。
 * 句読点・改行で区切った自然単位（unit = text + 後続 delimiter）を
 * maxChunkSize までパッキングし、それでも超える単位はハード分割する。
 */
export function chunkText(text: string, maxChunkSize: number, delimiters: string[] = DEFAULT_DELIMITERS): string[] {
  if (text.length <= maxChunkSize) return [text];
  if (maxChunkSize <= 0) return [text];

  const delimiterSet = new Set(delimiters);
  const chunks: string[] = [];
  let current = '';
  let unit = ''; // text + 後続 delimiter の自然な区切り単位

  // split-with-captures: text / delimiter が交互に並ぶ
  const segments = text.split(new RegExp(`([${delimiters.join('')}])`, 'g'));

  const flushUnit = (): void => {
    // 単位自体が max 超ならハード分割
    if (unit.length > maxChunkSize) {
      if (current.length > 0) { chunks.push(current); current = ''; }
      let rest = unit;
      while (rest.length > maxChunkSize) {
        chunks.push(rest.slice(0, maxChunkSize));
        rest = rest.slice(maxChunkSize);
      }
      unit = rest;
    }
    // current に足すと max 超なら current を確定
    if (current.length > 0 && current.length + unit.length > maxChunkSize) {
      chunks.push(current);
      current = '';
    }
    current += unit;
    unit = '';
  };

  for (const seg of segments) {
    if (seg.length === 0) continue;
    unit += seg;
    if (delimiterSet.has(seg)) flushUnit();
  }
  if (unit.length > 0) flushUnit();
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/**
 * チャンク配列を順に speak し、全チャンク成功で true を返す。
 * speakFn が false を返すか onCancel() が true を返したら中断して false。
 *
 * v0.31.0 (F-028): 各 chunk speak 直前に onChunkStart(idx) を呼ぶ（MD ハイライト連動用）。
 */
export async function speakChunks(
  chunks: string[],
  speakFn: (text: string) => Promise<boolean>,
  onCancel?: () => boolean,
  onChunkStart?: (idx: number) => void,
): Promise<boolean> {
  for (let i = 0; i < chunks.length; i++) {
    if (onCancel?.()) return false;
    onChunkStart?.(i);
    const ok = await speakFn(chunks[i]);
    if (!ok) return false;
  }
  return true;
}

/** 見出し行（markdown heading）の直前位置を検出する */
const HEADING_LINE_RE = /(^|\n)([ \t]{0,3}#{1,6} [^\n]*)/g;

/**
 * v0.35.0: 見出し行で強制新チャンクし、各セクションを既存 chunkText で
 * 文末（。！？\n 等）優先パックする。core.ts と md-file-read-flow.ts の
 * 両方から使用することでハイライト index の完全一致を維持する。
 */
export function chunkTextNatural(text: string, maxChunkSize: number): string[] {
  const sections: string[] = [];
  let last = 0;
  for (const m of text.matchAll(HEADING_LINE_RE)) {
    const at = (m.index ?? 0) + m[1].length;
    if (at > last) sections.push(text.slice(last, at));
    last = at;
  }
  if (sections.length === 0) return chunkText(text, maxChunkSize);
  sections.push(text.slice(last));
  const out: string[] = [];
  for (const s of sections) {
    const trimmed = s.replace(/^\n+|\n+$/g, '');
    if (trimmed) out.push(...chunkText(trimmed, maxChunkSize));
  }
  return out;
}
