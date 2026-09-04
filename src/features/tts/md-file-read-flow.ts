/**
 * v0.33.3 (F-028): MD ファイル右クリック「Add to TTS」のフロー。
 *
 * v0.37.0 (F-033): プロファイル非 original で各セクションを Claude CLI で
 * 聞き手向け口頭原稿に書き換えて読上げ。
 * v0.37.1:
 * - ストリーミング読上げ（全生成を待たず、できたセクションから順に再生）
 * - タイトル読上げ中から原稿生成を開始
 * - 中止（🔇）で全 LLM 子プロセス終了・ストリーム中断・state クリア
 * - 変換文は設定の読上げ最適化（絵文字/記号除外）で仕上げ、です・ます調を維持
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
import { extractMdText, normalizeMdForSpeech } from './md-file-read';
import { finalizeMdRead, createChunkStartHook } from './md-read-highlight/runtime';
import { mdReadState } from './md-read-highlight/state';
import { normalizeForMatch, anchorPrefix } from './md-read-highlight/match';
import { openInPreview } from './md-read-highlight/open-in-preview-flow';
import { getPlaybackController } from './playback-controller';
import { applyProfileTransform } from './profile';
import { loadTermsDict } from './terms-dict';
import { playBeep } from './audio-beep';
import { parseSections, rewriteSectionsStream, type MdSection } from './llm-rewrite';
import { rewriteCacheKey, RewriteCache } from './llm-rewrite-cache';
import { beginLlmSession, endLlmSession, isCurrent, abortIfOtherLlmActive, type LlmSession } from './llm-session';
import { runClaudePrompt } from '../llm/claude-cli';

export { openInPreview };

function safeCache(app: App): RewriteCache | null {
  try { return new RewriteCache(getPluginDir(app, manifest)); } catch { return null; }
}

/** v0.37.1: LLM 変換文を設定の読上げ最適化（絵文字/記号除外）で仕上げる */
function finishScript(text: string, cfg: ClaudianBridgeSettings): string {
  return filterSpeechText(normalizeMdForSpeech(text).trim(), resolveSpeechFilter(cfg, 'md')).trim();
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
  if (!file.path.endsWith('.md') && file.extension !== 'md') return false;

  abortIfOtherLlmActive(filePath);
  await openInPreview(app, filePath);

  const tFile = app.vault.getAbstractFileByPath(filePath);
  if (!tFile) return false;
  const content = await app.vault.cachedRead(tFile as TFile);
  const filter = resolveSpeechFilter(cfg, 'md');
  const profile = cfg.tts.mdReadProfile ?? 'original';
  const hlEnabled = cfg.tts.mdReadHighlight?.enabled !== false;
  if (hlEnabled) getPlaybackController().reset();

  const originalText = extractMdText(content, filter);
  const engineForChunk = cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine;
  const chunkMax = cfg.tts.chunkMaxChars?.[engineForChunk] ?? (engineForChunk === 'edge' ? 500 : 140);

  const registerOriginalChunks = (): void => {
    if (!hlEnabled) return;
    const optimized = filterSpeechText(originalText.trim(), filter);
    const ttsChunks = chunkMax > 0 && optimized.length > chunkMax ? chunkTextNatural(optimized, chunkMax) : [optimized];
    const anchors = ttsChunks.map((t) => anchorPrefix(normalizeForMatch(t) || t, 24));
    mdReadState.register(filePath, anchors.map((anchor, i) => ({ index: i, startLine: 0, anchor, text: ttsChunks[i], headingLevel: 0 as const })));
  };

  const registerCoarse = (sections: MdSection[]): void => {
    if (!hlEnabled) return;
    mdReadState.register(filePath, sections.map((s, i) => ({
      index: i, startLine: 0,
      anchor: anchorPrefix(normalizeForMatch(s.heading) || s.bodyText, 24),
      text: s.bodyText, headingLevel: 0 as const,
    })));
  };

  const readSection = async (sectionIdx: number, body: string): Promise<boolean> => {
    if (!body.trim()) return true;
    if (hlEnabled) mdReadState.setActiveIdx(sectionIdx);
    return speakText('md', body, cfg, { noticeOnEmpty: false });
  };

  // === 標準（original / トークンフォールバック） ===
  const runStandard = async (): Promise<boolean> => {
    registerOriginalChunks();
    let text = originalText;
    if (profile !== 'original') {
      const termsMap = await loadTermsDict(app, cfg.tts.termsDict ?? '');
      text = applyProfileTransform(originalText, profile, termsMap);
    }
    const baseHook = createChunkStartHook(hlEnabled);
    let drBeepChunks: string[] | null = null;
    if (profile === 'dr') {
      const optimized = filterSpeechText(text.trim(), filter);
      drBeepChunks = chunkMax > 0 && optimized.length > chunkMax ? chunkTextNatural(optimized, chunkMax) : [optimized];
      text = text.replace(/\[BEEP\]\s*/g, '');
    }
    const onChunkStart = drBeepChunks
      ? (idx: number) => { baseHook?.(idx); if (drBeepChunks?.[idx]?.includes('[BEEP]')) playBeep(); }
      : baseHook;
    return speakText('md', text, cfg, { noticeOnEmpty: true, onChunkStart });
  };

  // === LLM ストリーミング（非 original） ===
  if (profile !== 'original') {
    const session: LlmSession = beginLlmSession(filePath);
    const concurrency = cfg.tts.llmRewriteConcurrency ?? 2;
    const cacheEnabled = cfg.tts.llmRewriteCache !== false;
    const cache = cacheEnabled ? safeCache(app) : null;
    const key = rewriteCacheKey(filePath, content, profile);
    const orig = parseSections(content);
    const isCancelled = (): boolean => session.signal.aborted || !isCurrent(session.gen) || getPlaybackController().isAborted();

    if (orig.length === 0) {
      endLlmSession(session.gen);
      const okStd = await runStandard();
      if (hlEnabled) finalizeMdRead(okStd);
      return okStd;
    }
    registerCoarse(orig);

    // 1) キャッシュヒット
    if (cache) {
      const cached = await cache.get(key);
      if (cached) {
        try {
          const bodies = JSON.parse(cached) as string[];
          if (Array.isArray(bodies) && bodies.length === orig.length) {
            let ok = true;
            for (let i = 0; i < bodies.length; i++) {
              if (isCancelled()) { ok = false; break; }
              const r = await readSection(i, finishScript(bodies[i], cfg));
              if (!r) { ok = false; break; }
            }
            endLlmSession(session.gen);
            if (hlEnabled) finalizeMdRead(ok);
            return ok;
          }
        } catch { /* 破損 → 再生成 */ }
      }
    }

    // 2) ストリーミング生成。生成開始をタイトル読上げと並行させる
    const progress = new Notice('📝 原稿生成中…', 0);
    const genStartedAt = Date.now();
    const progressMsg = (done: number, total: number): string => {
      const sec = Math.floor((Date.now() - genStartedAt) / 1000);
      return `📝 原稿生成中 ${done}/${total}（${sec}s）…`;
    };
    const runFn = async (p: string): Promise<string | null> => {
      if (session.signal.aborted) return null;
      return runClaudePrompt(p, { signal: session.signal, disableThinking: true });
    };
    const stream = rewriteSectionsStream(orig, profile, runFn,
      (done, total) => { try { progress.setMessage(progressMsg(done, total)); } catch { /* ignore */ } },
      concurrency, session.signal);
    const firstP = stream.next();      // 生成開始（並列で後続も走る）

    let ok = true;
    let firstHandled = false;
    let firstFailed = false;
    const segments: string[][] = orig.map(() => []);
    let it = await firstP;             // 生成1 完了後、すぐに原稿1の読上げへ
    while (!it.done) {
      const item = it.value;
      if (isCancelled()) { ok = false; break; }
      if (!firstHandled) {
        firstHandled = true;
        if (!item.ok) { firstFailed = true; ok = false; break; }
      }
      const script = finishScript(item.body, cfg);
      if (item.ok) segments[item.index].push(item.body);
      const r = await readSection(item.index, script);
      if (!r) { ok = false; break; }
      it = await stream.next();
    }
    try { progress.hide(); } catch { /* ignore */ }

    if (ok && !isCancelled() && cache) {
      const sectionBodies = segments.map((arr) => arr.join('\n'));
      try { await cache.put(key, JSON.stringify(sectionBodies)); } catch { /* ignore */ }
    }
    endLlmSession(session.gen);

    if (firstFailed) {
      const okStd = await runStandard();
      if (hlEnabled) finalizeMdRead(okStd);
      return okStd;
    }
    if (hlEnabled) finalizeMdRead(ok);
    return ok;
  }

  // === original ===
  const ok = await runStandard();
  if (hlEnabled) finalizeMdRead(ok);
  return ok;
}

/** LocaleStrings を取得するヘルパ（再 export 用に用意） */
export function ttsAddToTtsLabel(): string {
  return getLocaleStrings(getUILanguage()).ttsAddToTts;
}
