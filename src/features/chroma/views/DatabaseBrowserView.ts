// src/features/chroma/views/DatabaseBrowserView.ts — Sidebar ItemView, AI-search style layout.
//
// Layout:
//   ┌─────────────────────────────────────┐
//   │ 📁 /path/to/chroma_db              │ ← path bar (breadcrumb)
//   ├─────────────────────────────────────┤
//   │ 🔍 [Hero search input]  [検索]      │ ← SearchPanel
//   │ 💡 hint                              │
//   │ ⚙ 絞り込み条件を追加                 │ ← collapsed advanced
//   ├──────────┬──────────────────────────┤
//   │  Collections  │  � Results: N 件     │
//   │  - col_a    │  ┌──────────────────�  │
//   │  - col_b    │  │ Result card 1    │  │
//   │             │  ├──────────────────┤  │
//   │             │  │ Result card 2    │  │
//   └──────────┴──────────────────────────┘

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { ChromaSettings } from "../types";
import { CollectionList } from "./CollectionList";
import { SearchPanel } from "./SearchPanel";
import { RecordCardView } from "./RecordCardView";
import { RawSqlModal } from "./RawSqlModal";
import type { FilterSpec } from "../types";
import { ChromaService } from "../chroma/ChromaService";
import { resolveChromaPath } from "../util/path";
import { vaultBasePath } from "../util/app";
import { EmbeddingDimensionError } from "../chroma/chroma-runner";

export const CHROMA_VIEW_TYPE = "chroma-inspector-browser";

interface State {
  selected: string | null;
  lastFilter: FilterSpec | null;
}

/**
 * Dependency contract: a `getSettings()` accessor that returns a fresh
 * ChromaSettings snapshot on every call (instead of a frozen reference).
 */
export interface DatabaseBrowserViewPlugin {
  getSettings: () => { chroma: ChromaSettings };
}

export class DatabaseBrowserView extends ItemView {
  private plugin: DatabaseBrowserViewPlugin;
  private collectionList: CollectionList | null = null;
  private searchPanel: SearchPanel | null = null;
  private recordView: RecordCardView | null = null;
  private state: State = { selected: null, lastFilter: null };
  private requestToken = 0;

  constructor(leaf: WorkspaceLeaf, plugin: DatabaseBrowserViewPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  /** Convenience accessor for current chroma settings — always fresh. */
  private get chroma(): ChromaSettings {
    return this.plugin.getSettings().chroma;
  }

  getViewType(): string {
    return CHROMA_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Chroma Browser";
  }

  getIcon(): string {
    return "database";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.addClass("ci-browser-root");
    root.empty();

    const vaultRoot = vaultBasePath(this.app);
    const resolved = resolveChromaPath(
      this.chroma.chromaPath,
      vaultRoot
    );

    // ─── Path bar (breadcrumb) ───
    const pathBar = root.createDiv({ cls: "ci-path-bar" });
    pathBar.createEl("span", { text: "📁", cls: "ci-path-icon" });
    pathBar.createEl("span", { text: resolved });

    // ─── Search panel (hero + advanced) ───
    this.searchPanel = new SearchPanel(root, {
      onRun: (filter) => void this.runSearch(filter),
      onOpenRawSql: () => this.openRawSql(),
      showAdvanced: this.chroma.enableRawSql,
    });

    // ─── Two-pane split ───
    const split = root.createDiv({ cls: "ci-browser-split" });
    const leftPane = split.createDiv({ cls: "ci-pane-left" });
    const rightPane = split.createDiv({ cls: "ci-pane-right" });

    // ─── Left: collection list ───
    this.collectionList = new CollectionList(leftPane, {
      onSelect: (name) => {
        this.state.selected = name;
        this.collectionList?.setSelected(name);
        if (this.state.lastFilter) {
          void this.runSearch(this.state.lastFilter);
        } else {
          // Auto-load first records when a collection is first selected
          void this.runSearch({
            metadataEqual: {},
            metadataIn: {},
            documentContains: "",
            queryText: "",
            nResults: this.chroma.defaultNResults,
          });
        }
      },
      onRefresh: () => void this.refreshCollections(),
    });

    // ─── Right: records area ───
    const recordsContainer = rightPane.createDiv({ cls: "ci-records-area" });
    this.recordView = new RecordCardView(
      recordsContainer,
      this.chroma.recordPreviewLength
    );

    // Initial empty state
    this.recordView.render(
      [],
      "左のリストからコレクションを選ぶか、上の検索ボックスから入力を始めましょう"
    );

    void this.refreshCollections();
  }

  async onClose(): Promise<void> {
    this.collectionList = null;
    this.searchPanel = null;
    this.recordView = null;
    this.containerEl.children[1]?.empty();
  }

  private async refreshCollections(): Promise<void> {
    const vaultRoot = vaultBasePath(this.app);
    this.collectionList?.setStatus("🔄 読み込み中…", "info");
    try {
      const result = await ChromaService.listCollections({
        settings: this.chroma,
        vaultRoot,
      });
      this.collectionList?.setCollections(result.collections);
      this.collectionList?.setStatus(
        `✅ ${result.collections.length} 件のコレクション`,
        "ok"
      );
    } catch (e) {
      this.collectionList?.setStatus(`❌ ${(e as Error).message}`, "fail");
    }
  }

  private async runSearch(filter: FilterSpec): Promise<void> {
    const vaultRoot = vaultBasePath(this.app);
    const token = ++this.requestToken;
    this.state.lastFilter = filter;

    const settings = this.chroma;
    if (!this.state.selected) {
      this.recordView?.render(
        [],
        "👈 左のリストからコレクションを選んでください"
      );
      return;
    }

    // ─── Pre-classify the filter ───
    const hasMetadata =
      Object.keys(filter.metadataEqual ?? {}).length > 0 ||
      Object.keys(filter.metadataIn ?? {}).length > 0;
    const hasDocument = (filter.documentContains ?? "").trim().length > 0;
    const hasQuery = (filter.queryText ?? "").trim().length > 0;
    const hasAnyFilter = hasMetadata || hasDocument || hasQuery;

    try {
      let result;
      let mode = "文書内検索";
      let autoFallbackReason: string | null = null;

      if (hasQuery && !settings.embeddingModel) {
        new Notice(
          "💡 埋め込みモデル未設定のため、意味検索の代わりに文書内検索として実行しました。設定画面で埋め込みモデルを指定すると、AI による意味検索が使えます。",
          7000
        );
        // Use `where` with --key so we search the query text in documents.
        result = await ChromaService.where({
          settings,
          vaultRoot,
          collection: this.state.selected,
          filter: { ...filter, queryText: "", documentContains: filter.queryText },
        });
      } else if (hasQuery) {
        try {
          result = await ChromaService.query(
            { settings, vaultRoot, collection: this.state.selected, filter },
            { text: filter.queryText, nResults: filter.nResults }
          );
          mode = "AI 意味検索";
        } catch (e) {
          if (e instanceof EmbeddingDimensionError) {
            autoFallbackReason = `⚠️ 埋め込みモデルの次元数が一致しないため（期待 ${e.expectedDim}次元 / 実際 ${e.gotDim}次元）、文書内検索に自動切り替えました。`;
            result = await ChromaService.where({
              settings,
              vaultRoot,
              collection: this.state.selected,
              filter: {
                ...filter,
                queryText: "",
                documentContains: filter.queryText,
              },
            });
          } else {
            throw e;
          }
        }
      } else if (!hasAnyFilter) {
        // ─── Pure browse: just get first N records, no where at all ───
        result = await ChromaService.get({
          settings,
          vaultRoot,
          collection: this.state.selected,
          limit: filter.nResults,
        });
        mode = "ブラウズ";
      } else {
        // hasMetadata and/or hasDocument — but no queryText
        result = await ChromaService.where({
          settings,
          vaultRoot,
          collection: this.state.selected,
          filter,
        });
      }

      if (token !== this.requestToken) return;
      if (autoFallbackReason) {
        new Notice(autoFallbackReason, 10000);
        mode = "文書内検索（自動切替）";
      }

      this.recordView?.setHeader(
        result.records.length,
        `コレクション: ${this.state.selected} · ${mode}`
      );
      this.recordView?.render(
        result.records,
        result.records.length === 0
          ? "(条件に一致するレコードがありませんでした)"
          : undefined
      );
    } catch (e) {
      if (token !== this.requestToken) return;
      new Notice(`❌ ${(e as Error).message}`, 8000);
      this.recordView?.render([], `❌ ${(e as Error).message}`);
    }
  }

  private openRawSql(): void {
    if (!this.chroma.enableRawSql) {
      new Notice("設定画面で「Enable raw SQL」をONにしてください。");
      return;
    }
    const vaultRoot = vaultBasePath(this.app);
    new RawSqlModal(this.app as never, {
      settings: this.chroma,
      vaultRoot,
    }).open();
  }
}
