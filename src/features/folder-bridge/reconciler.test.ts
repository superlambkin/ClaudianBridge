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
      if (!f) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
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
      if (!f) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, copyfile '${src}' -> '${dst}'`);
        err.code = 'ENOENT';
        throw err;
      }
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

// === v0.53.2 (F-054): Bridge sync ENOENT 救済 ===
// 症状: ユーザーが bridge を無効→有効にした瞬間、syncAll の readdir 後に
//       NAS 上のファイルが消失（切断・手動削除・chokidar 競合）すると、
//       copyFileSync が ENOENT を投げ、applyOne が throw → ブリッジが
//       'error' 状態になり Notice で「DIR_EXENT: no such file or directory」が
//       表示される。本テストは per-file ENOENT をスキップして他のファイルを
//       継続同期できることを確認する回帰テスト。
describe('ShadowReconciler.syncAll - ENOENT tolerance (v0.53.2)', () => {
  it('continues sync when one file disappears between readdir and copyFile', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    // Source: 3 files (a, b, c)
    fs.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    fs.files.set('C:\\NAS\\OCR\\a.md', { type: 'file', content: 'AAA', mtimeMs: 100 });
    fs.files.set('C:\\NAS\\OCR\\b.md', { type: 'file', content: 'BBB', mtimeMs: 200 });
    fs.files.set('C:\\NAS\\OCR\\c.md', { type: 'file', content: 'CCC', mtimeMs: 300 });
    fs.files.set('D:\\shadow', { type: 'dir', mtimeMs: 0 });

    // Race: b.md disappears between readdir and copyFile
    const origCopyFileSync = fs.copyFileSync;
    let copyCalls = 0;
    fs.copyFileSync = (src: string, dst: string) => {
      copyCalls++;
      if (src === 'C:\\NAS\\OCR\\b.md') {
        // simulate file gone (NAS disconnect / race)
        fs.files.delete('C:\\NAS\\OCR\\b.md');
        const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, copyfile '${src}' -> '${dst}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return origCopyFileSync(src, dst);
    };

    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\shadow', []);

    // a.md and c.md copied; b.md skipped (ENOENT)
    expect(r.copied).toBe(2);
    expect(fs.files.has('D:\\shadow\\a.md')).toBe(true);
    expect(fs.files.has('D:\\shadow\\b.md')).toBe(false);
    expect(fs.files.has('D:\\shadow\\c.md')).toBe(true);
    expect(copyCalls).toBe(3); // we attempted all 3
  });

  it('does not throw if the source directory itself is missing (broken junction)', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    // Source dir does NOT exist
    expect(() =>
      reconciler.syncAll('C:\\NAS\\OFFLINE', 'D:\\shadow', []),
    ).not.toThrow();
  });

  it('syncOne skips a single file that disappears (chokidar race)', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    fs.files.set('C:\\NAS\\OCR\\ghost.md', { type: 'file', content: 'X', mtimeMs: 100 });
    fs.files.set('D:\\shadow', { type: 'dir', mtimeMs: 0 });
    // Now delete before syncOne is called
    fs.files.delete('C:\\NAS\\OCR\\ghost.md');
    expect(() =>
      reconciler.syncOne('C:\\NAS\\OCR\\ghost.md', 'D:\\shadow\\ghost.md', []),
    ).not.toThrow();
  });
});

// === v0.53.3 (F-055): syncAll iteration limit (cycle prevention) ===
// 症状: ユーザーがブリッジを有効→無効→有効トグルした際、Obsidianが永続的に
//       固まる（タスクキル必要）。NAS が小さい（数十ファイル）にも関わらず
//       固まることから、syncAll のキューが無限に膨張する cycle バグの可能性。
//       → 最大反復回数の上限を追加して無限ループを根絶する。
describe('ShadowReconciler.syncAll - iteration limit (v0.53.3)', () => {
  it('caps syncAll to MAX_ITERATIONS to prevent runaway recursion', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    // Pathological fs that always returns an infinite-growing queue.
    // readdir always returns ['x']; stat says it's a directory.
    fs.readdirSync = () => ['x'];
    fs.statSync = () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, mtimeMs: 0, size: 0 });
    fs.files.set('C:\\NAS\\infinite', { type: 'dir', mtimeMs: 0 });
    fs.files.set('D:\\shadow', { type: 'dir', mtimeMs: 0 });

    expect(() =>
      reconciler.syncAll('C:\\NAS\\infinite', 'D:\\shadow', []),
    ).toThrow(/iteration limit/i);
  });

  it('MAX_ITERATIONS is generous enough for normal NAS (hundreds of files)', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    fs.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    for (let i = 0; i < 100; i++) {
      fs.files.set(`C:\\NAS\\OCR\\file${i}.md`, { type: 'file', content: `c${i}`, mtimeMs: i });
    }
    fs.files.set('D:\\shadow', { type: 'dir', mtimeMs: 0 });
    const r = reconciler.syncAll('C:\\NAS\\OCR', 'D:\\shadow', []);
    expect(r.copied).toBe(100);
  });

  it('MAX_ITERATIONS allows deep directory hierarchy (500 levels)', () => {
    const fs = makeFs();
    const reconciler = new ShadowReconciler(fs as any);
    // Build a deep chain: C:\NAS\deep\l0\l1\l2\...\l499\file.txt
    fs.files.set('C:\\NAS\\deep', { type: 'dir', mtimeMs: 0 });
    let parent = 'C:\\NAS\\deep';
    for (let i = 0; i < 500; i++) {
      const child = `${parent}\\l${i}`;
      fs.files.set(child, { type: 'dir', mtimeMs: 0 });
      parent = child;
    }
    fs.files.set(`${parent}\\file.txt`, { type: 'file', content: 'X', mtimeMs: 0 });
    fs.files.set('D:\\shadow', { type: 'dir', mtimeMs: 0 });
    const r = reconciler.syncAll('C:\\NAS\\deep', 'D:\\shadow', []);
    expect(r.copied).toBe(1);
  });
});
