/**
 * v0.17.0: MD保存のパス解決・ファイル名・frontmatter・書込。
 * 書き込みは office 変換と同じ fs.promises 方式（Vault 内外どちらでも動作）。
 */
import type { App } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

export type SavedScope = 'pair' | 'conversation' | 'block';

export interface SaveResult { path: string; ok: boolean; message: string; }

export interface MessageMd { role: 'user' | 'assistant'; md: string; }

export function resolveFolder(vaultRoot: string, folder: string): string {
  // Windows では path.join が `\` を返すため、Obsidian 規約のフォワードスラッシュへ正規化（office VaultPath と同じ）
  const resolved = path.isAbsolute(folder) ? folder : path.join(vaultRoot, folder);
  const normalized = resolved.replace(/\\/g, '/');
  // ドライブルート（C:/）やファイルシステムルート（/）は末尾区切りを維持する。
  // 末尾を剥がすと `C:/` → `C:` になり drive-relative（CWD 相対）へ劣化するため。
  if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) return normalized;
  // path.join は末尾区切りを保持する（Windows: `Memory/` → `C:\vault\Memory\`）ため、フォルダパスとして整える
  return normalized.replace(/\/+$/, '');
}

export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 60);
}

export function buildFilename(now: Date, title: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const t = sanitizeTitle(title) || 'claudian-chat';
  return `${stamp}_${t}.md`;
}

export function buildFrontmatter(title: string, scope: SavedScope, created: string): string {
  return [
    '---',
    `title: ${sanitizeTitle(title) || 'claudian-chat'}`,
    'type: claudian-chat',
    `scope: ${scope}`,
    `created: ${created}`,
    'source: Claudian Chat',
    '---',
  ].join('\n');
}

export function composeBody(scope: SavedScope, messages: MessageMd[]): string {
  if (scope === 'block') return messages[0]?.md ?? '';
  if (scope === 'pair') {
    return messages.map((m) => (m.role === 'user' ? `## 質問\n\n${m.md}` : `## 回答\n\n${m.md}`)).join('\n\n');
  }
  return messages.map((m) => `### ${m.role === 'user' ? '👤 ユーザー' : '🤖 Claude'}\n\n${m.md}`).join('\n\n');
}

export function localDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function vaultRoot(app: App): string {
  const adapter = app.vault.adapter as { getBasePath?: () => string; basePath?: string };
  return adapter.getBasePath ? adapter.getBasePath() : (adapter.basePath ?? process.cwd());
}

/** 指定パスが存在するかどうか（ENOENT は「存在しない」として false） */
async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 同名ファイルが既に存在する場合、`-1`, `-2`, … を拡張子の前に付与して空き名を返す。
 * 設計 §8.2/§十一：同一分に複数保存で同名衝突 → 連番（HHMM 形式は維持）。
 */
async function uniquePath(base: string): Promise<string> {
  if (!(await fileExists(base))) return base;
  const dir = path.dirname(base);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, `${stem}-${i}${ext}`);
    if (!(await fileExists(candidate))) return candidate;
  }
}

export async function saveMarkdown(app: App, folder: string, scope: SavedScope, title: string, body: string): Promise<SaveResult> {
  try {
    const root = vaultRoot(app);
    const dirAbs = resolveFolder(root, folder);
    const abs = await uniquePath(path.join(dirAbs, buildFilename(new Date(), title)));
    await fs.promises.mkdir(dirAbs, { recursive: true });
    const content = `${buildFrontmatter(title, scope, localDateTime())}\n\n${body}\n`;
    await fs.promises.writeFile(abs, content, 'utf8');
    const rel = path.relative(root, abs).split(path.sep).join('/');
    return { path: rel || abs, ok: true, message: 'saved' };
  } catch (e) {
    return { path: folder, ok: false, message: String(e) };
  }
}
