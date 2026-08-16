// src/features/chroma-fs/rag-menu.ts — Right-click "🔎 RAG検索" on PDF/DOCX under chroma_db.

import { App, Menu, TFile, Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { RagQuestionModal } from './question-modal';
import { runRagQuery } from './rag-query';
import { addTextToClaudian } from '../selection/core';

/** True when the file sits under chroma_db/PDF or chroma_db/DOCX and is pdf/docx. */
export function isChromaFsTarget(filePath: string, chromaPath: string): boolean {
  const base = (chromaPath ?? '').replace(/\/+$/, '');
  if (!base) return false;
  const pdfPrefix = `${base}/PDF/`;
  const docxPrefix = `${base}/DOCX/`;
  const lower = filePath.toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isDocx = lower.endsWith('.docx');
  return (
    (filePath.startsWith(pdfPrefix) && isPdf) ||
    (filePath.startsWith(docxPrefix) && isDocx)
  );
}

/** Register the file-menu handler. Returns an unregister function. */
export function registerRagMenu(app: App, store: ConfigStore): () => void {
  const handler = (menu: Menu, file: TFile): void => {
    if (!(file instanceof TFile)) return;
    const cfg = store.load();
    if (!cfg.chroma.enabled || !cfg.chroma.ragEnabled) return;
    if (!isChromaFsTarget(file.path, cfg.chroma.chromaPath)) return;

    menu.addItem((item) =>
      item
        .setTitle('🔎 RAG検索（Claudian）')
        .setIcon('search')
        .onClick(() => {
          new RagQuestionModal(app, (question) => {
            void runAndInsert(app, store, file, question);
          }).open();
        })
    );
  };

  const evt = app.workspace.on('file-menu', handler as never);
  return () => app.workspace.offref(evt);
}

async function runAndInsert(
  app: App,
  store: ConfigStore,
  file: TFile,
  question: string
): Promise<void> {
  const cfg = store.load();
  if (!cfg.chroma.ragScriptPath || !cfg.chroma.ragConfigPath) {
    new Notice('[chroma-fs] 設定で query.py / config.yaml のパスを指定してください', 8000);
    return;
  }
  new Notice(`🔎 RAG検索中: ${file.basename} …`, 3000);
  try {
    const result = await runRagQuery({
      pythonPath: cfg.chroma.pythonPath,
      scriptPath: cfg.chroma.ragScriptPath,
      configPath: cfg.chroma.ragConfigPath,
      source: file.name,
      question,
    });
    if (!result.ok) {
      await addTextToClaudian(
        app,
        `## 🔎 RAG検索エラー（${file.name}）\n\n> ${result.answer}`
      );
      return;
    }
    const sourceLines = result.sources
      .map((s) => `- ${s.source}${s.page !== undefined ? ` (p.${s.page})` : ''}`)
      .join('\n');
    const text =
      `## 🔎 RAG検索結果（${file.name}）\n\n` +
      `**質問**: ${question}\n\n` +
      `${result.answer}\n\n` +
      `**参照**:\n${sourceLines || '- (なし)'}`;
    await addTextToClaudian(app, text);
  } catch (e) {
    new Notice(`[chroma-fs] ${(e as Error).message}`, 8000);
  }
}
