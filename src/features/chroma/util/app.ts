// src/features/chroma/util/app.ts — Tiny App-helpers that bridge type gaps in Obsidian's API.

import type { App } from "obsidian";

/**
 * Resolve the Vault's absolute base path. Obsidian's TS types don't expose
 * `adapter.basePath` directly, but at runtime the property exists. We use a
 * double cast through `unknown` so we can stay strict elsewhere.
 */
export function vaultBasePath(app: App): string {
  const adapter = (app.vault.adapter as unknown as { basePath?: string });
  return adapter.basePath ?? "";
}
