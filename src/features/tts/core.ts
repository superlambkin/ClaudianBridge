import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { PlachtaSettings, TtsChunkMaxChars, TtsCliSpeechFilter, TtsEdgeCloudSettings, TtsEngine } from '../../core/settings';
import { DEFAULT_CHUNK_MAX_CHARS, DEFAULT_EDGE_CHUNK_MAX_CHARS } from '../../core/settings';
import { plachtaSpeakChunksPipelined, playObjectUrl } from './plachta-tts';
import { chunkText, speakChunks, chunkTextNatural } from './chunking';
import { getPlaybackController } from './playback-controller';
import { registerPlayback, stopAllPlayback, getStopEpoch } from './playback-registry';
import { localEdgeTtsSpeak } from './edge-tts-local';

type NoticeFn = (m: string) => void;

/**
 * Minimal TTS settings surface consumed by core.ts. The real settings
 * (with engine-specific nested objects) come from ClaudianBridgeSettings
 * and are passed by main.ts / settings.ts; this interface is the subset
 * the engine implementations need.
 *
 * v0.8.0: spawn ベースのローカル VITS を完全削除し Plachta Cloud に置換。
 * v0.12.1: 読み上げ文最適化（speech_filter）を全読み上げ経路に適用。
 */
export interface TtsSettings {
  engine: TtsEngine;
  /** IETF/voice-name map per engine per language (populated from data.json). */
  voices: {
    edge:      { zh: string; ja: string; en: string };
    webspeech: { zh: string; ja: string; en: string };
  };
  /** v0.8.0: Plachta Cloud TTS の設定。engine === 'plachta' のとき使用。 */
  plachta?: PlachtaSettings;
  /** v0.12.1: 読み上げ文最適化スイッチ（cli.speech_filter を全経路で適用）。 */
  cli?: { speech_filter?: TtsCliSpeechFilter };
  /** v0.18.0: エンジン別チャンク上限（edge: 100〜2000 既定500 / webspeech・plachta: 50〜140 既定140） */
  chunkMaxChars?: Partial<TtsChunkMaxChars>;
  /** v0.20.0: ローカル EdgeTTS の edge_tts モジュール場所（空=自動: プラグイン内 edge_tts → site-packages）。 */
  edgeTtsModulePath?: string;
  /** v0.27.0: 言語モード（auto / 固定）。localEdgeTtsSpeak で pickLang に渡す */
  addToTtsLanguageMode?: 'auto' | 'ja' | 'zh' | 'en';
  /** v0.27.0: クラウド EdgeTTS プロキシ設定（HTTPS POST 経路・Task 6 で追加） */
  edgeCloud?: TtsEdgeCloudSettings;
}

/** 選択中エンジンに対応する言語別 voices を取得 */
export function voicesFor(settings: TtsSettings, lang: 'zh' | 'ja' | 'en'): string {
  // plachta は voices マップを持たない（音声モデルはクラウド側 (HF Space) で speaker 文字列で指定する）。
  // dispatcher 側で処理するため、voicesFor は edge / webspeech のみを返す。
  if (settings.engine === 'plachta') return '';
  // v0.20.0: edge-local はローカル実行の edge_tts で同じ音声マップを使う
  if (settings.engine === 'edge-local') return settings.voices.edge[lang];
  return settings.voices[settings.engine][lang];
}

/** テスト読みボタン用サンプルテキスト */
export const SAMPLE_TEXT: Record<'zh' | 'ja' | 'en', string> = {
  zh: '你好，这是一段测试文本。',
  ja: 'こんにちは、テスト読みです。',
  en: 'Hello, this is a test reading.',
};

/* ============================================================================
 * Engine: edge-tts（クラウド・高品質）
 * ========================================================================== */
/**
 * v0.27.0: クラウド EdgeTTS（HTTPS POST プロキシ方式）。
 * settings.edgeCloud.serverUrl へ POST。body は { text, voice, lang } 標準プロトコル。
 * レスポンスは audio/mpeg (or audio/wav) の Blob を想定し、playObjectUrl で再生。
 *
 * 旧 claudettsHttpSpeak（POC_015 依存・固定パス spawn 実装）は完全削除。
 * ~/.claude/skills/claude-tts/scripts/commands.py ハードコード呼び出しも撤廃。
 */
/**
 * v0.27.0: クラウド EdgeTTS（HTTPS POST プロキシ方式）。
 * settings.edgeCloud.serverUrl へ POST。body は { text, voice, lang } 標準プロトコル。
 * レスポンスは audio/mpeg (or audio/wav) の Blob を想定し、playObjectUrl で再生。
 *
 * 旧 claudettsHttpSpeak（POC_015 依存・固定パス spawn 実装）は完全削除。
 * ~/.claude/skills/claude-tts/scripts/commands.py ハードコード呼び出しも撤廃。
 *
 * v0.27.1: lang を明示渡しできる（チャンク分割時に全文判定結果を全チャンクへ統一適用）。
 * 未指定時は従来どおり text から auto 判定する。
 */
/**
 * v0.35.0: Edge クラウドへテキストを送り音声 Blob を取得する（再生はしない）。
 * 先行取得パイプライン（fetchEdgeBlobPipelined）から利用される。
 */
async function fetchEdgeBlob(
  text: string,
  settings: TtsSettings,
  noticeFn: NoticeFn,
  lang?: TtsLang,
): Promise<Blob | null> {
  // v0.35.2: 別 MD 切替時の即時中止に従う
  if (getPlaybackController().isAborted()) return null;
  const cloud = settings.edgeCloud;
  if (!cloud?.serverUrl) {
    noticeFn('⚠️ クラウドサーバ URL 未設定。設定タブで edgeCloud.serverUrl を入力してください');
    return null;
  }

  const resolvedLang = lang ?? pickLang(text, settings.addToTtsLanguageMode ?? 'auto');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cloud.authToken) headers['Authorization'] = `Bearer ${cloud.authToken}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cloud.timeout);

  try {
    const res = await fetch(cloud.serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        voice: settings.voices.edge[resolvedLang],
        lang: resolvedLang,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      noticeFn(`⚠️ クラウド EdgeTTS 失敗 (HTTP ${res.status})`);
      return null;
    }
    return await res.blob();
  } catch (e) {
    clearTimeout(timer);
    noticeFn(`⚠️ クラウド EdgeTTS エラー: ${(e as Error).message}`);
    return null;
  }
}

export async function edgeCloudHttpSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: NoticeFn,
  lang?: TtsLang,
): Promise<boolean> {
  const blob = await fetchEdgeBlob(text, settings, noticeFn, lang);
  if (blob === null) return false;
  const url = URL.createObjectURL(blob);
  return await playObjectUrl(url, noticeFn, 'edge');
}

/* ============================================================================
 * Engine: Web SpeechSynthesis API (browser)
 * ========================================================================== */

// v0.20.0: pickWebSpeechLang は lang.ts へ分離（edge-tts-local と共用）。
// v0.27.0: pickLang(text, mode) も共用（edgeCloudHttpSpeak / localEdgeTtsSpeak）。
// re-export で既存 import を維持しつつ、webSpeechSpeak 内部でも使うため import も行う。
import { pickLang, pickWebSpeechLang } from './lang';
import type { TtsLang } from './lang';
export { pickLang, pickWebSpeechLang } from './lang';
export type { TtsLang } from './lang';

/**
 * v0.27.1: lang を明示渡しできる（チャンク分割時に全文判定結果を全チャンクへ統一適用）。
 * 未指定時は従来どおり text から auto 判定する。
 */
export async function webSpeechSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: NoticeFn,
  lang?: TtsLang,
): Promise<boolean> {
  if (typeof window === 'undefined' || !window || !('speechSynthesis' in window)) {
    noticeFn('⚠️ Web SpeechSynthesis API が利用できません');
    return false;
  }
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { /* ignore */ }
  try {
    // Use the SpeechSynthesisUtterance via global so the test (Node) env doesn't need the type.
    const Ctor = (window as unknown as { SpeechSynthesisUtterance?: new (t: string) => unknown }).SpeechSynthesisUtterance;
    if (!Ctor) { noticeFn('⚠️ SpeechSynthesisUtterance 未定義'); return false; }
    const u = new Ctor(text) as {
      voice?: { name?: string } | null;
      lang?: string;
      onend?: (() => void) | null;
      onerror?: ((e: unknown) => void) | null;
    };
    // Priority: 選択中エンジンの voices[lang] → matched voice → lang fallback
    const detected = lang ?? pickWebSpeechLang(text);
    const voiceName = settings.voices.webspeech[detected];
    if (voiceName) {
      const voices = synth.getVoices();
      const matched = voices.find((v) => v.name === voiceName);
      if (matched) u.voice = matched;
      else u.lang = detected;
    } else if (!u.voice && !u.lang) {
      u.lang = detected;
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let intentionalStop = false;
      let timeout: ReturnType<typeof setTimeout>;
      let unregister: () => void = () => {};
      const settle = (v: boolean): void => {
        if (settled) return;
        settled = true;
        unregister();
        clearTimeout(timeout);
        resolve(v);
      };
      u.onend = () => settle(intentionalStop ? false : true);
      u.onerror = (e) => {
        if (!intentionalStop) {
          console.error('[WebSpeech error]', e);
          noticeFn('⚠️ Web Speech 再生エラー');
        }
        settle(false);
      };
      // ブラウザによっては onend が発火しない環境があるため 30 秒ガード
      timeout = setTimeout(() => settle(false), 30_000);
      // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
      unregister = registerPlayback({
        engine: 'webspeech',
        stop: () => {
          intentionalStop = true;
          try { synth.cancel(); } catch { /* ignore */ }
        },
      });
      try {
        synth.speak(u as unknown as SpeechSynthesisUtterance);
      } catch (e) {
        noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
        settle(false);
      }
    });
  } catch (e) {
    noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
    return false;
  }
}

/* ============================================================================
 * 読み上げ文最適化（speech_filter）
 * v0.17.0: Task 2 で分離した speech-filter.ts を再エクスポート。
 * チェック=含めて読む（true は除去しない）。addTextToTTS では適用せず speakText 側で適用する。
 * ========================================================================== */
export { filterSpeechText } from './speech-filter';

/* ============================================================================
 * Dispatcher
 * ========================================================================== */

export async function addTextToTTS(
  _app: App | null,
  text: string,
  settings: TtsSettings,
  onChunkStart?: (idx: number) => void,
): Promise<boolean> {
  const noticeFn = (m: string): void => { new Notice(m); };

  // v0.17.0: テキスト最適化（speech_filter）は speakText 側で適用済み。ここでは適用しない（二重フィルタ防止）。
  const trimmed = text.trim();
  if (!trimmed) return true;

  // v0.18.1: 重複読み防止 — 新しい読み上げ開始前に既存の全再生を中断（後勝ち）
  stopAllPlayback();
  // v0.18.x (F1): この読みの開始時エポック基準値（自身の開始割り込み後）。
  // 後続の停止（この読みへの外部中断）で初めて基準値を超える → 中断を非エラーと判定できる。
  const stopEpochAtStart = getStopEpoch();

  // 生成中/再生中の進行状況を永続 Notice で表示するヘルパー（null で非表示）
  let progress: Notice | null = null;
  const showProgress = (msg: string | null): void => {
    if (msg === null) {
      progress?.hide();
      progress = null;
    } else if (progress) {
      progress.setMessage(msg);
    } else {
      progress = new Notice(msg, 0);
    }
  };

  // v0.18.0: エンジン別のチャンク上限（edge は既定 500・他は 140）
  // v0.20.0: edge-local は edge と同じチャンク上限・音声を使う
  const engineForChunk = settings.engine === 'edge-local' ? 'edge' : settings.engine;
  const engineDefault = engineForChunk === 'edge' ? DEFAULT_EDGE_CHUNK_MAX_CHARS : DEFAULT_CHUNK_MAX_CHARS;
  const limit = settings.chunkMaxChars?.[engineForChunk] ?? engineDefault;
  // v0.27.1: 言語は分割前の全文で 1 回だけ判定する。
  // チャンクごとに auto 判定すると、区切り方次第で英語/中国語チャンクが生まれ音声が途中で変わるため。
  const readLang = pickLang(trimmed, settings.addToTtsLanguageMode ?? 'auto');
  // v0.35.0: 見出し行で強制新チャンク＋文末優先パック（ハイライト登録側と同一関数）
  const chunks = limit > 0 && trimmed.length > limit ? chunkTextNatural(trimmed, limit) : [trimmed];
  if (chunks.length > 1) {
    console.log(`[claudian-bridge TTS] chunking: ${trimmed.length} chars → ${chunks.length} chunks (engine: ${settings.engine}, lang: ${readLang})`);
  }

  // v0.10.0 UAT: plachta はパイプライン再生（次チャンクを先行合成してギャップ解消）
  if (settings.engine === 'plachta') {
    // v0.34.0: onChunkStart 指定時のみ第 5 引数で伝播（MD 読み上げハイライト用・下線原因⑥）
    const plachtaOk = onChunkStart !== undefined
      ? await plachtaSpeakChunksPipelined(chunks, settings, noticeFn, showProgress, onChunkStart)
      : await plachtaSpeakChunksPipelined(chunks, settings, noticeFn, showProgress);
    // v0.18.x (F1): 後続の外部停止（後勝ち中断）で失敗してもエラー扱いしない
    if (!plachtaOk && getStopEpoch() > stopEpochAtStart) return true;
    return plachtaOk;
  }

  // v0.18.1: エンジン名を表示（ユーザー改良要望）
  const engineLabels: Record<TtsEngine, string> = {
    edge: 'Edge-TTS',
    webspeech: 'WebSpeech',
    plachta: 'Plachta',
    'edge-local': 'ローカル EdgeTTS',
  };
  const progressMsg = (settings.engine === 'edge' || settings.engine === 'edge-local')
    ? `⏳ [${engineLabels[settings.engine]}] 音声生成中…（読み上げ）`
    : `▶ [${engineLabels[settings.engine]}] 読み上げ中…`;
  showProgress(progressMsg);
  // v0.35.0: Edge 先行変換（plachta パイプラインと同型）
  // チャンク i の再生中にチャンク i+1 の音声を fetch し、Blob URL を先に用意する。
  let pendingEdge: Promise<string | null> | null = null;
  const speakEdgeWithPrefetch = async (text: string, idx: number): Promise<boolean> => {
    // v0.35.2: 別 MD 切替時の即時中止に従う
    if (getPlaybackController().isAborted()) return false;
    let url: string | null = null;
    if (pendingEdge) {
      url = await pendingEdge;
      pendingEdge = null;
    }
    if (url === null) {
      const blob = await fetchEdgeBlob(text, settings, noticeFn, readLang);
      if (blob === null) return false;
      url = URL.createObjectURL(blob);
    }
    if (idx + 1 < chunks.length) {
      pendingEdge = fetchEdgeBlob(chunks[idx + 1], settings, noticeFn, readLang)
        .then((b) => (b ? URL.createObjectURL(b) : null));
    }
    return await playObjectUrl(url, noticeFn, 'edge');
  };
  const result = await speakChunks(chunks, async (chunk, idx) => {
    if (settings.engine === 'edge') {
      return speakEdgeWithPrefetch(chunk, idx);  // v0.35.0: 先行取得パイプライン
    }
    if (settings.engine === 'edge-local') {
      return localEdgeTtsSpeak(chunk, settings, noticeFn, readLang);
    }
    return webSpeechSpeak(chunk, settings, noticeFn, readLang);
  }, undefined, onChunkStart);
  showProgress(null);
  // v0.18.x (F1): 後続の外部停止（後勝ち中断）で失敗してもエラー扱いしない
  if (!result && getStopEpoch() > stopEpochAtStart) return true;
  return result;
}
