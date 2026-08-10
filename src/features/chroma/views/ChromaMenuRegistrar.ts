// src/features/chroma/views/ChromaMenuRegistrar.ts — Ribbon icon + Command palette wiring.

import { Notice, Plugin } from "obsidian";
import { CHROMA_VIEW_TYPE, DatabaseBrowserView } from "./DatabaseBrowserView";

export class ChromaMenuRegistrar {
  /** Register the Ribbon icon and Command Palette entry. */
  static register(plugin: Plugin): void {
    plugin.addRibbonIcon("database", "Open ChromaDB browser", async () => {
      await ChromaMenuRegistrar.openView(plugin);
    });

    plugin.addCommand({
      id: "open-chroma-db-browser",
      name: "Open ChromaDB browser",
      callback: async () => {
        await ChromaMenuRegistrar.openView(plugin);
      },
    });
  }

  /** Open (or focus) the Database Browser ItemView. */
  static async openView(plugin: Plugin): Promise<void> {
    const { workspace } = plugin.app;
    const existing = workspace.getLeavesOfType(CHROMA_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("[chroma-inspector] could not allocate a leaf");
      return;
    }
    await leaf.setViewState({
      type: CHROMA_VIEW_TYPE,
      active: true,
    });
  }
}

/** Helper for main.ts: instantiate a DatabaseBrowserView for a leaf. */
export function buildDatabaseBrowserView(
  plugin: Plugin & { settings: import("../types").ChromaSettings },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaf: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseBrowserViewCtor: new (...args: any[]) => unknown
): unknown {
  return new DatabaseBrowserViewCtor(leaf, plugin);
}

// Re-export so main.ts has a single import.
export { DatabaseBrowserView };
