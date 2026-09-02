/**
 * v0.33.3 (F-028): MD ファイル右クリック「Add to TTS」のフローを
 * 抽出した関数。setupMdFileRead の menu click handler から呼ばれ、
 * テストからも直接 invoke できる。
 *
 * やること:
 *   1. ファイルを leaf で open する（未 open の場合）
 *   2. Markdown view を Preview モードに切替（Source の場合のみ）
 *   3. mdReadHighlight が enabled なら mdReadState を register（chunks 構築）
 *   4. speakText を onChunkStart 付きで実行
 *   5. 完了 / 失敗で finalizeMdRead
 */
import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings } from '../../core/settings';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { speakText, resolveSpeechFilter } from './speak';
import { extractMdText } from './md-file-read';
import {
  prepareMdRead,
  finalizeMdRead,
  createChunkStartHook,
} from './md-read-highlight/runtime';

/** Markdown view に対する最小 shape */
interface MarkdownViewLike {
  file?: { path?: string } | null;
  previewMode?: { containerEl?: HTMLElement };
  getMode?: () => string;
  setState?: (state: { state?: string }, opts?: object) => void;
}

/**
 * ファイルを Preview モードで開く（既存 leaf があればそれ、なければ新 leaf）。
 * 既に preview なら setState は呼ばない（不要な re-render を防ぐ）。
 */
export async function openInPreview(app: App, filePath: string): Promise<void> {
  // 必ず leaf 経由で open（未 open なら新 leaf を作成）
  const abstractFile = app.vault.getAbstractFileByPath(filePath);
  if (!abstractFile) {
    new Notice(`⚠️ ファイルが見つかりません: ${filePath}`);
    return;
  }
  // Obsidian の MarkdownView を持つ leaf を getLeaf(false) で取得して openFile
  const leaf = app.workspace.getLeaf(false);
  await (leaf as unknown as { openFile: (f: typeof abstractFile) => Promise<void> }).openFile(
    abstractFile as TFile,
  );

  // 該当 filePath の MarkdownView を探す
  const targetLeaf = app.workspace
    .getLeavesOfType('markdown')
    .find((l) => ((l.view as unknown) as MarkdownViewLike)?.file?.path === filePath);
  if (!targetLeaf) return;

  app.workspace.setActiveLeaf(targetLeaf as never, { focus: true } as never);

  const view = (targetLeaf.view as unknown) as MarkdownViewLike;
  // 既に preview なら何もしない
  if (view.getMode && view.getMode() !== 'preview') {
    view.setState?.({ state: 'preview' }, { history: false });
  }
}

/** play selection flow 経由で再生（テスト可能関数） */
export async function addMdToTts(
  app: App,
  file: { path: string; extension?: string },
  cfg: ClaudianBridgeSettings,
): Promise<boolean> {
  if (!cfg.tts.enabled) {
    new Notice('🔇 ミュート中です');
    return false;
  }

  const filePath = file.path;
  if (!file.path.endsWith('.md') && file.extension !== 'md') {
    return false;
  }

  // 1. ファイルを開く（Preview モードへ）
  await openInPreview(app, filePath);

  // 2. 本文取得 + フィルタ
  const tFile = app.vault.getAbstractFileByPath(filePath);
  if (!tFile) return false;
  const content = await app.vault.cachedRead(tFile as TFile);
  const filter = resolveSpeechFilter(cfg, 'md');
  const text = extractMdText(content, filter);

  // 3. F-028: state 登録（ハイライトが enabled の場合のみ）
  const hlEnabled = cfg.tts.mdReadHighlight?.enabled !== false;
  if (hlEnabled) {
    const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
    const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);
    prepareMdRead({ enabled: hlEnabled, filePath, content, filteredText: text, chunkMax });
  }

  // 4. speakText 実行（onChunkStart でハイライト連動）
  const ok = await speakText('md', text, cfg, {
    noticeOnEmpty: true,
    onChunkStart: createChunkStartHook(hlEnabled),
  });

  // 5. finalize
  if (hlEnabled) finalizeMdRead(ok);

  return ok;
}

/** LocaleStrings を取得するヘルパ（再 export 用に用意） */
export function ttsAddToTtsLabel(): string {
  return getLocaleStrings(getUILanguage()).ttsAddToTts;
}
