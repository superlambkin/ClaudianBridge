import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * v0.38.0 (F-038): 文生図の Vault 保存ヘルパー。
 *
 * - buildFilename:  'text2img_YYYYMMDD_<hash>.{ext}'
 * - resolveAssetDir: <vaultRoot>/output/Assets (固定パス)
 * - uniqueAssetPath: 衝突時に -1, -2 を付与（src/features/memory/save.ts:80-93 パターンを踏襲）
 */

const ASSET_DIR = 'output/Assets';
const STEM = 'text2img';

function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function buildFilename(ext: 'png' | 'jpg' | 'jpeg', hash?: string, dateStr?: string): string {
  const d = dateStr ?? todayDateString();
  const hashPart = hash ? `_${hash.slice(0, 8)}` : '';
  return `${STEM}_${d}${hashPart}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

export function resolveAssetDir(vaultRoot: string): string {
  return path.join(vaultRoot, ASSET_DIR);
}

export async function uniqueAssetPath(dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem}-${counter}${ext}`);
      counter += 1;
    } catch {
      // Not exists → OK
      return candidate;
    }
  }
}

export interface WriteAssetResult {
  /** Vault 相対パス (例: 'output/Assets/text2img_20260907_abcd.jpg') */
  vaultRelativePath: string;
  /** 絶対パス */
  absolutePath: string;
}

/**
 * Vault に画像を書き込む。
 * @param vaultRoot Vault のルートパス（絶対パス）
 * @param bytes 画像バイト列
 * @param ext 拡張子
 * @param hash 任意のハッシュ文字列（ファイル名に含める）
 */
export async function writeAsset(
  vaultRoot: string,
  bytes: Uint8Array,
  ext: 'png' | 'jpg' | 'jpeg',
  hash?: string,
): Promise<WriteAssetResult> {
  const dir = resolveAssetDir(vaultRoot);
  await fs.mkdir(dir, { recursive: true });
  const filename = buildFilename(ext, hash);
  const absPath = await uniqueAssetPath(dir, filename);
  await fs.writeFile(absPath, bytes);
  // Vault 相対パス: ASSET_DIR + filename (or counter-suffixed)
  const finalName = path.basename(absPath);
  return {
    absolutePath: absPath,
    vaultRelativePath: path.posix.join(ASSET_DIR, finalName).replace(/\\/g, '/'),
  };
}
