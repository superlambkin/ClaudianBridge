import { Setting } from 'obsidian';
import { parseChangelog } from '../core/changelog-parser';
import type { ChangelogEntry } from '../core/changelog-parser';

/**
 * 「📜 改定履歴」設定タブ
 *
 * 呼び出し側（SettingTab 統合時）から CHANGELOG.md のテキストを文字列注入する。
 * esbuild の '.md': 'text' loader により `import changelogText from '../../CHANGELOG.md'` で受けた文字列を渡す想定。
 *
 * 例:
 *   new SettingTabChangelog(containerEl, changelogText).render();
 */
export class SettingTabChangelog {
  private readonly containerEl: HTMLElement;
  private readonly changelogText: string;

  constructor(containerEl: HTMLElement, changelogText: string) {
    this.containerEl = containerEl;
    this.changelogText = changelogText;
  }

  render(): void {
    const containerEl = this.containerEl;
    containerEl.empty();

    const entries: ChangelogEntry[] = parseChangelog(this.changelogText);

    containerEl.createEl('h2', { text: '📜 改定履歴' });
    containerEl.createEl('p', {
      text: entries.length > 0
        ? `CHANGELOG.md の全 ${entries.length} エントリ。バージョン行をクリックで詳細を展開します。`
        : 'CHANGELOG.md を読み込めませんでした。',
      cls: 'setting-item-description',
    });

    for (const entry of entries) {
      this.renderEntry(entry);
    }
  }

  private renderEntry(entry: ChangelogEntry): void {
    const title = entry.title !== '' ? ` — ${entry.title}` : '';
    const summaryText = `v${entry.version}（${entry.date}）${title}`;

    const details = this.containerEl.createEl('details', { cls: 'cb-changelog-entry' });
    const summary = details.createEl('summary', { cls: 'cb-changelog-entry__summary' });
    new Setting(summary).setName(summaryText).setClass('cb-changelog-entry__setting');

    const body = details.createEl('div', { cls: 'cb-changelog-entry__body' });
    if (entry.sections.length === 0) {
      body.createEl('p', { text: '（詳細記載なし）', cls: 'setting-item-description' });
      return;
    }
    for (const section of entry.sections) {
      body.createEl('h4', { text: section.name });
      const ul = body.createEl('ul', { cls: 'cb-changelog-entry__list' });
      for (const item of section.items) {
        ul.createEl('li', { text: item });
      }
    }
  }
}
