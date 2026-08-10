import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

type NoticeFn = (m: string) => void;

/**
 * Minimal TTS settings surface consumed by core.ts. The real settings
 * (with engine-specific nested objects) come from ClaudianBridgeSettings
 * and are passed by main.ts / settings.ts; this interface is the subset
 * the engine implementations need.
 */
export interface TtsSettings {
  engine: 'edge' | 'claudetts' | 'auto' | 'webspeech' | 'minimax';
  /** IETF/voice-name map per language (populated from data.json). */
  voices?: { zh: string; ja: string; en: string };
  /** Engine-specific block for MiniMax. */
  minimax?: {
    enabled: boolean;
    apiKey: string;
    voiceIdZh: string;
    voiceIdJa: string;
    voiceIdEn: string;
    speed: number;
    vol: number;
    pitch: number;
    audioFormat: string;
  };
}

/* ============================================================================
 * Engine: ClaudeTTS (edge-tts / pyttsx3 / system.speech) — via HTTP bridge
 * ========================================================================== */

export async function claudettsHttpSpeak(text: string, _settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const cmd = path.join(os.homedir(), '.claude', 'skills', 'claude-tts', 'scripts', 'commands.py');
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('python', [cmd, 'speak'], { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ClaudeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }
    let err = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      noticeFn(`⚠️ ClaudeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(true);
      else {
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
    };
    // Priority: explicit voices[lang] → matched voice → lang fallback
    const lang = pickWebSpeechLang(text);
    const voiceName = settings.voices?.[lang as 'zh' | 'ja' | 'en'];
    if (voiceName) {
      const voices = synth.getVoices();
      const matched = voices.find((v) => v.name === voiceName);
      if (matched) u.voice = matched;
      else u.lang = lang;
    } else if (!u.voice && !u.lang) {
      u.lang = lang;
    }
    return await new Promise<boolean>((resolve) => {
      (u as unknown as { onerror: (e: unknown) => void }).onerror = () => {
        noticeFn('⚠️ Web Speech 再生エラー');
        resolve(false);
      };
      try {
        synth.speak(u as unknown as SpeechSynthesisUtterance);
        // Web Speech has no exit event; resolve optimistically after a tick
        setTimeout(() => resolve(true), 100);
      } catch (e) {
        noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
        resolve(false);
      }
    });
  } catch (e) {
    noticeFn(`⚠️ Web Speech 失敗: ${(e as Error).message}`);
    return false;
  }
}

/* ============================================================================
 * Engine: MiniMax cloud TTS — app.requestUrl() → hex audio → Blob → Audio()
 * ========================================================================== */

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

interface MiniMaxLangMap {
  zh: string;
  ja: string;
  en: string;
}

function pickLang<T>(text: string, byLang: MiniMaxLangMap & { default: T }): T {
  const counts = { kana: 0, cjk: 0, latin: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x30ff) counts.kana++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts.cjk++;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) counts.latin++;
  }
  if (counts.kana > 0) return byLang.ja as T;
  if (counts.cjk > counts.latin) return byLang.zh as T;
  if (counts.latin > 0) return byLang.en as T;
  return byLang.default;
}

export async function minimaxTtsSpeak(app: App | null, text: string, settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  const mm = settings.minimax;
  if (!mm) {
    noticeFn('⚠️ MiniMax 設定が読み込まれていません');
    return false;
  }
  if (!mm.enabled) {
    noticeFn('⚠️ MiniMax クラウド TTS が無効です（設定で有効化してください）');
    return false;
  }
  if (!mm.apiKey) {
    noticeFn('⚠️ MiniMax API Key が未設定です');
    return false;
  }
  // Pick voice id by text language
  const voiceId = pickLang<string>(text, {
    zh: mm.voiceIdZh, ja: mm.voiceIdJa, en: mm.voiceIdEn, default: mm.voiceIdZh,
  });
  if (!voiceId) {
    noticeFn('⚠️ MiniMax voice ID が未設定です');
    return false;
  }
  if (!app) {
    noticeFn('⚠️ MiniMax は Obsidian コンテキストが必要です');
    return false;
  }
  let resp: { status: number; json: { ok?: boolean; data?: { audio?: string }; error?: string } };
  try {
    resp = await app.requestUrl({
      url: 'https://api.MiniMax.chat/v1/t2a_v2',
      method: 'POST',
      headers: { Authorization: `Bearer ${mm.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'speech-2.8-turbo',
        text,
        voice_setting: { voice_id: voiceId, speed: mm.speed, vol: mm.vol, pitch: mm.pitch },
        audio_setting: { format: mm.audioFormat, sample_rate: 32000 },
        stream: false,
      }),
    });
  } catch (e) {
    noticeFn(`⚠️ MiniMax リクエスト失敗: ${(e as Error).message}`);
    return false;
  }
  if (resp.status >= 400 || !resp.json.ok) {
    noticeFn(`⚠️ MiniMax エラー: ${resp.json.error ?? `HTTP ${resp.status}`}`);
    return false;
  }
  const hex = resp.json.data?.audio;
  if (!hex) {
    noticeFn('⚠️ MiniMax レスポンスに audio が含まれていません');
    return false;
  }
  return playHexAudio(hex, mm.audioFormat, noticeFn);
}

export async function playHexAudio(hex: string, format: string, noticeFn?: NoticeFn): Promise<boolean> {
  const bytes = hexToBytes(hex);
  if (bytes.length === 0) {
    noticeFn?.('⚠️ 音声データが空です');
    return false;
  }
  // Build a blob URL
  const mime = format === 'wav' ? 'audio/wav' : format === 'pcm' ? 'audio/pcm' : 'audio/mpeg';
  let url: string;
  try {
    const blob = new Blob([bytes], { type: mime });
    url = URL.createObjectURL(blob);
  } catch (e) {
    noticeFn?.(`⚠️ Blob 作成失敗: ${(e as Error).message}`);
    return false;
  }
  // Construct Audio via dynamic global so Node test env doesn't need DOM types
  const AudioCtor = (globalThis as unknown as { Audio?: new () => unknown }).Audio
    ?? (typeof window !== 'undefined' ? (window as unknown as { Audio?: new () => unknown }).Audio : undefined);
  if (!AudioCtor) {
    noticeFn?.('⚠️ Audio クラスが利用できません');
    URL.revokeObjectURL(url);
    return false;
  }
  return await new Promise<boolean>((resolve) => {
    const audio = new AudioCtor() as { src: string; play(): Promise<void>; onerror?: () => void };
    audio.src = url;
    audio.onerror = () => {
      noticeFn?.('⚠️ 音声再生エラー');
      URL.revokeObjectURL(url);
      resolve(false);
    };
    audio.play()
      .then(() => { URL.revokeObjectURL(url); resolve(true); })
      .catch((e: Error) => {
        noticeFn?.(`⚠️ Audio play() 失敗: ${e.message}`);
        URL.revokeObjectURL(url);
        resolve(false);
      });
  });
}

/* ============================================================================
 * Dispatcher
 * ========================================================================== */

export async function addTextToTTS(app: App | null, text: string, settings: TtsSettings): Promise<boolean> {
  const noticeFn = (m: string): void => { new Notice(m); };
  if (settings.engine === 'edge' || settings.engine === 'claudetts') {
    return claudettsHttpSpeak(text, settings, noticeFn);
  }
  if (settings.engine === 'webspeech') {
    return webSpeechSpeak(text, settings, noticeFn);
  }
  if (settings.engine === 'minimax') {
    return minimaxTtsSpeak(app, text, settings, noticeFn);
  }
  // 'auto' — try ClaudeTTS first, then Web Speech fallback
  const claudettsOk = await claudettsHttpSpeak(text, settings, noticeFn);
  if (claudettsOk) return true;
  return webSpeechSpeak(text, settings, noticeFn);
}