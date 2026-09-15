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