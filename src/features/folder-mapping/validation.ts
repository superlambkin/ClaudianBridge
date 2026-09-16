import * as nodePath from 'path';
import type { FolderMapping } from './types';

/** F-049: linkName 正規表現
 *  - `u` フラグ必須（CJK サロゲートペア保護）
 *  - `/` `\` 制御文字 先頭ドット 末尾空白 は除外（正規表現に含まない）
 */
export const LINK_NAME_REGEX = /^[A-Za-z0-9_\-ぁ-んァ-ヴ一-鿿\s]{1,64}$/u;

/** 禁止 externalPath プレフィックス（Windows） */
const FORBIDDEN_WIN = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

/** 禁止 externalPath プレフィックス（POSIX・best-effort） */
const FORBIDDEN_POSIX = [
  '/.ssh',
  '/.aws',
  '/.gnupg',
];

function isForbiddenAbsolute(absPath: string): boolean {
  const list = process.platform === 'win32' ? FORBIDDEN_WIN : FORBIDDEN_POSIX;
  const normalized = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
  return list.some((p) => {
    const needle = process.platform === 'win32' ? p.toLowerCase() : p;
    return normalized === needle || normalized.startsWith(needle + (process.platform === 'win32' ? '\\' : '/'));
  });
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateLinkName(
  name: string,
  existing: FolderMapping[],
): ValidateResult {
  if (!name || !LINK_NAME_REGEX.test(name)) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (existing.some((m) => m.linkName === name)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true };
}

export type ValidateExternalPathResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'not_absolute' | 'null_byte' | 'circular' | 'forbidden_path' };

/** F-050: セグメント禁止文字（Windows 予約文字 + 制御文字） */
const SEGMENT_FORBIDDEN = /[<>:"|?*\u0000-\u001f]/;
/** F-050: 1 セグメント最大長 */
const MAX_SEGMENT_LEN = 64;

export type ValidateVaultSubpathResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: 'empty' | 'not_relative' | 'dot_folder' | 'forbidden_prefix' | 'invalid_segment' };

/** F-050: Vault 相対サブパス検証
 *  - `normalized` は常に `/` 区切りで返す（`nodePath.join` が Windows で両対応）
 */
export function validateVaultSubpath(
  subpath: string,
): ValidateVaultSubpathResult {
  let trimmed = (subpath ?? '').trim();
  // v0.52.1: F-049 legacy junction 名 `@10_Input/{linkName}` から
  // ユーザーがコピーして入力した場合の救済。先頭の @ を全て除去して再評価。
  // ただし中間セグメントの @ は禁止（後段の per-segment 検査で捕捉される）。
  trimmed = trimmed.replace(/^@+/, '');
  if (!trimmed || /^[\\/]+$/.test(trimmed)) return { ok: false, reason: 'empty' };
  if (nodePath.isAbsolute(trimmed)) return { ok: false, reason: 'not_relative' };
  // nodePath.normalize は .. を解決してしまうため、解決前の生セグメントでトラバース検出する
  if (trimmed.split(/[\\/]+/).some((seg) => seg === '..')) return { ok: false, reason: 'not_relative' };
  const normalized = nodePath.normalize(trimmed).replace(/\\/g, '/');
  for (const seg of normalized.split('/')) {
    if (seg.startsWith('.')) return { ok: false, reason: 'dot_folder' };
    if (seg.startsWith('@')) return { ok: false, reason: 'forbidden_prefix' };
    if (SEGMENT_FORBIDDEN.test(seg) || seg.length > MAX_SEGMENT_LEN) return { ok: false, reason: 'invalid_segment' };
  }
  return { ok: true, normalized };
}

export function validateExternalPath(
  p: string,
  vaultBasePath: string,
): ValidateExternalPathResult {
  if (!p || p.trim() === '') return { ok: false, reason: 'empty' };
  if (p.indexOf('\0') !== -1) return { ok: false, reason: 'null_byte' };
  if (!nodePath.isAbsolute(p)) return { ok: false, reason: 'not_absolute' };

  // Vault 自身・子孫検出
  const rel = nodePath.relative(vaultBasePath, p);
  if (rel === '' || (!rel.startsWith('..') && !nodePath.isAbsolute(rel))) {
    // Vault 自身 or Vault 内を指している
    return { ok: false, reason: 'circular' };
  }

  // Vault 祖先検出（rel が '..' で始まるが、外部ではなく Vault の親ディレクトリ）
  const sep = process.platform === 'win32' ? '\\' : '/';
  const normalize = (s: string) =>
    process.platform === 'win32' ? s.toLowerCase() : s;
  const normalizedVault = normalize(vaultBasePath);
  const normalizedP = normalize(p);
  if (
    normalizedVault === normalizedP ||
    normalizedVault.startsWith(normalizedP + sep)
  ) {
    return { ok: false, reason: 'circular' };
  }

  if (isForbiddenAbsolute(p)) return { ok: false, reason: 'forbidden_path' };
  return { ok: true };
}