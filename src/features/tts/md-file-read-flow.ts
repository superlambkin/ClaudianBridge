/**
 * v0.33.3 (F-028): MD ファイル右クリック「Add to TTS」のフロー。
 *
 * v0.37.0 (F-033): プロファイル非 original で各セクションを Claude CLI で
 * 聞き手向け口頭原稿に書き換えて読上げ。
 * v0.37.1: 生成を全セクション待たず「できたセクションから順に読む」ストリーミング。
 * 並列生成数（1〜8）・キャッシュ・です・ます調・中断/世代ガード・フォールバック対応。
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

  // v0.37.1 (N4): 別ファイルの新規 Add-to-TTS が進行中の LLM 生成を中断
  abortIfOtherLlmActive(filePath);

  await openInPreview(app, filePath);

  const tFile = app.vault.getAbstractFileByPath(filePath);
  if (!tFile) return false;
  const content = await app.vault.cachedRead(tFile as TFile);
  const filter = resolveSpeechFilter(cfg, 'md');
  const profile = cfg.tts.mdReadProfile ?? 'original';
  const hlEnabled = cfg.tts.mdReadHighlight?.enabled !== false;
  if (hlEnabled) getPlaybackController().reset();

  // ファイル名を先に読む
  const basename = (tFile as TFile | null)?.basename ?? filePath.split('/').pop()?.replace(/\.md$/i, '') ?? '';
  const filenameText = basename.replace(/_/g, ' ').trim();
  if (filenameText) await speakText('md', filenameText, cfg, { noticeOnEmpty: false });

  const originalText = extractMdText(content, filter);

  const registerOriginalChunks = (): void => {
    if (!hlEnabled) return;
    const optimized = filterSpeechText(originalText.trim(), filter);
    const chunkMax = cfg.tts.chunkMaxChars?.[cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine]
      ?? (cfg.tts.engine === 'edge-local' || cfg.tts.engine === 'edge' ? 500 : 140);
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

  // セクション本文を 1 つ読む（アクティブ位置更新込み）。false=中断/失敗
  const readSectionBody = async (sectionIdx: number, body: string): Promise<boolean> => {
    if (!body.trim()) return true;
    if (hlEnabled) mdReadState.setActiveIdx(sectionIdx);
    return speakText('md', body, cfg, { noticeOnEmpty: false });
  };

  // === 標準（original / トークンフォールバック）経路 ===
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
      const chunkMax = cfg.tts.chunkMaxChars?.[cfg.tts.engine === 'edge-local' ? 'edge' : cfg.tts.engine]
        ?? (cfg.tts.engine === 'edge-local' || cfg.tts.engine === 'edge' ? 500 : 140);
      drBeepChunks = chunkMax > 0 && optimized.length > chunkMax ? chunkTextNatural(optimized, chunkMax) : [optimized];
      text = text.replace(/\[BEEP\]\s*/g, ''); // v0.37.1 (M1)
    }
    const onChunkStart = drBeepChunks
      ? (idx: number) => { baseHook?.(idx); if (drBeepChunks?.[idx]?.includes('[BEEP]')) playBeep(); }
      : baseHook;
    return speakText('md', text, cfg, { noticeOnEmpty: true, onChunkStart });
  };

  // === LLM ストリーミング経路（非 original） ===
  if (profile !== 'original') {
    const session: LlmSession = beginLlmSession(filePath);
    const concurrency = cfg.tts.llmRewriteConcurrency ?? 2;
    const cacheEnabled = cfg.tts.llmRewriteCache !== false;
    const cache = cacheEnabled ? safeCache(app) : null;
    const key = rewriteCacheKey(filePath, content, profile);
    const orig = parseSections(content);
    const isCancelled = (): boolean => session.signal.aborted || !isCurrent(session.gen) || getPlaybackController().isAborted();

    if (orig.length > 0) {
      registerCoarse(orig);

      // 1) キャッシュヒットなら即全セクション読上げ
      if (cache) {
        const cached = await cache.get(key);
        if (cached) {
          try {
            const bodies = JSON.parse(cached) as string[];
            if (Array.isArray(bodies) && bodies.length === orig.length) {
              let ok = true;
              for (let i = 0; i < bodies.length; i++) {
                if (isCancelled()) { ok = false; break; }
                const r = await readSectionBody(i, bodies[i]);
                if (!r) { if (getPlaybackController().isAborted()) { ok = false; } else { ok = false; } break; }
              }
              endLlmSession(session.gen);
              if (hlEnabled) finalizeMdRead(ok);
              return ok;
            }
          } catch { /* 破損→再生成 */ }
        }
      }

      // 2) ストリーミング生成 → できたセクションから順に読上げ
      const progress = new Notice('📝 原稿生成中…', 0);
      const runFn = async (p: string): Promise<string | null> => {
        if (session.signal.aborted) return null;
        return runClaudePrompt(p, { signal: session.signal });
      };
      const stream = rewriteSectionsStream(orig, profile, runFn,
        (done, total) => { try { progress.setMessage(`📝 原稿生成中 ${done}/${total}…`); } catch { /* ignore */ } },
        concurrency, session.signal);

      let ok = true;
      let firstFailed = false;
      let bodyCount = 0;
      const generatedBodies: string[] = [];
      let first = true;
      try {
        for await (const item of stream) {
          if (isCancelled()) { ok = false; break; }
          if (first) {
            first = false;
            if (!item.ok && !session.signal.aborted) { firstFailed = true; ok = false; break; }
          }
          generatedBodies.push(item.body);
          bodyCount += 1;
          const r = await readSectionBody(item.index, item.ok ? item.body : item.body);
          if (!r) { ok = false; break; }
        }
      } finally {
        try { progress.hide(); } catch { /* ignore */ }
      }

      if (!firstFailed && ok && !session.signal.aborted && bodyCount === orig.length && cache) {
        try { await cache.put(key, JSON.stringify(generatedBodies)); } catch { /* ignore */ }
      }

      if (firstFailed) {
        // 初回生成が失敗（非中断）→ 全体をトークンフォールバックで読む
        endLlmSession(session.gen);
        const okStd = await runStandard();
        if (hlEnabled) finalizeMdRead(okStd);
        return okStd;
      }

      endLlmSession(session.gen);
      if (hlEnabled) finalizeMdRead(ok);
      return ok;
    }

    endLlmSession(session.gen);
    const okStd = await runStandard();
    if (hlEnabled) finalizeMdRead(okStd);
    return okStd;
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
