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
import { openInPreview } from './md-read-highlight/open-in-preview-flow';

export { openInPreview };

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

  // 1. ファイルを開く（Preview モードへ）— v0.33.4: openLinkText ベース
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
