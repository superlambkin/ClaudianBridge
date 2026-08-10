import * as fs from 'fs';
import * as path from 'path';
import { ClaudianBridgeSettings, DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, normalizeClaudianBridgeSettings, validateClaudianBridgeSettings } from './settings';

export function defaultConfigPath(): string {
  // Obsidian のプラグイン規約に準拠（Vault 直下の .obsidian/plugins/<id>/data.json）
  const appData = process.env.OBSIDIAN_PLUGIN_DIR ?? '';
  if (appData) return path.join(appData, 'data.json');
  return path.join(process.cwd(), 'data.json');
}

export class ConfigStore {
  readonly configPath: string;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSelfWrite = 0;

  constructor(configPath: string = defaultConfigPath()) {
    this.configPath = configPath;
  }

  load(): ClaudianBridgeSettings {
    if (!fs.existsSync(this.configPath)) {
      this.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      return { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      return normalizeClaudianBridgeSettings(raw);
    } catch {
      const brokenPath = this.configPath.replace(/\.json$/, '.broken.json');
      fs.renameSync(this.configPath, brokenPath);
      this.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
      return { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS };
    }
  }

  save(cfg: ClaudianBridgeSettings): void {
    const error = validateClaudianBridgeSettings(cfg);
    if (error) throw new Error(error);
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const tmpPath = this.configPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, this.configPath);
    this.lastSelfWrite = Date.now();
  }

  watch(onExternalChange: (cfg: ClaudianBridgeSettings) => void): void {
    this.close();
    this.watcher = fs.watch(this.configPath, () => {
      if (Date.now() - this.lastSelfWrite < 500) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => onExternalChange(this.load()), 300);
    });
  }

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
