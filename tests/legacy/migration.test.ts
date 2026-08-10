import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../../src/core/config-store';
import { migrateFromLegacy } from '../../src/legacy/migration';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../src/core/settings';

let dir: string;
let configPath: string;
let store: ConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cb-mig-'));
  configPath = join(dir, 'data.json');
  store = new ConfigStore(configPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('migrateFromLegacy', () => {
  it('旧プラグインなし → migratedFrom フラグのみ記録', () => {
    const result = migrateFromLegacy(store, dir);
    expect(result.migrated).toEqual([]);
    expect(store.load().general.migratedFrom).toEqual({
      claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false,
    });
  });

  it('claudian-selection-bridge の data.json を変換', () => {
    mkdirSync(join(dir, 'claudian-selection-bridge'));
    writeFileSync(
      join(dir, 'claudian-selection-bridge', 'data.json'),
      JSON.stringify({ enabled: true, delayMs: 500, tts: { engine: 'claudetts', voices: { zh: '', ja: '', en: '' }, minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' }, voice: '' } })
    );
    const result = migrateFromLegacy(store, dir);
    expect(result.migrated).toContain('claudian-selection-bridge');
    const loaded = store.load();
    expect(loaded.selection.delayMs).toBe(500);
    expect(loaded.tts.engine).toBe('claudetts');
    expect(loaded.general.migratedFrom.claudianSelectionBridge).toBe(true);
  });

  it('2 度目の呼び出しは何もしない（migratedFrom フラグで防ぐ）', () => {
    mkdirSync(join(dir, 'claudian-selection-bridge'));
    writeFileSync(join(dir, 'claudian-selection-bridge', 'data.json'), JSON.stringify({ enabled: true, delayMs: 999, tts: { engine: 'claudetts', voices: { zh: '', ja: '', en: '' }, minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' }, voice: '' } }));
    migrateFromLegacy(store, dir);
    const result2 = migrateFromLegacy(store, dir);
    expect(result2.migrated).toEqual([]);
    expect(store.load().selection.delayMs).toBe(999); // 1 回目の値のまま
  });

  it('移行成功でバックアップ (.bak.json) を作成', () => {
    mkdirSync(join(dir, 'claudian-selection-bridge'));
    writeFileSync(join(dir, 'claudian-selection-bridge', 'data.json'), JSON.stringify({ enabled: true, delayMs: 500, tts: { engine: 'edge', voices: { zh: '', ja: '', en: '' }, minimax: { enabled: false, showInEngineList: false, apiKey: '', voiceIdZh: '', voiceIdJa: '', voiceIdEn: '', speed: 1, vol: 1, pitch: 0, audioFormat: 'mp3' }, voice: '' } }));
    migrateFromLegacy(store, dir);
    expect(existsSync(join(dir, 'claudian-selection-bridge', 'data.json.bak.json'))).toBe(true);
  });
});
