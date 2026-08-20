import { describe, it, expect, vi } from 'vitest';
import { migrateEdgeToEdgeLocal } from '../../src/core/migrator';

describe('migrateEdgeToEdgeLocal', () => {
  it("engine: 'edge' → 'edge-local' に変換し backup 記録", () => {
    const tts: { engine: string } = { engine: 'edge' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('edge-local');
    expect(backup.record).toHaveBeenCalledWith(expect.stringContaining('edge → edge-local'));
  });

  it("engine: 'edge-local' は変換しない", () => {
    const tts: { engine: string } = { engine: 'edge-local' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('edge-local');
    expect(backup.record).not.toHaveBeenCalled();
  });

  it("engine: 'plachta' は変換しない", () => {
    const tts: { engine: string } = { engine: 'plachta' };
    const backup = { record: vi.fn() };
    migrateEdgeToEdgeLocal(tts, backup);
    expect(tts.engine).toBe('plachta');
    expect(backup.record).not.toHaveBeenCalled();
  });

  it('null / undefined 入力は noop', () => {
    expect(() => migrateEdgeToEdgeLocal(null, { record: vi.fn() })).not.toThrow();
    expect(() => migrateEdgeToEdgeLocal(undefined, { record: vi.fn() })).not.toThrow();
  });
});