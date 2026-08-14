/**
 * TTS チャンキングユーティリティ
 *
 * エンジン別の文字数制限（Plachta 1000 / WebSpeech ~250）に対応するため、
 * テキストを自然な区切り（句読点・改行）で分割する。
 */

/** デフォルト区切り文字（日本語・英語の句読点 + 改行） */
export const DEFAULT_DELIMITERS = ['。', '！', '？', '.', '!', '?', '\n'];

/**
 * テキストを maxChunkSize 以下にチャンキングする。
 * 句読点・改行を優先し、それでも超える場合は強制分割する。
 */
export function chunkText(text: string, maxChunkSize: number, delimiters: string[] = DEFAULT_DELIMITERS): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let current = '';
  // 文字クラス内では . ? ! 等はリテラル扱いのためエスケープ不要
  const segments = text.split(new RegExp(`([${delimiters.join('')}])`, 'g'));

  for (const seg of segments) {
    if (seg.length === 0) continue;

    if (current.length + seg.length > maxChunkSize) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      // セグメント自体が max 超ならハード分割
      let rest = seg;
      while (rest.length > maxChunkSize) {
        chunks.push(rest.slice(0, maxChunkSize));
        rest = rest.slice(maxChunkSize);
      }
      current = rest;
    } else {
      current += seg;
    }

    // 区切り文字で終わったらその場でチャンクを確定する
    if (delimiters.includes(current[current.length - 1])) {
      chunks.push(current);
      current = '';
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * チャンク配列を順に speak し、全チャンク成功で true を返す。
 * speakFn が false を返すか onCancel() が true を返したら中断して false。
 */
export async function speakChunks(
  chunks: string[],
  speakFn: (text: string) => Promise<boolean>,
  onCancel?: () => boolean,
): Promise<boolean> {
  for (const chunk of chunks) {
    if (onCancel?.()) return false;
    const ok = await speakFn(chunk);
    if (!ok) return false;
  }
  return true;
}
