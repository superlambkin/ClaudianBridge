import * as fs from 'fs';
import * as path from 'path';

const LEGACY_PLUGIN_IDS = ['claudian-selection-bridge', 'vault-office-bridge', 'extension-whitelist'];

export interface DisableResult {
  disabled: string[];
  renamed: string[];
}

export function disableLegacyPluginsOnce(obsidianDir: string): DisableResult {
  const result: DisableResult = { disabled: [], renamed: [] };
  const flag = path.join(obsidianDir, '.obsidian', '.claudian-bridge.legacy-disabled');
  if (fs.existsSync(flag)) return result;

  // 1. community-plugins.json 更新
  const cpPath = path.join(obsidianDir, '.obsidian', 'community-plugins.json');
  if (fs.existsSync(cpPath)) {
    const cp = JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
    const removeSet = new Set<string>(LEGACY_PLUGIN_IDS);
    if (Array.isArray(cp.plugins)) {
      const beforePlugins: string[] = cp.plugins;
      cp.plugins = beforePlugins.filter((p: string) => !removeSet.has(p));
      const removedIds = LEGACY_PLUGIN_IDS.filter((id) => beforePlugins.includes(id));
      if (removedIds.length > 0) {
        result.disabled.push(...removedIds);
        fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2));
      }
    }
  }

  // 2. フォルダを _disabled__ 接頭辞でリネーム（既に _disabled__ のものはスキップ）
  for (const id of ['claudian-selection-bridge', 'vault-office-bridge']) {
    const from = path.join(obsidianDir, '.obsidian', 'plugins', id);
    const to = path.join(obsidianDir, '.obsidian', 'plugins', '_disabled__' + id);
    if (fs.existsSync(from)) {
      try {
        fs.renameSync(from, to);
        result.renamed.push(id);
      } catch {
        /* rename 失敗時は無視 */
      }
    }
  }

  // 3. フラグ作成
  fs.writeFileSync(flag, new Date().toISOString());

  return result;
}
