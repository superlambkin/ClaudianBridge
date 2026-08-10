import * as fs from 'fs';
import * as path from 'path';

export function readLegacyDataJson(pluginsDir: string, pluginId: string): unknown | null {
  const dataPath = path.join(pluginsDir, pluginId, 'data.json');
  if (!fs.existsSync(dataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    return null;
  }
}
