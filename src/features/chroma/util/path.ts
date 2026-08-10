// src/features/chroma/util/path.ts — Path helpers specialized for chroma-inspector.
//
// Reuses the same `VaultPath` style as vault-office-bridge and adds:
//   - repairImeYen()       : repair full-width ¥ (U+00A5) → ASCII \ (U+005C)
//   - normalizePath()      : handle trailing/duplicated slashes and IME issues
//   - resolveChromaPath()  : combine VaultPath + repair for the chromaPath setting

import * as path from "path";

/** Japanese-IME yen-sign (U+00A5) — common Windows path-breakage source. */
const IME_YEN = "¥";

export class VaultPath {
  /** Vault root + Vault-relative path → absolute path. */
  static absolute(vault: string, rel: string): string {
    return path.join(vault, rel);
  }

  /** Path components. */
  static splitName(p: string): { dir: string; stem: string; ext: string } {
    const dir = path.dirname(p);
    const base = path.basename(p);
    const dot = base.lastIndexOf(".");
    if (dot <= 0) {
      return { dir, stem: base, ext: "" };
    }
    return { dir, stem: base.slice(0, dot), ext: base.slice(dot + 1) };
  }

  /** Replace illegal filename chars and truncate to 120 chars. */
  static sanitizeStem(stem: string): string {
    const cleaned = stem.replace(/[\\/:*?"<>|]/g, "_");
    if (cleaned.length <= 120) return cleaned;
    return cleaned.slice(0, 120);
  }

  /** Compose `${stem}${suffix}.${ext}` next to original. */
  static outputPath(original: string, suffix = "", ext = "md"): string {
    const { dir, stem } = VaultPath.splitName(original);
    return path.join(dir, `${stem}${suffix}.${ext}`);
  }
}

/** Replace U+00A5 with U+005C — repair Japanese-IME-pasted paths. */
export function repairImeYen(p: string): string {
  if (!p) return p;
  return p.split(IME_YEN).join("\\");
}

/** Apply Windows-friendly normalization (no-op for pure POSIX). */
export function normalizePath(p: string): string {
  if (!p) return p;
  const repaired = repairImeYen(p);
  // Don't mangle UNC paths or already-canonical paths.
  return path.normalize(repaired);
}

/**
 * Resolve the chromaPath setting into an absolute path.
 * - Empty / undefined → empty string (caller decides)
 * - Absolute → returned (after repair + normalize)
 * - Vault-relative → joined with vaultRoot
 */
export function resolveChromaPath(chromaPath: string, vaultRoot: string): string {
  const cleaned = (chromaPath ?? "").trim();
  if (!cleaned) return "";
  const repaired = repairImeYen(cleaned);
  if (path.isAbsolute(repaired)) return path.normalize(repaired);
  return path.normalize(path.join(vaultRoot, repaired));
}

/** Locate the Python script in the Vault root (or override path). */
export function resolveScriptPath(scriptPath: string, vaultRoot: string): string {
  const cleaned = (scriptPath ?? "").trim();
  const repaired = repairImeYen(cleaned);
  if (!repaired) {
    return path.join(vaultRoot, "_chroma_inspect.py");
  }
  if (path.isAbsolute(repaired)) return path.normalize(repaired);
  return path.normalize(path.join(vaultRoot, repaired));
}
