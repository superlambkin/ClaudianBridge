import { describe, it, expect, beforeEach } from 'vitest';
import nodePath from 'path';
import { ShadowReconciler, matchesExclude } from './reconciler';

// In-memory FS stub mirroring F-049 pattern (manager.test.ts:6-37)
function makeFs() {
  const files = new Map<string, { type: 'file' | 'dir'; content?: string; mtimeMs: number }>();
  return {
    files,
    existsSync: (p: string) => files.has(p),
    statSync: (p: string) => {
      const f = files.get(p);
      if (!f) throw new Error(`ENOENT: ${p}`);
      return { isDirectory: () => f.type === 'dir', isFile: () => f.type === 'file', isSymbolicLink: () => false, mtimeMs: f.mtimeMs, size: f.content?.length ?? 0 };
    },
    readdirSync: (p: string) => {
      const prefix = p.endsWith('\\') ? p : p + '\\';
      const names = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          if (rest && !rest.includes('\\')) names.add(rest);
        }
      }
      return Array.from(names);
    },
    mkdirSync: (p: string) => {
      files.set(p.endsWith('\\') ? p : p + '\\', { type: 'dir', mtimeMs: 0 });
      files.set(p, { type: 'dir', mtimeMs: 0 });
    },
    copyFileSync: (src: string, dst: string) => {
      const f = files.get(src);
      if (!f) throw new Error(`ENOENT src: ${src}`);
      files.set(dst, { type: 'file', content: f.content, mtimeMs: f.mtimeMs });
    },
    rmSync: (p: string) => {
      const prefix = p.endsWith('\\') ? p : p + '\\';
      for (const k of Array.from(files.keys())) {
        if (k === p || k.startsWith(prefix)) files.delete(k);
      }
    },
    symlinkSync: () => {},
    watch: () => ({ on: () => {}, close: () => {} }),
  };
}

describe('matchesExclude', () => {
  it('matches simple glob', () => {
    expect(matchesExclude('foo.tmp', ['*.tmp'])).toBe(true);
  });
  it('does not match unrelated', () => {
    expect(matchesExclude('foo.md', ['*.tmp'])).toBe(false);
  });
  it('matches dotfiles', () => {
    expect(matchesExclude('.DS_Store', ['.DS_Store'])).toBe(true);
  });
});

describe('ShadowReconciler.syncAll', () => {
  let fs: ReturnType<typeof makeFs>;
  let reconciler: ShadowReconciler;

  beforeEach(() => {
    fs = makeFs();
    reconciler = new ShadowReconciler(fs as any);
    // Source: C:\NAS\OCR with 2 files
    fs.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    fs.files.set('C:\\NAS\\OCR\\a.md', { type: 'file', content: 'AAA', mtimeMs: 100 });
    fs.files.set('C:\\NAS\\OCR\\b.md', { type: 'file', content: 'BBB', mtimeMs: 200 });
    // Shadow: empty
    fs.files.set('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', { type: 'dir', mtimeMs: 0 });
  });

  it('copies all files from external to shadow', () => {
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', []);
    expect(r.copied).toBe(2);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\a.md')).toBe(true);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\b.md')).toBe(true);
  });

  it('skips excluded patterns', () => {
    fs.files.set('C:\\NAS\\OCR\\c.tmp', { type: 'file', content: 'TMP', mtimeMs: 300 });
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', ['*.tmp']);
    expect(r.copied).toBe(2);
    expect(r.skipped).toBe(1);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\c.tmp')).toBe(false);
  });

  it('recurses into subdirectories', () => {
    fs.files.set('C:\\NAS\\OCR\\sub', { type: 'dir', mtimeMs: 0 });
    fs.files.set('C:\\NAS\\OCR\\sub\\deep.md', { type: 'file', content: 'DEEP', mtimeMs: 400 });
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1', []);
    expect(r.copied).toBe(3);
    expect(fs.files.has('D:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\sub\\deep.md')).toBe(true);
  });
});

describe('ShadowReconciler.removeFromShadow', () => {
  it('removes existing shadow file', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    fs.files.set('D:\\shadow\\old.md', { type: 'file', content: 'X', mtimeMs: 0 });
    reconciler.removeFromShadow('D:\\shadow\\old.md');
    expect(fs.files.has('D:\\shadow\\old.md')).toBe(false);
  });

  it('does not throw if path missing', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    expect(() => reconciler.removeFromShadow('D:\\shadow\\nope.md')).not.toThrow();
  });
});
