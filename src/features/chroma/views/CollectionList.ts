// src/features/chroma/views/CollectionList.ts — Card-style collection list with badges.

import { setIcon } from "obsidian";
import type { ChromaCollection } from "../types";

export interface CollectionListHandlers {
  onSelect(name: string): void;
  onRefresh(): void;
}

export class CollectionList {
  private container: HTMLElement;
  private handlers: CollectionListHandlers;
  private collections: ChromaCollection[] = [];
  private selected: string | null = null;
  private listEl!: HTMLElement;
  private statusEl!: HTMLElement;

  constructor(container: HTMLElement, handlers: CollectionListHandlers) {
    this.container = container;
    this.handlers = handlers;
    this.container.addClass("ci-collections");
    this.render();
  }

  private render(): void {
    this.container.empty();
    const header = this.container.createDiv({ cls: "ci-collections-header" });
    header.createEl("h3", { text: "📚 コレクション" });
    const refreshBtn = header.createEl("button", {
      cls: "ci-icon-btn",
      attr: { "aria-label": "再読み込み", title: "再読み込み" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.handlers.onRefresh());

    this.statusEl = this.container.createDiv({ cls: "ci-collections-status" });
    this.listEl = this.container.createDiv({ cls: "ci-collections-list" });
    this.renderList();
  }

  setCollections(cols: ChromaCollection[]): void {
    this.collections = cols;
    this.renderList();
  }

  setStatus(text: string, kind: "info" | "ok" | "fail" = "info"): void {
    this.statusEl.textContent = text;
    this.statusEl.className = `ci-collections-status ci-status-${kind}`;
  }

  setSelected(name: string | null): void {
    this.selected = name;
    this.renderList();
  }

  private renderList(): void {
    this.listEl.empty();
    if (this.collections.length === 0) {
      this.listEl.createDiv({
        text: "(コレクションがありません)",
        cls: "ci-collections-empty",
      });
      return;
    }
    for (const c of this.collections) {
      const item = this.listEl.createDiv({
        cls: "ci-collection-item",
        attr: { "data-collection": c.name },
      });
      if (c.name === this.selected) item.addClass("ci-collection-selected");

      // ─── Name (prominent) ───
      const nameEl = item.createDiv({ text: c.name, cls: "ci-collection-name" });

      // ─── Badges: count + meta keys ───
      const badges = item.createDiv({ cls: "ci-collection-meta" });
      const countText =
        c.count === null
          ? "件数: 不明"
          : `${c.count.toLocaleString()} 件`;
      const countBadge = badges.createEl("span", {
        text: countText,
        cls: "ci-collection-badge ci-badge-count",
      });
      void countBadge;
      if (c.metadata && Object.keys(c.metadata).length > 0) {
        for (const k of Object.keys(c.metadata).slice(0, 3)) {
          badges.createEl("span", {
            text: `${k}`,
            cls: "ci-collection-badge",
            attr: { title: JSON.stringify(c.metadata[k]) },
          });
        }
      }
      item.addEventListener("click", () => this.handlers.onSelect(c.name));
    }
  }
}
