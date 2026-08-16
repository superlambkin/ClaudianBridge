// src/core/plugin-dir.ts — Resolve the vault root and this plugin's own folder.
//
// Obsidian exposes the plugin folder through `Plugin.manifest.dir` (vault-relative,
// e.g. ".obsidian/plugins/claudian-bridge"). Python helper scripts are resolved from
// <pluginDir> at runtime, so we centralize the resolution here.

import * as path from "path";
import type { App } from "obsidian";

/** Vault root via the filesystem adapter (getBasePath() with basePath fallback). */
export function getVaultRoot(app: App): string {
  const adapter = app.vault.adapter as unknown as {
    getBasePath?: () => string;
    basePath?: string;
  };
  return adapter.getBasePath ? adapter.getBasePath() : (adapter.basePath ?? process.cwd());
}

/**
 * Absolute path to this plugin's own folder, e.g.
 * `<vault>/.obsidian/plugins/claudian-bridge`.
 * Prefers `manifest.dir` (vault-relative), falls back to configDir/plugins/<id>.
 */
export function getPluginDir(app: App, manifest: { dir?: string; id: string }): string {
  const root = getVaultRoot(app);
  if (manifest.dir) return path.join(root, manifest.dir);
  return path.join(root, app.vault.configDir, "plugins", manifest.id);
}
