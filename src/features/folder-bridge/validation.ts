import nodePath from 'path';

const SEGMENT_FORBIDDEN = /[\u0000]/;

export function validateExternalPath(p: string):
  | { ok: true; normalized: string }
  | { ok: false; reason: 'empty' | 'not_absolute' } {
  const trimmed = (p ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  // UNC path \\server\share or Windows absolute C:\
  const isUnc = /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
  const isWinAbs = /^[A-Z]:[\\/]/i.test(trimmed);
  if (!isUnc && !isWinAbs) return { ok: false, reason: 'not_absolute' };
  return { ok: true, normalized: trimmed };
}

export function validateExcludePatterns(arr: unknown):
  | { ok: true; normalized: string[] }
  | { ok: false; reason: 'not_array' | 'invalid_glob' } {
  if (!Array.isArray(arr)) return { ok: false, reason: 'not_array' };
  const normalized: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') return { ok: false, reason: 'invalid_glob' };
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (SEGMENT_FORBIDDEN.test(trimmed)) return { ok: false, reason: 'invalid_glob' };
    normalized.push(trimmed);
  }
  return { ok: true, normalized };
}

export function validateShadowPath(p: string, vaultBase: string):
  | { ok: true; normalized: string }
  | { ok: false; reason: 'empty' | 'absolute_outside_vault' | 'not_relative' } {
  const trimmed = (p ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (nodePath.isAbsolute(trimmed)) {
    // Allow only if inside vault
    const rel = nodePath.relative(vaultBase, trimmed);
    if (rel.startsWith('..') || nodePath.isAbsolute(rel)) {
      return { ok: false, reason: 'absolute_outside_vault' };
    }
  }
  const normalized = nodePath.normalize(trimmed).replace(/\\/g, '/');
  if (normalized.split('/').some((seg) => seg === '..')) {
    return { ok: false, reason: 'not_relative' };
  }
  return { ok: true, normalized };
}

export function computeDefaultShadowPath(vaultBase: string, id: string): string {
  return nodePath.join(vaultBase, '.obsidian', 'cache', 'folder-bridge', id);
}
