import * as fs from 'fs';
import * as path from 'path';

export function legacyDataJsonPath(pluginsDir: string, pluginId: string): string | null {
  for (const dir of [pluginId, `_disabled__${pluginId}`]) {
    const p = path.join(pluginsDir, dir, 'data.json');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function readLegacyDataJson(pluginsDir: string, pluginId: string): unknown | null {
  const dataPath = legacyDataJsonPath(pluginsDir, pluginId);
  if (!dataPath) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    return null;
  }
}
