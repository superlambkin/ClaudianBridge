/**
 * v0.17.0: MD ファイル右クリック「Add to TTS」。
 * 本文（frontmatter・コードブロックを除く）を抽出して読み上げる。
 * コールアウト・テーブルはタイプ別フィルタ（selection を共有）に従う。
 */
import { Notice } from 'obsidian';
import type { App, TFile, Menu } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import type { SpeechFilterOptions } from '../../core/settings';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { speakText, resolveSpeechFilter } from './speak';

/** frontmatter（先頭 --- 〜 ---） */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** コードフェンス ``` または ~~~ で囲まれたブロック */
const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/** コールアウトブロック（> [!type] 連続行） */
const CALLOUT_BLOCK_RE = />\s*\[![\s\S]*?(?=\r?\n(?!\s*>)|$)/g;

/** テーブル行（| 区切りの連続行 + 区切り行）。各行の終端は改行または行末（$）のどちらも許容 */
const TABLE_BLOCK_RE = /^\s*\|.*\|[ \t]*(?:\r?\n|$)(?:^\s*\|[\s:|-]*\|[ \t]*(?:\r?\n|$))?(?:^\s*\|.*\|[ \t]*(?:\r?\n|$))*/gm;

/* ============================================================================
 * v0.32.1: 記号正規化（ハッシュタグ・記号を読み上げない）
 * ========================================================================== */

/** 見出し行頭の #（#### タイトル → タイトル） */
const HEADING_MARK_RE = /^\s{0,3}#{1,6}\s+/gm;
/** ハッシュタグ（#タグ・#日本語タグ → 除去） */
const HASHTAG_RE = /(^|\s)#[^\s#、。！？]+/g;
/** wikilink [[path|alias]] → alias / [[path]] → path */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
/** markdown link [text](url) → text */
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
/** 強調記号（**bold** / ~~strike~~ / *em* / _em_） */
const EMPHASIS_RE = /\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g;
/** リストマーカー（行頭 "- " / "* "） */
const LIST_MARKER_RE = /^\s{0,3}[-*]\s+/gm;
/** スラッシュ（読み上げ防止 → 空白） */
const SLASH_RE = /\//g;

/** 読み上げ用に MD 記号を正規化する（v0.32.1） */
export function normalizeMdForSpeech(t: string): string {
  return t
    .replace(WIKILINK_RE, (_m, path: string, alias?: string) => alias ?? path)
    .replace(MD_LINK_RE, '$1')
    .replace(HEADING_MARK_RE, '')
    .replace(HASHTAG_RE, '$1')
    .replace(EMPHASIS_RE, (_m, b?: string, s?: string, e1?: string, e2?: string) => b ?? s ?? e1 ?? e2 ?? '')
    .replace(LIST_MARKER_RE, '')
    .replace(SLASH_RE, ' ');
}

/** MD 本文を抽出（filter の false 項目を除去 + 記号正規化） */
export function extractMdText(md: string, filter: SpeechFilterOptions): string {
  let t = md;
  t = t.replace(FRONTMATTER_RE, '');
  if (!filter.code) t = t.replace(CODE_FENCE_RE, ' ');
  if (!filter.callout) t = t.replace(CALLOUT_BLOCK_RE, ' ');
  if (!filter.table) t = t.replace(TABLE_BLOCK_RE, ' ');
  // v0.32.1: ハッシュタグ・記号を読み上げない
  t = normalizeMdForSpeech(t);
  return t.trim();
}

export function setupMdFileRead(app: App, store: ConfigStore): () => void {
  const s = getLocaleStrings(getUILanguage());
  // TFile の instanceof は信頼しにくいため extension で判定（main.ts のフォルダ「Add to Claudian」も同方式）
  const handler = (menu: Menu, file: unknown): void => {
    const f = file as { extension?: string } | null;
    if (!f || f.extension !== 'md') return;
    menu.addItem((item) => item
      .setTitle(s.ttsAddToTts)
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
