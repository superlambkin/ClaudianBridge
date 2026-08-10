import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../../src/core/config-store';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../src/core/settings';

let dir: string;
let configPath: string;
let store: ConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cb-test-'));
  configPath = join(dir, 'data.json');
  store = new ConfigStore(configPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ConfigStore', () => {
  it('ファイル不在ならデフォルトで作成して返す', () => {
    const cfg = store.load();
    expect(cfg).toEqual(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS);
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS);
  });

  it('既存ファイルを読み込む', () => {
    writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 500 } }));
    expect(store.load().selection.delayMs).toBe(500);
  });

  it('欠落キーはデフォルトでマージされる', () => {
    writeFileSync(configPath, JSON.stringify({ general: { enabled: false } }));
    const cfg = store.load();
    expect(cfg.general.enabled).toBe(false);
    expect(cfg.tts.engine).toBe(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.engine);
  });

  it('save 後 load で round-trip', () => {
    const next = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, selection: { enabled: true, folderEnabled: true, delayMs: 999 } };
    store.save(next);
    expect(store.load().selection.delayMs).toBe(999);
  });

  it('不正な値 → 例外', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, tts: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts, engine: 'unknown' as unknown as 'edge' } };
    expect(() => store.save(bad)).toThrow(/tts.engine/);
  });
});
