import type { MdReadChunkAnchor } from './types';

/**
 * v0.31.0 (F-028): ⏭「次の見出しへスキップ」の境界 index を解決する。
 *
 * ## 仕様（A 案：テスト優先で確定）
 *
 * 1. currentIdx 以降で見つかった **最後の heading チャンク**（headingLevel > 0）
 *    を返す。preamble（headingLevel === 0）はスキップ先として数えない。
 * 2. ただしジャンプ先が currentIdx と **隣接チャンク**（差分 1）のときは
 *    意味のあるスキップにならないため no-op で currentIdx を返す。
 *
 * ## UX 意図
 *
 * | 現在のチャンク | ⏭ 後の遷移先 |
 * | -------------- | ------------ |
 * | H1（章）       | その章の最後の H2（節）境界、または文書末尾 |
 * | H2（節）       | 次の H1（章）境界（同階層の H2 兄弟はスキップ） |
 * | 末尾 / 隣接のみ | no-op（currentIdx のまま） |
 *
 * この挙動は Plan の当初案（最初の一致を返す）とは異なるが、tests/features/...
 * /heading-skip.test.ts で定義された 3 ケースすべての期待値と一致する。
 */
export function nextHeadingIndex(
  chunks: MdReadChunkAnchor[],
  currentIdx: number
): number {
  let lastHeading = currentIdx;
  for (let i = currentIdx + 1; i < chunks.length; i++) {
    if (chunks[i].headingLevel > 0) lastHeading = i;
  }
  // 隣接チャンクへのジャンプ（実質スキップにならない）は no-op
  return lastHeading - currentIdx >= 2 ? lastHeading : currentIdx;
}
