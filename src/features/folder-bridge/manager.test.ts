import { describe, it, expect, beforeEach, vi } from 'vitest';
import nodePath from 'path';
import { FolderBridgeManager } from './manager';
import { FolderBridge, FolderBridgeFs } from './types';

function makeFs() {
  const files = new Map<string, { type: 'file' | 'dir'; content?: string; mtimeMs: number }>();
  return {
    files,
    fs: {
      existsSync: (p: string) => files.has(p) || files.has(p.endsWith('\\') ? p : p + '\\'),
      statSync: (p: string) => {
        const f = files.get(p) ?? files.get(p + '\\');
        if (!f) throw new Error(`ENOENT: ${p}`);
        return { isDirectory: () => f.type === 'dir', isFile: () => f.type === 'file', isSymbolicLink: () => false, mtimeMs: f.mtimeMs, size: f.content?.length ?? 0 };
      },
      readdirSync: (p: string) => {
        const prefix = (p.endsWith('\\') ? p : p + '\\');
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
        files.set(p, { type: 'dir', mtimeMs: 0 });
        files.set(p.endsWith('\\') ? p : p + '\\', { type: 'dir', mtimeMs: 0 });
      },
      copyFileSync: (src: string, dst: string) => {
        const f = files.get(src) ?? files.get(src + '\\');
        if (!f) throw new Error(`ENOENT src: ${src}`);
        files.set(dst, { type: 'file', content: f.content, mtimeMs: f.mtimeMs });
      },
      rmSync: (p: string) => {
        const prefix = p.endsWith('\\') ? p : p + '\\';
        for (const k of Array.from(files.keys())) {
          if (k === p || k.startsWith(prefix)) files.delete(k);
        }
      },
      symlinkSync: (target: string, p: string) => {
        files.set(p, { type: 'dir', mtimeMs: 0 });
      },
      watch: () => ({ on: () => {}, close: () => {} }),
    } as FolderBridgeFs,
  };
}

function makeBridge(overrides: Partial<FolderBridge> = {}): FolderBridge {
  return {
    id: 'b1',
    linkName: 'OCR',
    vaultSubpath: '10_Input',
    externalPath: 'C:\\NAS\\OCR',
    shadowPath: 'C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1',
    excludePatterns: [],
    syncDirection: 'nas_to_shadow',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('FolderBridgeManager', () => {
  let fs: ReturnType<typeof makeFs>['fs'];
  let notices: string[];

  beforeEach(() => {
    fs = makeFs().fs;
    notices = [];
  });

  function mgr() {
    return new FolderBridgeManager({
      fs,
      notice: (m) => notices.push(m),
      vaultBasePath: 'C:\\Vault',
    });
  }

  it('applyAll syncs disabled bridges are skipped', () => {
    const r = mgr().applyAll([makeBridge({ enabled: false })]);
    expect(r.totalLinked).toBe(0);
    expect(r.totalErrors).toBe(0);
  });

  it('applyOne creates shadow dir, syncs files, creates junction', () => {
    // Setup NAS source
    const f = makeFs();
    fs = f.fs;
    f.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    f.files.set('C:\\NAS\\OCR\\doc.md', { type: 'file', content: 'DOC', mtimeMs: 100 });

    const r = mgr().applyAll([makeBridge()]);
    expect(r.totalLinked).toBe(1);
    expect(r.totalErrors).toBe(0);
    expect(fs.existsSync('C:\\Vault\\10_Input\\OCR')).toBe(true);
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\doc.md')).toBe(true);
  });

  it('marks external_missing when source path missing', () => {
    const r = mgr().applyAll([makeBridge({ externalPath: 'C:\\NOPE' })]);
    expect(r.totalErrors).toBe(1);
    expect(notices.some(n => n.includes('到達できません') || n.includes('到達不可'))).toBe(true);
  });

  it('handleWatchEvent add: copies new file to shadow', () => {
    const f = f_setup();
    f.files.set('C:\\NAS\\OCR\\new.md', { type: 'file', content: 'NEW', mtimeMs: 0 });
    const m = mgr();
    m.applyAll([makeBridge()]);
    // Simulate watcher event
    (m as any).handleWatchEvent(makeBridge(), { type: 'add', absPath: 'C:\\NAS\\OCR\\new.md' });
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\new.md')).toBe(true);
  });

  it('handleWatchEvent unlink: removes shadow file', () => {
    const f = f_setup();
    f.files.set('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\old.md', { type: 'file', content: 'X', mtimeMs: 0 });
    const m = mgr();
    m.applyAll([makeBridge()]);
    (m as any).handleWatchEvent(makeBridge(), { type: 'unlink', absPath: 'C:\\NAS\\OCR\\old.md' });
    expect(fs.existsSync('C:\\Vault\\.obsidian\\cache\\folder-bridge\\b1\\old.md')).toBe(false);
  });

  it('pause/resume toggles the watcher', () => {
    f_setup();
    const m = mgr();
    m.applyAll([makeBridge()]);
    m.pause('b1');
    expect(m.status('b1').state).toBe('paused');
    m.resume('b1');
    expect(m.status('b1').state).toBe('linked');
  });

  it('disable removes junction and stops watcher', () => {
    f_setup();
    const m = mgr();
    m.applyAll([makeBridge()]);
    m.disable('b1');
    expect(fs.existsSync('C:\\Vault\\10_Input\\OCR')).toBe(false);
    expect(m.status('b1').state).toBe('disabled');
  });

  function f_setup() {
    const f = makeFs();
    fs = f.fs;
    f.files.set('C:\\NAS\\OCR', { type: 'dir', mtimeMs: 0 });
    f.files.set('C:\\NAS\\OCR\\placeholder.md', { type: 'file', content: 'P', mtimeMs: 0 });
    return f;
  }
});