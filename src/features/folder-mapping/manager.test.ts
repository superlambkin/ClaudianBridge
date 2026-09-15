import { describe, it, expect, beforeEach } from 'vitest';
import { FolderMappingManager } from './manager';
import type { FolderMapping, FolderMappingDeps } from './types';
import type { FolderMappingFs } from './types';

/** Minimal in-memory fs stub */
function makeFs(): FolderMappingFs & {
  files: Map<string, 'dir' | 'symlink' | { symTarget: string }>;
} {
  const files = new Map<string, 'dir' | 'symlink' | { symTarget: string }>();
  const fs: FolderMappingFs & {
    files: Map<string, 'dir' | 'symlink' | { symTarget: string }>;
  } = {
    files,
    existsSync: (p) => files.has(p),
    mkdirSync: (p) => {
      files.set(p, 'dir');
    },
    symlinkSync: (target, p) => {
      files.set(p, { symTarget: target });
    },
    lstatSync: (p) => ({
      isSymbolicLink: () => {
        const v = files.get(p);
        return typeof v === 'object' && v !== null && 'symTarget' in v;
      },
    }),
    rmdirSync: (p) => {
      files.delete(p);
    },
    rmSync: (p) => {
      files.delete(p);
    },
    realpathSync: (p) => p,
  };
  return fs;
}

const VAULT = 'C:\\Users\\me\\Vault';

function makeDeps(overrides: Partial<FolderMappingDeps> = {}): FolderMappingDeps {
  return {
    vaultBasePath: VAULT,
    fs: makeFs(),
    notice: () => {},
    openPath: async () => '',
    generateId: () => 'test-id',
    now: () => 1700000000000,
    ...overrides,
  };
}

function makeMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    id: 'm1',
    linkName: 'ExternalDocs',
    externalPath: 'D:\\projects\\docs',
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('FolderMappingManager - basic apply', () => {
  let mgr: FolderMappingManager;
  let fs: ReturnType<typeof makeFs>;

  beforeEach(() => {
    fs = makeFs();
    mgr = new FolderMappingManager(makeDeps({ fs }));
  });

  it('resolveLinkPath returns vaultBasePath + @10_Input/ + linkName', () => {
    const p = mgr.resolveLinkPath(makeMapping({ linkName: 'Foo' }));
    expect(p).toBe('C:\\Users\\me\\Vault\\@10_Input\\Foo');
  });

  it('apply(enabled=true, target exists externally) creates junction → created', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    expect(mgr.apply(m)).toBe('created');
    const link = mgr.resolveLinkPath(m);
    expect(fs.files.get(link)).toEqual({ symTarget: m.externalPath });
  });

  it('apply(enabled=true, junction already exists) → linked (idempotent)', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.apply(m)).toBe('linked');
  });

  it('apply(enabled=false, junction exists) removes junction → removed', () => {
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.apply({ ...m, enabled: false })).toBe('removed');
    const link = mgr.resolveLinkPath(m);
    expect(fs.files.has(link)).toBe(false);
  });

  it('apply(enabled=false, no junction) → inactive', () => {
    const m = makeMapping({ enabled: false });
    expect(mgr.apply(m)).toBe('inactive');
  });
});