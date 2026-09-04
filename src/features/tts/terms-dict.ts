/**
 * v0.36.0 (F-032): 用語辞書ローダ。
 * 指定パスの MD を読み、テーブル（| 用語 | 表現 |）または箇条書き
 * （- 用語 → 表現）から「用語 → やさしい表現」Map を返す。
 * パスが空・ファイル不在の場合は空 Map（エラー扱いしない）。
 */
import type { App, TFile } from 'obsidian';

export async function loadTermsDict(app: App, filePath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!filePath || !app?.vault) return map;
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) return map;
  try {
    const content = await app.vault.cachedRead(file as TFile);
    parseTable(content, map);
    parseBulletList(content, map);
  } catch {
    // 読み取り失敗は空 Map で黙容（読み上げ継続を優先）
  }
  return map;
}

function parseTable(md: string, map: Map<string, string>): void {
  for (const row of md.split('\n')) {
    const line = row.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // 先頭・末尾の空要素（| の外側）を除去
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 2) continue;
    // 区切り行（--- など）はスキップ
    if (/^[-:\s]+$/.test(cells[0])) continue;
    map.set(cells[0], cells[1]);
  }
}

function parseBulletList(md: string, map: Map<string, string>): void {
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+(\S+)\s*[→➡]\s*(.+)$/);
    if (m) map.set(m[1], m[2].trim());
  }
}
