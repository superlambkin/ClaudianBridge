// src/features/chroma-fs/question-modal.ts — Ask a RAG question for a source document.

import { App, Modal, Setting } from 'obsidian';

export class RagQuestionModal extends Modal {
  private question = '';

  constructor(
    app: App,
    private readonly onSubmit: (question: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('🔎 RAG検索');
    this.contentEl.createEl('p', {
      text: 'この文書を対象に質問します。',
      cls: 'setting-item-description',
    });

    new Setting(this.contentEl)
      .setName('質問')
      .addText((text) =>
        text
          .setPlaceholder('例: HDMI 設定はどうなっていますか？')
          .onChange((v) => {
            this.question = v;
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('実行')
          .setCta()
          .onClick(() => {
            const q = this.question.trim();
            if (!q) return;
            this.onSubmit(q);
            this.close();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
