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
      claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false,
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

  it('_disabled__vault-office-bridge の data.json を変換してフラグを立てる', () => {
    mkdirSync(join(dir, '_disabled__vault-office-bridge'));
    writeFileSync(
      join(dir, '_disabled__vault-office-bridge', 'data.json'),
      JSON.stringify({ pythonPath: 'py', enabledExtensions: ['docx', 'pdf'], conflictPolicy: 'skip', outputDirOverride: '' })
    );
    const result = migrateFromLegacy(store, dir);
    expect(result.migrated).toContain('vault-office-bridge');
    const loaded = store.load();
    expect(loaded.office.pythonPath).toBe('py');
    expect(loaded.office.enabledExtensions).toEqual(['docx', 'pdf']);
    expect(loaded.office.conflictPolicy).toBe('skip');
    expect(loaded.general.migratedFrom.vaultOfficeBridge).toBe(true);
    expect(existsSync(join(dir, '_disabled__vault-office-bridge', 'data.json.bak.json'))).toBe(true);
  });

  it('vault-office-bridge は 2 度目の呼び出しでは移行しない', () => {
    mkdirSync(join(dir, '_disabled__vault-office-bridge'));
    writeFileSync(join(dir, '_disabled__vault-office-bridge', 'data.json'), JSON.stringify({ pythonPath: 'py', enabledExtensions: ['docx'], conflictPolicy: 'overwrite', outputDirOverride: '' }));
    migrateFromLegacy(store, dir);
    const result2 = migrateFromLegacy(store, dir);
    expect(result2.migrated).not.toContain('vault-office-bridge');
  });

  it('_disabled__extension-whitelist の data.json を変換してフラグを立てる', () => {
    mkdirSync(join(dir, '_disabled__extension-whitelist'));
    writeFileSync(
      join(dir, '_disabled__extension-whitelist', 'data.json'),
      JSON.stringify({ enabled: false, extensions: ['md', 'JSON'], alwaysShowFolders: false })
    );
    const result = migrateFromLegacy(store, dir);
    expect(result.migrated).toContain('extension-whitelist');
    const loaded = store.load();
    expect(loaded.whitelist.enabled).toBe(false);
    expect(loaded.whitelist.extensions).toEqual(['md', 'json']);
    expect(loaded.whitelist.alwaysShowFolders).toBe(false);
    expect(loaded.general.migratedFrom.extensionWhitelist).toBe(true);
    expect(existsSync(join(dir, '_disabled__extension-whitelist', 'data.json.bak.json'))).toBe(true);
  });

  it('extension-whitelist は 2 度目の呼び出しでは移行しない', () => {
    mkdirSync(join(dir, '_disabled__extension-whitelist'));
    writeFileSync(join(dir, '_disabled__extension-whitelist', 'data.json'), JSON.stringify({ enabled: true, extensions: ['md'], alwaysShowFolders: true }));
    migrateFromLegacy(store, dir);
    const result2 = migrateFromLegacy(store, dir);
    expect(result2.migrated).not.toContain('extension-whitelist');
  });

  it('chroma-inspector の data.json を変換してフラグを立てる', () => {
    mkdirSync(join(dir, 'chroma-inspector'));
    writeFileSync(
      join(dir, 'chroma-inspector', 'data.json'),
      JSON.stringify({
        chromaPath: 'my_chroma',
        pythonPath: 'py',
        embeddingModel: 'all-MiniLM-L6-v2',
        defaultNResults: 8,
        recordPreviewLength: 360,
        showProgressModal: false,
        enableRawSql: true,
        scriptPath: '',
      })
    );
    const result = migrateFromLegacy(store, dir);
    expect(result.migrated).toContain('chroma-inspector');
    const loaded = store.load();
    expect(loaded.chroma.chromaPath).toBe('my_chroma');
    expect(loaded.chroma.embeddingModel).toBe('all-MiniLM-L6-v2');
    expect(loaded.chroma.defaultNResults).toBe(8);
    expect(loaded.chroma.enabled).toBe(true); // 既存ユーザー → ON
    expect(loaded.general.migratedFrom.chromaInspector).toBe(true);
    expect(existsSync(join(dir, 'chroma-inspector', 'data.json.bak.json'))).toBe(true);
  });

  it('chroma-inspector は 2 度目の呼び出しでは移行しない', () => {
    mkdirSync(join(dir, 'chroma-inspector'));
    writeFileSync(join(dir, 'chroma-inspector', 'data.json'), JSON.stringify({ chromaPath: 'chroma_db', pythonPath: 'py' }));
    migrateFromLegacy(store, dir);
    const result2 = migrateFromLegacy(store, dir);
    expect(result2.migrated).not.toContain('chroma-inspector');
  });
});
