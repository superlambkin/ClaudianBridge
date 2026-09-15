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

describe('FolderMappingManager - validation states', () => {
  let mgr: FolderMappingManager;
  let fs: ReturnType<typeof makeFs>;

  beforeEach(() => {
    fs = makeFs();
    mgr = new FolderMappingManager(makeDeps({ fs }));
  });

  it('apply when externalPath is empty → external_missing, no junction', () => {
    const m = makeMapping({ externalPath: '' });
    expect(mgr.apply(m)).toBe('external_missing');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });

  it('apply when externalPath does not exist → external_missing', () => {
    const m = makeMapping({ externalPath: 'D:\\does\\not\\exist' });
    expect(mgr.apply(m)).toBe('external_missing');
  });

  it('apply when externalPath == vaultBasePath → circular', () => {
    const m = makeMapping({ externalPath: VAULT });
    expect(mgr.apply(m)).toBe('circular');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });

  it('apply when externalPath is vault ancestor → circular', () => {
    const m = makeMapping({ externalPath: 'C:\\Users\\me' });
    expect(mgr.apply(m)).toBe('circular');
  });

  it('apply when externalPath is C:\\Windows → forbidden_path', () => {
    const m = makeMapping({ externalPath: 'C:\\Windows\\System32' });
    expect(mgr.apply(m)).toBe('forbidden_path');
    expect(fs.files.has(mgr.resolveLinkPath(m))).toBe(false);
  });
});

describe('FolderMappingManager - applyAll + status + openExternal', () => {
  it('applyAll returns counts and per-id states', () => {
    const fs = makeFs();
    const notices: string[] = [];
    const mgr = new FolderMappingManager(
      makeDeps({ fs, notice: (m) => notices.push(m) }),
    );
    const m1 = makeMapping({ id: 'a', linkName: 'A', externalPath: 'D:\\p1' });
    const m2 = makeMapping({ id: 'b', linkName: 'B', externalPath: 'D:\\p2' });
    fs.files.set('D:\\p1', 'dir');
    fs.files.set('D:\\p2', 'dir');

    const r = mgr.applyAll([m1, m2]);

    expect(r.totalCreated).toBe(2);
    expect(r.applied).toEqual([
      { id: 'a', state: 'created' },
      { id: 'b', state: 'created' },
    ]);
    expect(notices.some((n) => n.includes('A → D:\\p1'))).toBe(true);
  });

  it('applyAll continues after single failure', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    const good = makeMapping({ id: 'g', externalPath: 'D:\\ok' });
    const bad = makeMapping({ id: 'b', externalPath: 'C:\\Windows' });
    fs.files.set('D:\\ok', 'dir');

    const r = mgr.applyAll([bad, good]);

    expect(r.applied.find((a) => a.id === 'g')?.state).toBe('created');
    expect(r.applied.find((a) => a.id === 'b')?.state).toBe('forbidden_path');
  });

  it('status returns linked=true when junction exists', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    const m = makeMapping();
    fs.files.set(m.externalPath, 'dir');
    mgr.apply(m);
    expect(mgr.status(m)).toEqual({ linked: true, state: 'linked' });
  });

  it('status returns linked=false when no junction', () => {
    const fs = makeFs();
    const mgr = new FolderMappingManager(makeDeps({ fs }));
    expect(mgr.status(makeMapping())).toEqual({ linked: false, state: 'inactive' });
  });

  it('openExternal calls deps.openPath with externalPath', async () => {
    let opened = '';
    const mgr = new FolderMappingManager(
      makeDeps({ openPath: async (p) => { opened = p; return ''; } }),
    );
    const m = makeMapping({ externalPath: 'D:\\x' });
    await mgr.openExternal(m);
    expect(opened).toBe('D:\\x');
  });
});