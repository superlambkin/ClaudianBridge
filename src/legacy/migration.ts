import * as fs from 'fs';
import { ConfigStore } from '../core/config-store';
import { legacyDataJsonPath, readLegacyDataJson } from './read-legacy';
import { convertFromClaudianSelectionBridge } from './convert-csb';
import { convertFromVaultOfficeBridge } from './convert-vob';

export interface MigrationResult {
  migrated: string[];
  backup: string[];
}

function backupLegacyData(pluginsDir: string, pluginId: string): string | null {
  const src = legacyDataJsonPath(pluginsDir, pluginId);
  if (!src) return null;
  const bak = src + '.bak.json';
  fs.copyFileSync(src, bak);
  return bak;
}

export function migrateFromLegacy(store: ConfigStore, pluginsDir: string): MigrationResult {
  const result: MigrationResult = { migrated: [], backup: [] };
  const cfg = store.load();

  // claudian-selection-bridge
  if (!cfg.general.migratedFrom.claudianSelectionBridge) {
    const raw = readLegacyDataJson(pluginsDir, 'claudian-selection-bridge');
    if (raw) {
      const partial = convertFromClaudianSelectionBridge(raw);
      if (partial) {
        const merged = { ...cfg, ...partial };
        store.save(merged);
        const bak = backupLegacyData(pluginsDir, 'claudian-selection-bridge');
        if (bak) result.backup.push(bak);
        result.migrated.push('claudian-selection-bridge');
        // flag 更新
        const cfg2 = { ...store.load(), general: { ...store.load().general, migratedFrom: { ...store.load().general.migratedFrom, claudianSelectionBridge: true } } };
        store.save(cfg2);
      }
    }
  }

  // vault-office-bridge → office
  if (!cfg.general.migratedFrom.vaultOfficeBridge) {
    const raw = readLegacyDataJson(pluginsDir, 'vault-office-bridge');
    if (raw) {
      const partial = convertFromVaultOfficeBridge(raw);
      if (partial) {
        const merged = { ...store.load(), ...partial };
        store.save(merged);
        const bak = backupLegacyData(pluginsDir, 'vault-office-bridge');
        if (bak) result.backup.push(bak);
        result.migrated.push('vault-office-bridge');
        const cfg2 = {
          ...store.load(),
          general: { ...store.load().general, migratedFrom: { ...store.load().general.migratedFrom, vaultOfficeBridge: true } },
        };
        store.save(cfg2);
      }
    }
  }

  // extension-whitelist → P4 で実装

  return result;
}
