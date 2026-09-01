import type { MdReadChunkAnchor } from './types';

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

/**
 * rawMd + filteredText から MdReadChunkAnchor[] を構築する。
 * chunkMaxChars で chunk 分割、各 chunk の anchor を生成、heading level を解決。
 */
export function buildChunks(
  rawMd: string,
  filteredText: string,
  chunkMaxChars: number
): MdReadChunkAnchor[] {
  const rawLines = rawMd.split(/\r?\n/);
  const filteredLines = filteredText.split(/\r?\n/);
  // chunk はフィルタ後テキストで分割
  const chunks: { text: string; startLine: number }[] = [];
  let buf = '';
  let bufStartLine = 0;
  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i];
    const rawLine = rawLines[i] ?? '';
    const isHeading = HEADING_RE.test(rawLine);

    // 見出し行が出たら現在のバッファを確定（見出しで新チャンク開始）
    if (isHeading && buf.length > 0) {
      chunks.push({ text: buf.trim(), startLine: bufStartLine });
      buf = '';
      bufStartLine = i;
    }

    // 追加で chunkMaxChars を超えるなら現在のバッファを確定
    const sep = buf.length > 0 ? 1 : 0;
    if (buf.length + sep + line.length > chunkMaxChars && buf.length > 0) {
      chunks.push({ text: buf.trim(), startLine: bufStartLine });
      buf = '';
      bufStartLine = i;
    }

    // 単一行が chunkMaxChars を超える場合はハード分割
    if (line.length > chunkMaxChars) {
      if (buf.length > 0) {
        chunks.push({ text: buf.trim(), startLine: bufStartLine });
        buf = '';
      }
      let rest = line;
      while (rest.length > chunkMaxChars) {
        chunks.push({ text: rest.slice(0, chunkMaxChars), startLine: i });
        rest = rest.slice(chunkMaxChars);
      }
      buf = rest;
      bufStartLine = i;
      continue;
    }

    if (buf.length > 0) buf += '\n';
    buf += line;
    if (buf.length === line.length) bufStartLine = i;
  }
  if (buf.trim().length > 0) {
    chunks.push({ text: buf.trim(), startLine: bufStartLine });
  }

  // 各チャンクの anchor + heading level 解決
  return chunks.map((c, idx) => {
    // anchor: テキスト先頭の改行があればそこまで（>=12 文字時）、無ければ先頭 20 文字
    const newlineIdx = c.text.indexOf('\n');
    const anchorText =
      newlineIdx >= 12
        ? c.text.slice(0, newlineIdx)
        : c.text.slice(0, Math.min(20, c.text.length));
    // 直近の heading level を raw MD で逆算
    let level: 0 | 1 | 2 | 3 = 0;
    for (let l = c.startLine; l >= 0; l--) {
      const m = rawLines[l]?.match(HEADING_RE);
      if (m) {
        const n = m[1].length as 1 | 2 | 3;
        level = n;
        break;
      }
    }
    return {
      index: idx,
      startLine: c.startLine,
      anchor: anchorText,
      text: c.text,
      headingLevel: level,
    };
  });
}
