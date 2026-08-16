/**
 * v0.17.0: MD ファイル右クリック「Add to TTS」。
 * 本文（frontmatter・コードブロックを除く）を抽出して読み上げる。
 * コールアウト・テーブルはタイプ別フィルタ（selection を共有）に従う。
 */
import { Notice } from 'obsidian';
import type { App, TFile, Menu } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import type { SpeechFilterOptions } from '../../core/settings';
import { speakText, resolveSpeechFilter } from './speak';

/** frontmatter（先頭 --- 〜 ---） */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** コードフェンス ``` または ~~~ で囲まれたブロック */
const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/** コールアウトブロック（> [!type] 連続行） */
const CALLOUT_BLOCK_RE = />\s*\[![\s\S]*?(?=\r?\n(?!\s*>)|$)/g;

/** テーブル行（| 区切りの連続行 + 区切り行） */
const TABLE_BLOCK_RE = /^\s*\|.*\|[ \t]*\r?\n(?:^\s*\|[\s:|-]*\|[ \t]*\r?\n)?(?:^\s*\|.*\|[ \t]*\r?\n)*/gm;

/** MD 本文を抽出（filter の false 項目を除去） */
export function extractMdText(md: string, filter: SpeechFilterOptions): string {
  let t = md;
  t = t.replace(FRONTMATTER_RE, '');
  if (!filter.code) t = t.replace(CODE_FENCE_RE, ' ');
  if (!filter.callout) t = t.replace(CALLOUT_BLOCK_RE, ' ');
  if (!filter.table) t = t.replace(TABLE_BLOCK_RE, ' ');
  return t.trim();
}

export function setupMdFileRead(app: App, store: ConfigStore): () => void {
  // TFile の instanceof は信頼しにくいため extension で判定（main.ts のフォルダ「Add to Claudian」も同方式）
  const handler = (menu: Menu, file: unknown): void => {
    const f = file as { extension?: string } | null;
    if (!f || f.extension !== 'md') return;
    menu.addItem((item) => item
      .setTitle('Add to TTS')
      .setIcon('volume-2')
      .onClick(() => {
        void (async () => {
          try {
            const cfg = store.load();
            if (!cfg.tts.enabled) { new Notice('🔇 ミュート中です'); return; }
            const content = await app.vault.cachedRead(file as TFile);
            const filter = resolveSpeechFilter(cfg, 'md');
            const text = extractMdText(content, filter);
            await speakText('md', text, cfg, { noticeOnEmpty: true });
          } catch (e) {
            console.warn('[cb-md-read] failed:', e);
            new Notice(`⚠️ MD 読み上げ失敗: ${(e as Error).message}`);
          }
        })();
      }));
  };

  const evRef = app.workspace.on('file-menu', handler);
  return () => { app.workspace.offref(evRef); };
}
