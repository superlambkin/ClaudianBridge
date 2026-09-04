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
import { filterSpeechText } from './speech-filter';
import { chunkTextNatural } from './chunking';
import { extractMdText } from './md-file-read';
import {
  finalizeMdRead,
  createChunkStartHook,
} from './md-read-highlight/runtime';
import { mdReadState } from './md-read-highlight/state';
import { normalizeForMatch, anchorPrefix } from './md-read-highlight/match';
import { openInPreview } from './md-read-highlight/open-in-preview-flow';
import { getPlaybackController } from './playback-controller';
import { applyProfileTransform } from './profile';
import { loadTermsDict } from './terms-dict';
import { playBeep } from './audio-beep';

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
  let text = extractMdText(content, filter);

  // v0.36.0 (F-032): 聴き手プロファイル変換（original 以外）。用語辞書もここで読み込む
  const profile = cfg.tts.mdReadProfile ?? 'original';
  if (profile !== 'original') {
    const termsMap = await loadTermsDict(app, cfg.tts.termsDict ?? '');
    text = applyProfileTransform(text, profile, termsMap);
  }

  const hlEnabled = cfg.tts.mdReadHighlight?.enabled !== false;
  // v0.35.x: 読み上げ開始ごとに再生制御を初期化（前回中断の abort フラグを解除）
  if (hlEnabled) getPlaybackController().reset();

  // v0.35.x: ファイル名を先に読み上げる（本文の前・ハイライト対象外）
  const basename = (tFile as TFile | null)?.basename
    ?? filePath.split('/').pop()?.replace(/\.md$/i, '')
    ?? '';
  const filenameText = basename.replace(/_/g, ' ').trim();
  if (filenameText) {
    await speakText('md', filenameText, cfg, { noticeOnEmpty: false });
  }

  // 3. F-028: state 登録（ハイライトが enabled の場合のみ）
  // v0.32.9 修正: これまで buildChunks（行パッキング分割）で chunks を作って
  // いたが、TTS 本体（core.ts）は filterSpeechText + chunkText（句点区切り
  // パッキング）で別アルゴリズム分割するため、500 字超の文書で index が
  // ズレ／範囲外になり下線が止まっていた。TTS と完全に同一の分割結果から
  // chunks を生成し、onChunkStart の index を完全一致させる。
  if (hlEnabled) {
    const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
    const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);
    // speakText と同じフィルタを適用（最終的に core に渡るテキストを再現）
    const optimized = filterSpeechText(text.trim(), filter);
    const ttsChunks = chunkMax > 0 && optimized.length > chunkMax
      ? chunkTextNatural(optimized, chunkMax)
      : [optimized];
    const anchors = ttsChunks.map((t) => {
      const a = normalizeForMatch(t);
      return anchorPrefix(a || t, 24);
    });
    mdReadState.register(filePath, anchors.map((anchor, i) => ({
      index: i,
      startLine: 0,
      anchor,
      text: ttsChunks[i],
      headingLevel: 0 as const,
    })));
  }

  // 4. speakText 実行（onChunkStart でハイライト連動）
  // v0.36.0 (F-032): DR プロファイル時、[BEEP] マーカーを含むチャンクの開始時に警告音
  let drBeepChunks: string[] | null = null;
  if (profile === 'dr') {
    const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
    const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);
    const optimized = filterSpeechText(text.trim(), filter);
    drBeepChunks = chunkMax > 0 && optimized.length > chunkMax
      ? chunkTextNatural(optimized, chunkMax)
      : [optimized];
  }
  const baseHook = createChunkStartHook(hlEnabled);
  const onChunkStart = drBeepChunks
    ? (idx: number) => {
        baseHook?.(idx);
        if (drBeepChunks?.[idx]?.includes('[BEEP]')) playBeep();
      }
    : baseHook;
  const ok = await speakText('md', text, cfg, {
    noticeOnEmpty: true,
    onChunkStart,
  });

  // 5. finalize
  if (hlEnabled) finalizeMdRead(ok);

  return ok;
}

/** LocaleStrings を取得するヘルパ（再 export 用に用意） */
export function ttsAddToTtsLabel(): string {
  return getLocaleStrings(getUILanguage()).ttsAddToTts;
}
