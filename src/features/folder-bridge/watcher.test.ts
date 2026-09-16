import { describe, it, expect, vi } from 'vitest';
import { FolderBridgeWatcher, WatchEvent } from './watcher';

function makeFs() {
  const handlers: Record<string, Array<(p: string) => void>> = {};
  return {
    fs: {
      existsSync: () => true,
      statSync: () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, mtimeMs: 0, size: 0 }),
      readdirSync: () => [],
      mkdirSync: () => {},
      copyFileSync: () => {},
      rmSync: () => {},
      symlinkSync: () => {},
      watch: (_p: string, _opts: any) => ({
        on: (event: string, cb: (p: string) => void) => {
          handlers[event] = handlers[event] ?? [];
          handlers[event].push(cb);
        },
        close: () => {},
      }),
    } as any,
    handlers,
    fire: (event: string, p: string) => handlers[event]?.forEach(cb => cb(p)),
  };
}

describe('FolderBridgeWatcher', () => {
  it('registers handlers for all event types on start', () => {
    const { fs, handlers } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    expect(handlers['add']).toHaveLength(1);
    expect(handlers['change']).toHaveLength(1);
    expect(handlers['unlink']).toHaveLength(1);
    expect(handlers['addDir']).toHaveLength(1);
    expect(handlers['unlinkDir']).toHaveLength(1);
  });

  it('forwards events to callback', () => {
    const { fs, fire } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    fire('add', '\\\\NAS\\share\\OCR\\new.md');
    fire('unlink', '\\\\NAS\\share\\OCR\\old.md');
    fire('change', '\\\\NAS\\share\\OCR\\existing.md');
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenNthCalledWith(1, { type: 'add', absPath: '\\\\NAS\\share\\OCR\\new.md' });
    expect(cb).toHaveBeenNthCalledWith(2, { type: 'unlink', absPath: '\\\\NAS\\share\\OCR\\old.md' });
    expect(cb).toHaveBeenNthCalledWith(3, { type: 'change', absPath: '\\\\NAS\\share\\OCR\\existing.md' });
  });

  it('stop() releases the handle', () => {
    const { fs } = makeFs();
    const w = new FolderBridgeWatcher(fs);
    const cb = vi.fn();
    w.start('\\\\NAS\\share\\OCR', cb);
    expect(() => w.stop()).not.toThrow();
    // Calling stop twice should also be safe
    expect(() => w.stop()).not.toThrow();
  });
});