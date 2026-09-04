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
  const lines = md.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  const isSeparator = (l: string): boolean => /^\|[\s:\-|]+\|$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (isSeparator(lines[i])) continue;
    // 区切り行の直前の行はヘッダ（見出し行）なのでスキップ
    if (i + 1 < lines.length && isSeparator(lines[i + 1])) continue;
    const cells = lines[i].split('|').map((c) => c.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 2) continue;
    const term = cells[0];
    const gloss = cells[1];
    if (term === '' || gloss === '') continue; // v0.37.1 (M5): 空語釈は無視
    map.set(term, gloss);
  }
}

function parseBulletList(md: string, map: Map<string, string>): void {
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+(.+?)\s*[→➡]\s*(.+)$/); // v0.37.1: 複合語対応（語尾まで取得）
    if (m) {
      const gloss = m[2].trim();
      if (gloss === '') continue;
      map.set(m[1].trim(), gloss);
    }
  }
}
