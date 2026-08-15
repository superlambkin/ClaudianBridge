import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import type { PlachtaSettings, TtsCliSpeechFilter, TtsEngine } from '../../core/settings';
import { plachtaSpeakChunksPipelined } from './plachta-tts';
import { chunkText, speakChunks } from './chunking';
import { registerPlayback } from './playback-registry';

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
}

/** 選択中エンジンに対応する言語別 voices を取得 */
export function voicesFor(settings: TtsSettings, lang: 'zh' | 'ja' | 'en'): string {
  // plachta は voices マップを持たない（音声モデルはクラウド側 (HF Space) で speaker 文字列で指定する）。
  // dispatcher 側で処理するため、voicesFor は edge / webspeech のみを返す。
  if (settings.engine === 'plachta') return '';
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
 * POC_015 ClaudeTTS プラグインへ HTTP ブリッジ経由で speak 要求を発行。
 * プラグインが未配置でも NoOp で false を返す（VP_017 は POC_015 に依存しない）。
 */
export async function claudettsHttpSpeak(text: string, _settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let intentionalStop = false;
    const cmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');
    let child: ReturnType<typeof spawn>;
    console.log('[claudian-bridge TTS] spawning:', { cmd, textLen: text.length, textPreview: text.slice(0, 40) });
    try {
      child = spawn('python', [cmd, 'speak'], { windowsHide: true });
    } catch (e) {
      console.error('[claudian-bridge TTS] spawn threw:', e);
      noticeFn(`⚠️ ClaudeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }
    // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
    const unregister = registerPlayback({
      engine: 'edge',
      stop: () => {
        intentionalStop = true;
        try { child.kill(); } catch { /* ignore */ }
      },
    });
    let err = '';
    let out = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      console.error('[claudian-bridge TTS] spawn error event:', e.message);
      if (settled) return;
      settled = true;
      unregister();
      if (intentionalStop) {
        // v0.12.0: 意図的停止中のエラーはユーザー操作由来 → エラー扱いしない
        resolve(false);
        return;
      }
      noticeFn(`⚠️ ClaudeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      console.log('[claudian-bridge TTS] child close:', { code, stderr: err.slice(0, 300), stdout: out.slice(0, 100) });
      if (settled) return;
      settled = true;
      unregister();
      if (intentionalStop) {
        // v0.12.0: ユーザー操作による停止 → エラー扱いしない
        resolve(false);
        return;
      }
      if (code === 0) {
        if (/使い方|usage/i.test(err) || /使い方|usage/i.test(out)) {
          noticeFn('⚠️ ClaudeTTS speak サブコマンド未定義。~/.claude/skills/claude-tts/scripts/commands.py を更新してください');
          resolve(false);
          return;
        }
        resolve(true);
      } else {
        noticeFn(`⚠️ ClaudeTTS 失敗 (exit ${code}): ${err.slice(0, 200)}`);
        resolve(false);
      }
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

/* ============================================================================
 * Engine: Web SpeechSynthesis API (browser)
 * ========================================================================== */

/** Detect a likely IETF language code for the given text (best-effort). */
export function pickWebSpeechLang(text: string): string {
  const counts = { kana: 0, cjk: 0, latin: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x309f) counts.kana++; // hiragana
    else if (cp >= 0x30a0 && cp <= 0x30ff) counts.kana++; // katakana
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.cjk++; // CJK ideographs
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) counts.latin++;
  }
  if (counts.kana > 0 || counts.cjk > counts.latin) return counts.kana > counts.cjk ? 'ja' : 'zh';
  return 'en';
}

export async function webSpeechSpeak(text: string, settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
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
    const lang = pickWebSpeechLang(text);
    const voiceName = settings.voices.webspeech[lang as 'zh' | 'ja' | 'en'];
    if (voiceName) {
      const voices = synth.getVoices();
      const matched = voices.find((v) => v.name === voiceName);
      if (matched) u.voice = matched;
      else u.lang = lang;
    } else if (!u.voice && !u.lang) {
      u.lang = lang;
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
 * v0.12.1: POC_015 の朗读文案优化実装を TS へ移植。
 * emoji / 顔文字 / ASCII 表情 / emoji 短コード を除去して読み上げ品質を改善する。
 * ========================================================================== */

/** Emoji 主要 Unicode ブロック（絵文字・記号・変体セレクタ・ZWJ・キーキャップ） */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍⃣]+/gu;

/** 顔文字特徴文字（括弧内に 2 文字以上あれば顔文字とみなす） */
const KAOMOJI_CHARS = new Set('^_*;Tω∀ﾟД≧≦´`･・艸皿><▽'.split(''));

/** ASCII 表情（単語境界で一致） */
const ASCII_EMOTICON_RE = /(?<![\w])(?::-?[)DdPp]+|;-?[)DdPp]|X-?[Dd]|<3+|>:\(?)(?![\w])/g;

/** Emoji 短コード :smile: */
const SHORTCODE_RE = /:[a-z0-9_+\-]{2,}:/g;

/** 空になった括弧対を除去 */
const EMPTY_PAREN_RE = /[(（]\s*[)）]/g;

/** デフォルトの speech_filter（全最適化 ON） */
const DEFAULT_SPEECH_FILTER: Required<TtsCliSpeechFilter> = {
  emoji: true,
  kaomoji: true,
  ascii_emoticon: true,
  emoji_shortcode: true,
};

/** 括弧内に顔文字特徴文字が 2 つ以上あれば括弧ごと除去 */
function stripKaomoji(text: string): string {
  return text.replace(/[(（]([^()（）]*)[)）]/g, (m, inner: string) => {
    const count = [...inner].filter((ch) => KAOMOJI_CHARS.has(ch)).length;
    return count >= 2 ? ' ' : m;
  });
}

/**
 * speech_filter 設定に応じて読み上げ文を最適化する。
 * 未指定キーはデフォルト（ON）として扱う。sf 自体が undefined なら全最適化 ON。
 */
export function filterSpeechText(text: string, sf?: Partial<TtsCliSpeechFilter> | null): string {
  const opt: Required<TtsCliSpeechFilter> = { ...DEFAULT_SPEECH_FILTER, ...(sf ?? {}) };
  let t = text;
  if (opt.emoji) t = t.replace(EMOJI_RE, ' ');
  if (opt.kaomoji) t = stripKaomoji(t);
  if (opt.ascii_emoticon) t = t.replace(ASCII_EMOTICON_RE, ' ');
  if (opt.emoji_shortcode) t = t.replace(SHORTCODE_RE, ' ');
  t = t.replace(EMPTY_PAREN_RE, '');
  return t;
}

/* ============================================================================
 * Dispatcher
 * ========================================================================== */

/**
 * エンジン別チャンク上限（文字数）。null = チャンキングしない。
 * - plachta: HF Space の実測上限 150 字（2026-08-14 UAT 確認）に対し余裕を持たせ 140
 * - webspeech: Chrome の実効制限 ~250 文字に対し安全側 200
 * - edge: ClaudeTTS HTTP ブリッジ側で処理（制限なし）
 */
const ENGINE_CHUNK_LIMITS: Record<TtsEngine, number | null> = {
  plachta: 140,
  edge: null,
  webspeech: 200,
};

export async function addTextToTTS(_app: App | null, text: string, settings: TtsSettings): Promise<boolean> {
  const noticeFn = (m: string): void => { new Notice(m); };

  // v0.12.1: 読み上げ文最適化（emoji/顔文字/ASCII表情/短コード除去）を全経路に適用
  const optimized = filterSpeechText(text, settings.cli?.speech_filter);
  if (!optimized.trim()) return true; // 最適化後空なら読まない（エラー扱いしない）

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

  const limit = ENGINE_CHUNK_LIMITS[settings.engine];
  const chunks = limit !== null && optimized.length > limit ? chunkText(optimized, limit) : [optimized];
  if (chunks.length > 1) {
    console.log(`[claudian-bridge TTS] chunking: ${optimized.length} chars → ${chunks.length} chunks (engine: ${settings.engine})`);
  }

  // v0.10.0 UAT: plachta はパイプライン再生（次のチャンクを先行合成してギャップ解消）
  if (settings.engine === 'plachta') {
    return plachtaSpeakChunksPipelined(chunks, settings, noticeFn, showProgress);
  }

  // edge / webspeech: 操作中はプログレス表示（edge は合成+再生を1プロセスで行うため期間中表示）
  showProgress(settings.engine === 'edge' ? '⏳ 音声生成中…' : '▶ 読み上げ中…');
  const result = await speakChunks(chunks, async (chunk) => {
    // v0.8.0: edge = claude-tts スクリプト経由、webspeech = ブラウザ API
    if (settings.engine === 'edge') {
      return claudettsHttpSpeak(chunk, settings, noticeFn);
    }
    return webSpeechSpeak(chunk, settings, noticeFn);
  });
  showProgress(null);
  return result;
}
