import * as fs from 'fs';
import * as path from 'path';
import { ConfigStore } from '../core/config-store';
import { readLegacyDataJson } from './read-legacy';
import { convertFromClaudianSelectionBridge } from './convert-csb';

export interface MigrationResult {
  migrated: string[];
  backup: string[];
}

function backupLegacyData(pluginsDir: string, pluginId: string): string | null {
  const src = path.join(pluginsDir, pluginId, 'data.json');
  if (!fs.existsSync(src)) return null;
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

  // vault-office-bridge → P3 で実装（P2 ではフラグのみ記録しない）
  // extension-whitelist → P4 で実装

  return result;
}
