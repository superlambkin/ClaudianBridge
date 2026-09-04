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
 *
 * v0.37.0 (F-033): プロファイル非 original のとき、各セクションを Claude CLI で
 * 聞き手向け口頭原稿に書き換えてから読み上げる。失敗時はトークン変換（F-032）へ
 * フォールバック。書き換え時は見出し単位の粗ハイライト。
 */
import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import * as path from 'path';
import type { ConfigStore } from '../../core/config-store';
import type { ClaudianBridgeSettings } from '../../core/settings';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { getPluginDir } from '../../core/plugin-dir';
import manifest from '../../manifest.json';
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
import { parseSections, rewriteSections, type MdSection } from './llm-rewrite';
import { rewriteCacheKey, RewriteCache } from './llm-rewrite-cache';
import { runClaudePrompt } from '../llm/claude-cli';

export { openInPreview };

/**
 * v0.37.0: LLM 原稿書き換えの実行。成功時 { origSections, speakBodies } を返す。
 * 失敗・キャッシュ無効時は null（呼び出し側がトークン変換へフォールバック）。
 */
async function tryLlmRewrite(
  app: App,
  filePath: string,
  content: string,
  cfg: ClaudianBridgeSettings,
): Promise<{ origSections: MdSection[]; speakBodies: string[] } | null> {
  const profile = cfg.tts.mdReadProfile ?? 'original';
  if (profile === 'original') return null;
  let cache: RewriteCache;
  try {
    cache = new RewriteCache(getPluginDir(app, manifest));
  } catch {
    return null; // プラグインディレクトリ解決不可 → LLM 経路は使わない
  }
  const key = rewriteCacheKey(filePath, content.length, profile);
  const cacheEnabled = cfg.tts.llmRewriteCache !== false;

  const origSections = parseSections(content);
  if (origSections.length === 0) return null;

  // 1) キャッシュ確認
  if (cacheEnabled) {
    const cached = await cache.get(key);
    if (cached) {
      try {
        const bodies = JSON.parse(cached) as string[];
        if (Array.isArray(bodies) && bodies.length === origSections.length) {
          return { origSections, speakBodies: bodies };
        }
      } catch { /* 破損 → 再生成 */ }
    }
  }

  // 2) LLM 生成（進行 Notice）
  const progress = new Notice('📝 原稿生成中…', 0);
  const res = await rewriteSections(
    origSections,
    profile,
    runClaudePrompt,
    (done, total) => { try { progress.setMessage(`📝 原稿生成中 ${done}/${total}…`); } catch { /* ignore */ } },
  );
  try { progress.hide(); } catch { /* mock/非表示環境は無視 */ }

  if (res.failed) return null;

  const speakBodies = res.rewritten.map((s) => s.bodyText);
  if (cacheEnabled) {
    try { await cache.put(key, JSON.stringify(speakBodies)); } catch { /* ignore */ }
  }
  return { origSections, speakBodies };
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

  // 1. ファイルを開く（Preview モードへ）— v0.33.4: openLinkText ベース
  await openInPreview(app, filePath);

  // 2. 本文取得 + フィルタ
  const tFile = app.vault.getAbstractFileByPath(filePath);
  if (!tFile) return false;
  const content = await app.vault.cachedRead(tFile as TFile);
  const filter = resolveSpeechFilter(cfg, 'md');

  const profile = cfg.tts.mdReadProfile ?? 'original';
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

  // v0.37.0 (F-033): LLM 原稿書き換え（非 original）。失敗・環境非対応は null → 従来経路へ
  const llm = profile !== 'original'
    ? await tryLlmRewrite(app, filePath, content, cfg).catch(() => null)
    : null;

  // v0.36.0 (F-032): トークン変換（LLM 成功時は使わないフォールバック用に確保）
  let fallbackText: string | null = null;

  // 3. F-028: state 登録（ハイライトが enabled の場合のみ）
  // v0.32.9 修正: これまで buildChunks（行パッキング分割）で chunks を作って
  // いたが、TTS 本体（core.ts）は filterSpeechText + chunkText（句点区切り
  // パッキング）で別アルゴリズム分割するため、500 字超の文書で index が
  // ズレ／範囲外になり下線が止まっていた。TTS と完全に同一の分割結果から
  // chunks を生成し、onChunkStart の index を完全一致させる。
  const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
  const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);

  if (hlEnabled && llm) {
    // v0.37.0: 書き換え時は「見出し単位の粗ハイライト」
    mdReadState.register(filePath, llm.origSections.map((s, i) => ({
      index: i,
      startLine: 0,
      anchor: anchorPrefix(normalizeForMatch(s.heading) || s.heading, 24),
      text: s.bodyText,
      headingLevel: 0 as const,
    })));
  } else if (hlEnabled) {
    let text = extractMdText(content, filter);
    if (profile !== 'original') {
      const termsMap = await loadTermsDict(app, cfg.tts.termsDict ?? '');
      fallbackText = applyProfileTransform(text, profile, termsMap);
      text = fallbackText;
    }
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

  // 4. speakText 実行
  let ok: boolean;
  if (llm) {
    // v0.37.0: セクションごとに読み上げ。各セクション開始で activeIdx = sectionIdx
    ok = true;
    for (let sIdx = 0; sIdx < llm.speakBodies.length; sIdx++) {
      if (getPlaybackController().isAborted()) { ok = false; break; }
      const body = llm.speakBodies[sIdx];
      if (!body.trim()) continue;
      if (hlEnabled) mdReadState.setActiveIdx(sIdx);
      const sectionOk = await speakText('md', body, cfg, { noticeOnEmpty: false });
      if (!sectionOk) {
        if (getPlaybackController().isAborted()) { ok = false; break; }
        ok = false; break;
      }
    }
  } else {
    // 従来: 本文を 1 度に読み上げ（fallbackText は抽出済みトークン変換文 or null）
    let text = fallbackText ?? extractMdText(content, filter);
    if (profile !== 'original' && fallbackText === null) {
      const termsMap = await loadTermsDict(app, cfg.tts.termsDict ?? '');
      text = applyProfileTransform(text, profile, termsMap);
    }
    const baseHook = createChunkStartHook(hlEnabled);
    const onChunkStart = profile === 'dr'
      ? (idx: number) => {
          baseHook?.(idx);
          const flat = (() => {
            const optimized = filterSpeechText(text.trim(), filter);
            return chunkMax > 0 && optimized.length > chunkMax ? chunkTextNatural(optimized, chunkMax) : [optimized];
          })();
          if (flat[idx]?.includes('[BEEP]')) playBeep();
        }
      : baseHook;
    ok = await speakText('md', text, cfg, {
      noticeOnEmpty: true,
      onChunkStart,
    });
  }

  // 5. finalize
  if (hlEnabled) finalizeMdRead(ok);

  return ok;
}

/** LocaleStrings を取得するヘルパ（再 export 用に用意） */
export function ttsAddToTtsLabel(): string {
  return getLocaleStrings(getUILanguage()).ttsAddToTts;
}
