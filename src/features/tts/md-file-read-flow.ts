/**
 * v0.33.3 (F-028): MD ファイル右クリック「Add to TTS」のフローを
 * 抽出した関数。setupMdFileRead の menu click handler から呼ばれ、
 * テストからも直接 invoke できる。
 *
 * v0.37.0 (F-033): プロファイル非 original のとき、各セクションを Claude CLI で
 * 聞き手向け口頭原稿に書き換えてから読み上げる。失敗時はトークン変換（F-032）へ
 * フォールバック。書き換え時は見出し単位の粗ハイライト。
 * v0.37.1 (F-033 修正): LLM 生成のキャンセル/世代ガード・空セクション除外・
 * DR マーカー除去・キャッシュ鮮度(内容ハッシュ)・フォールバック時の原文 anchor。
 */
import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
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
import { beginLlmSession, endLlmSession, isCurrent, abortIfOtherLlmActive, type LlmSession } from './llm-session';
import { runClaudePrompt } from '../llm/claude-cli';

export { openInPreview };

/**
 * v0.37.0: LLM 原稿書き換えの実行。成功時 { origSections, speakBodies } を返す。
 * 失敗・キャッシュ無効・中断時は null（呼び出し側が従来経路/中断へ）。
 */
async function tryLlmRewrite(
  app: App,
  filePath: string,
  content: string,
  cfg: ClaudianBridgeSettings,
  session: LlmSession,
): Promise<{ origSections: MdSection[]; speakBodies: string[] } | null> {
  const profile = cfg.tts.mdReadProfile ?? 'original';
  if (profile === 'original') return null;
  const cacheEnabled = cfg.tts.llmRewriteCache !== false;
  const key = rewriteCacheKey(filePath, content, profile);

  const origSections = parseSections(content);
  if (origSections.length === 0) return null;

  // v0.37.1 (LOW-1): キャッシュ無効時は RewriteCache を構築しない（同期 I/O 回避）
  const cache = cacheEnabled ? new RewriteCache(getPluginDir(app, manifest)) : null;

  // 1) キャッシュ確認
  if (cache) {
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

  // 2) LLM 生成（進行 Notice・abort 可能）
  const progress = new Notice('📝 原稿生成中…', 0);
  const runFn = async (p: string): Promise<string | null> => {
    if (session.signal.aborted) return null;
    return runClaudePrompt(p, { signal: session.signal });
  };
  const concurrency = cfg.tts.llmRewriteConcurrency ?? 2;
  const res = await rewriteSections(
    origSections,
    profile,
    runFn,
    (done, total) => { try { progress.setMessage(`📝 原稿生成中 ${done}/${total}…`); } catch { /* ignore */ } },
    concurrency,
  );
  try { progress.hide(); } catch { /* ignore */ }

  if (session.signal.aborted || !isCurrent(session.gen)) return null;
  if (res.failed) return null;

  const speakBodies = res.rewritten.map((s) => s.bodyText);
  if (cache) {
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

  // v0.37.1 (N4): 別ファイルの新規 Add-to-TTS が進行中の LLM 生成を中断
  abortIfOtherLlmActive(filePath);

  // 1. ファイルを開く（Preview モードへ）— v0.33.4: openLinkText ベース
  await openInPreview(app, filePath);

  // 2. 本文取得 + フィルタ
  const tFile = app.vault.getAbstractFileByPath(filePath);
  if (!tFile) return false;
  const content = await app.vault.cachedRead(tFile as TFile);
  const filter = resolveSpeechFilter(cfg, 'md');

  const profile = cfg.tts.mdReadProfile ?? 'original';
  const hlEnabled = cfg.tts.mdReadHighlight?.enabled !== false;
  // v0.35.x: 読み上げ開始ごとに再生制御を初期化
  if (hlEnabled) getPlaybackController().reset();

  // v0.35.x: ファイル名を先に読み上げる
  const basename = (tFile as TFile | null)?.basename
    ?? filePath.split('/').pop()?.replace(/\.md$/i, '')
    ?? '';
  const filenameText = basename.replace(/_/g, ' ').trim();
  if (filenameText) {
    await speakText('md', filenameText, cfg, { noticeOnEmpty: false });
  }

  // v0.37.0: 原文（DOM 照合用）を先に抽出。ハイライト anchor は常に原文ベース。
  const originalText = extractMdText(content, filter);

  // v0.37.0 (F-033): LLM 原稿書き換え（非 original）。失敗/中断は null → 従来経路 or 中断
  let llm: { origSections: MdSection[]; speakBodies: string[] } | null = null;
  let session: LlmSession | null = null;
  if (profile !== 'original') {
    session = beginLlmSession(filePath);
    llm = await tryLlmRewrite(app, filePath, content, cfg, session).catch(() => null);
    if (session.signal.aborted || !isCurrent(session.gen)) {
      endLlmSession(session.gen);
      // 新しい読み上げが始まった/中断された場合はこの読み上げを静かに終了
      return true;
    }
  }

  const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
  const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);

  // 3. F-028: state 登録（ハイライトが enabled の場合のみ）
  if (hlEnabled) {
    if (llm) {
      // v0.37.0: 書き換え時は「見出し単位の粗ハイライト」（anchor は原文 DOM 用）
      mdReadState.register(filePath, llm.origSections.map((s, i) => ({
        index: i,
        startLine: 0,
        anchor: anchorPrefix(normalizeForMatch(s.heading) || s.bodyText, 24),
        text: s.bodyText,
        headingLevel: 0 as const,
      })));
    } else {
      // v0.37.1 (M4): anchor は常に原文ベース（トークン変換後では DOM と不一致のため）
      const optimized = filterSpeechText(originalText.trim(), filter);
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
  }

  // 4. speakText 実行
  let ok: boolean;
  if (llm && session) {
    // v0.37.0: セクションごとに読み上げ。各セクション開始で activeIdx = sectionIdx
    ok = true;
    for (let sIdx = 0; sIdx < llm.speakBodies.length; sIdx++) {
      if (!isCurrent(session.gen) || session.signal.aborted || getPlaybackController().isAborted()) {
        ok = false; break;
      }
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
    // 従来: 原文 or トークン変換文を 1 度に読み上げ
    let text = originalText;
    if (profile !== 'original') {
      const termsMap = await loadTermsDict(app, cfg.tts.termsDict ?? '');
      text = applyProfileTransform(originalText, profile, termsMap);
    }
    const baseHook = createChunkStartHook(hlEnabled);
    let drBeepChunks: string[] | null = null;
    if (profile === 'dr') {
      const optimized = filterSpeechText(text.trim(), filter);
      drBeepChunks = chunkMax > 0 && optimized.length > chunkMax
        ? chunkTextNatural(optimized, chunkMax)
        : [optimized];
      // v0.37.1 (M1): [BEEP] マーカーは TTS に渡さず、ビープ判定のみに使う
      text = text.replace(/\[BEEP\]\s*/g, '');
    }
    const onChunkStart = drBeepChunks
      ? (idx: number) => {
          baseHook?.(idx);
          if (drBeepChunks?.[idx]?.includes('[BEEP]')) playBeep();
        }
      : baseHook;
    ok = await speakText('md', text, cfg, {
      noticeOnEmpty: true,
      onChunkStart,
    });
  }

  // 5. finalize
  if (session) endLlmSession(session.gen);
  if (hlEnabled) finalizeMdRead(ok);

  return ok;
}

/** LocaleStrings を取得するヘルパ（再 export 用に用意） */
export function ttsAddToTtsLabel(): string {
  return getLocaleStrings(getUILanguage()).ttsAddToTts;
}
