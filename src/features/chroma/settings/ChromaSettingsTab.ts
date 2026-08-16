// src/features/chroma/settings/ChromaSettingsTab.ts — Settings UI + Test connection.
//
// Render function form (matches renderOfficeTab pattern).

import { Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type { ConfigStore } from "../../../core/config-store";
import { getLocaleStrings, getUILanguage } from "../../../core/i18n";
import { ChromaService } from "../chroma/ChromaService";
import { resolveChromaPath, resolveScriptPath } from "../util/path";
import { vaultBasePath } from "../util/app";

export function renderChromaTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();
    const vaultRoot = vaultBasePath(app);

    containerEl.createEl("h2", { text: s.tabChroma });
    containerEl.createEl("p", {
      text: s.chromaDescription,
      cls: "setting-item-description",
    });

    // ───── Master toggle (mirror renderOfficeTab.officeEnabled pattern) ─────
    new Setting(containerEl)
      .setName(s.chromaEnabled)
      .setDesc(s.chromaEnabledDesc)
      .addToggle((t) =>
        t.setValue(cfg.chroma.enabled).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, chroma: { ...latest.chroma, enabled: v } });
            new Notice(s.noticeSaved);
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        })
      );

    // ───── Disabled state: render only the notice, no other Settings ─────
    if (!cfg.chroma.enabled) {
      containerEl.createEl("p", {
        text: s.chromaDisabledNotice,
        cls: "setting-item-description",
      });
      return;
    }

    // ───── ChromaDB path ─────
    new Setting(containerEl)
      .setName(s.chromaChromaPath)
      .setDesc(s.chromaChromaPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("chroma_db")
          .setValue(cfg.chroma.chromaPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, chromaPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Python path ─────
    new Setting(containerEl)
      .setName(s.chromaPythonPath)
      .setDesc(s.chromaPythonPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("py")
          .setValue(cfg.chroma.pythonPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, pythonPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Script path override ─────
    new Setting(containerEl)
      .setName(s.chromaScriptPath)
      .setDesc(s.chromaScriptPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("(vault root)/_chroma_inspect.py")
          .setValue(cfg.chroma.scriptPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, scriptPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Embedding model ─────
    new Setting(containerEl)
      .setName(s.chromaEmbeddingModel)
      .setDesc(s.chromaEmbeddingModelDesc)
      .addText((t) =>
        t
          .setPlaceholder("例: all-MiniLM-L6-v2 / multilingual-e5-large")
          .setValue(cfg.chroma.embeddingModel)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, embeddingModel: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Default nResults ─────
    new Setting(containerEl)
      .setName(s.chromaDefaultNResults)
      .setDesc(s.chromaDefaultNResultsDesc)
      .addText((t) =>
        t
          .setValue(String(cfg.chroma.defaultNResults))
          .onChange((v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, defaultNResults: n } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Preview length ─────
    new Setting(containerEl)
      .setName(s.chromaRecordPreviewLength)
      .setDesc(s.chromaRecordPreviewLengthDesc)
      .addText((t) =>
        t
          .setValue(String(cfg.chroma.recordPreviewLength))
          .onChange((v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, recordPreviewLength: n } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Show progress modal ─────
    new Setting(containerEl)
      .setName(s.chromaShowProgressModal)
      .setDesc(s.chromaShowProgressModalDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.showProgressModal)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, showProgressModal: v } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Enable raw SQL ─────
    new Setting(containerEl)
      .setName(s.chromaEnableRawSql)
      .setDesc(s.chromaEnableRawSqlDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.enableRawSql)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, enableRawSql: v } });
              draw();
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: hideInternal ─────
    new Setting(containerEl)
      .setName(s.chromaHideInternal)
      .setDesc(s.chromaHideInternalDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.hideInternal)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, hideInternal: v } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragEnabled ─────
    new Setting(containerEl)
      .setName(s.chromaRagEnabled)
      .setDesc(s.chromaRagEnabledDesc)
      .addToggle((tg) =>
        tg
          .setValue(cfg.chroma.ragEnabled)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragEnabled: v } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragScriptPath ─────
    new Setting(containerEl)
      .setName(s.chromaRagScriptPath)
      .setDesc(s.chromaRagScriptPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("D:/AI-Agent/word-pdf-rag/query.py")
          .setValue(cfg.chroma.ragScriptPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragScriptPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── chroma-fs: ragConfigPath ─────
    new Setting(containerEl)
      .setName(s.chromaRagConfigPath)
      .setDesc(s.chromaRagConfigPathDesc)
      .addText((t) =>
        t
          .setPlaceholder("D:/AI-Agent/word-pdf-rag/config.yaml")
          .setValue(cfg.chroma.ragConfigPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, chroma: { ...latest.chroma, ragConfigPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Resolved info ─────
    const info = containerEl.createDiv({ cls: "ci-info" });
    const abs = resolveChromaPath(cfg.chroma.chromaPath, vaultRoot);
    const script = resolveScriptPath(cfg.chroma.scriptPath, vaultRoot);
    info.createEl("div", { text: s.chromaResolvedPath.replace('{path}', abs) });
    info.createEl("div", { text: s.chromaScriptInfo.replace('{script}', script) });

    // ───── Test connection ─────
    new Setting(containerEl)
      .setName(s.chromaTestConnection)
      .setDesc("Spawns the Python CLI and lists collections.")
      .addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          b.setDisabled(true);
          try {
            const latest = store.load();
            const result = await ChromaService.listCollections({
              settings: latest.chroma,
              vaultRoot,
            });
            new Notice(s.chromaTestOk.replace('{n}', String(result.collections.length)));
          } catch (e) {
            new Notice(
              `[chroma-inspector] ${(e as Error).message}`,
              8000
            );
          } finally {
            b.setDisabled(false);
          }
        })
      );
  };

  draw();
}
