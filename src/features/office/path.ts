import * as path from 'path';

export class VaultPath {
  static absolute(vault: string, rel: string): string {
    // Windows では path.join が `\` を返すため、Obsidian 規約のフォワードスラッシュへ正規化
    return path.join(vault, rel).replace(/\\/g, '/');
  }

  static splitName(p: string): { dir: string; stem: string; ext: string } {
    const dir = path.dirname(p);
    const base = path.basename(p);
    const dot = base.lastIndexOf('.');
    if (dot <= 0) {
      return { dir, stem: base, ext: '' };
    }
    return { dir, stem: base.slice(0, dot), ext: base.slice(dot + 1) };
  }

  static sanitizeStem(stem: string): string {
    const cleaned = stem.replace(/[\\/:*?"<>|]/g, '_');
    if (cleaned.length <= 120) return cleaned;
    return cleaned.slice(0, 120);
  }

  static outputPath(original: string, suffix = '', ext = 'md'): string {
    const { dir, stem } = VaultPath.splitName(original);
    // absolute と同様、Windows の `\` をフォワードスラッシュへ正規化
    return path.join(dir, `${stem}${suffix}.${ext}`).replace(/\\/g, '/');
  }
}
