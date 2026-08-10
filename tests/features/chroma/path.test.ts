import * as path from "path";
import { describe, it, expect } from 'vitest';
import { VaultPath, normalizePath, repairImeYen, resolveChromaPath, resolveScriptPath } from "../../../src/features/chroma/util/path";

describe('chroma/util/path', () => {
  it('VaultPath.absolute joins vault + rel', () => {
    const abs = VaultPath.absolute("C:/vault", "chroma_db");
    expect(abs.replace(/\\/g, "/")).toBe("C:/vault/chroma_db");
  });

  it('repairImeYen replaces ¥ with \\', () => {
    expect(repairImeYen("C:¥Users¥foo")).toBe("C:\\Users\\foo");
  });

  it('repairImeYen no-op on plain path', () => {
    expect(repairImeYen("C:\\Users\\foo")).toBe("C:\\Users\\foo");
  });

  it('normalizePath handles ¥ repair + cleanup', () => {
    const out = normalizePath("C:¥Users¥foo¥bar");
    expect(out).toBe(path.normalize("C:\\Users\\foo\\bar"));
  });

  it('resolveChromaPath relative → absolute', () => {
    const out = resolveChromaPath("chroma_db", "C:/vault");
    expect(out.replace(/\\/g, "/")).toBe("C:/vault/chroma_db");
  });

  it('resolveChromaPath absolute → preserved', () => {
    const abs = path.resolve("C:/elsewhere/chroma_db");
    expect(resolveChromaPath(abs, "C:/vault")).toBe(abs);
  });

  it('resolveChromaPath empty → empty', () => {
    expect(resolveChromaPath("", "C:/vault")).toBe("");
  });

  it('resolveChromaPath trims whitespace', () => {
    const out = resolveChromaPath("  chroma_db  ", "C:/vault");
    expect(out.replace(/\\/g, "/")).toBe("C:/vault/chroma_db");
  });

  it('resolveScriptPath empty → vault root + _chroma_inspect.py', () => {
    const out = resolveScriptPath("", "C:/vault");
    expect(out.replace(/\\/g, "/")).toBe("C:/vault/_chroma_inspect.py");
  });

  it('resolveScriptPath absolute override', () => {
    const abs = path.resolve("D:/scripts/chroma.py");
    expect(resolveScriptPath(abs, "C:/vault")).toBe(abs);
  });

  it('VaultPath.splitName basic', () => {
    const r = VaultPath.splitName("dir/file.docx");
    expect(r.dir).toBe("dir");
    expect(r.stem).toBe("file");
    expect(r.ext).toBe("docx");
  });

  it('VaultPath.sanitizeStem replaces illegal chars', () => {
    expect(VaultPath.sanitizeStem("a<b>c:d|e")).toBe("a_b_c_d_e");
  });
});
