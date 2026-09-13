/**
 * CHANGELOG.md パーサー（pure 関数のみ・Obsidian 依存なし）
 *
 * 対応形式（リポジトリ直下 CHANGELOG.md 実物に準拠）:
 *
 *   ## [0.38.0] - 2026-09-07 — 選択ポップアップ位置設定（F-032）
 *
 *   ### Added
 *
 *   - 項目 A
 *   - 項目 B
 *
 *   ### Changed
 *   - 項目 C
 *
 * 旧エントリ（v0.12.x 以前）は「— タイトル」が無い場合があるため title は空文字。
 */

export interface ChangelogSection {
  name: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  sections: ChangelogSection[];
}

/** `## [X.Y.Z] - YYYY-MM-DD — タイトル`（タイトルは任意・セパレータは - と — / ‐ 等の揺れを許容） */
const VERSION_HEADING_RE = /^##\s*\[([0-9]+\.[0-9]+\.[0-9]+[^\]]*)\]\s*-\s*(\d{4}-\d{2}-\d{2})(?:\s*[—–-]\s*(.*))?$/;

/** `### Added` 等のセクション見出し */
const SECTION_HEADING_RE = /^###\s+(.+)$/;

/** 箇条書き（`- ` / `* ` / `+ `） */
const ITEM_RE = /^[-*+]\s+(.+)$/;

/**
 * CHANGELOG.md の Markdown テキストをエントリ配列へパースする。
 * 不正入力（null 相当の空文字・形式不備のみのテキスト）は空配列を返す。
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  if (typeof md !== 'string' || md.trim() === '') return [];

  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const versionMatch = VERSION_HEADING_RE.exec(line);
    if (versionMatch) {
      current = {
        version: versionMatch[1],
        date: versionMatch[2],
        title: (versionMatch[3] ?? '').trim(),
        sections: [],
      };
      entries.push(current);
      currentSection = null;
      continue;
    }

    if (!current) continue;

    const sectionMatch = SECTION_HEADING_RE.exec(line);
    if (sectionMatch) {
      currentSection = { name: sectionMatch[1].trim(), items: [] };
      current.sections.push(currentSection);
      continue;
    }

    const itemMatch = ITEM_RE.exec(line.trim());
    if (itemMatch) {
      if (!currentSection) {
        currentSection = { name: 'その他', items: [] };
        current.sections.push(currentSection);
      }
      currentSection.items.push(itemMatch[1].trim());
    }
  }

  return entries;
}
