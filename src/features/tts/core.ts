import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ANIME_TTS_ADAPTER_PY } from './anime-tts-adapter';

type NoticeFn = (m: string) => void;

/**
 * Minimal TTS settings surface consumed by core.ts. The real settings
 * (with engine-specific nested objects) come from ClaudianBridgeSettings
 * and are passed by main.ts / settings.ts; this interface is the subset
 * the engine implementations need.
 *
 * v0.6.0: minimax 廃止・engine は 'edge' | 'webspeech' のみ。
 * voices はエンジンごとにネスト（engine = 'edge' なら voices.edge を参照）。
 */
export interface TtsSettings {
  engine: 'edge' | 'webspeech' | 'damarcreative';
  /** IETF/voice-name map per engine per language (populated from data.json). */
  voices: {
    edge:      { zh: string; ja: string; en: string };
    webspeech: { zh: string; ja: string; en: string };
  };
  /** anime-tts (Damarcreative) のローカル配置ディレクトリ。空文字 = 未セットアップ。 */
  animeTtsDir?: string;
}

/** 選択中エンジンに対応する言語別 voices を取得 */
export function voicesFor(settings: TtsSettings, lang: 'zh' | 'ja' | 'en'): string {
  // damarcreative は voices マップを持たない（音声モデルは animeTtsDir 側で決まる）
  if (settings.engine === 'damarcreative') return '';
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
    let err = '';
    let out = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      console.error('[claudian-bridge TTS] spawn error event:', e.message);
      if (settled) return;
      settled = true;
      noticeFn(`⚠️ ClaudeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      console.log('[claudian-bridge TTS] child close:', { code, stderr: err.slice(0, 300), stdout: out.slice(0, 100) });
      if (settled) return;
      settled = true;
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
 * Engine: anime-tts (Damarcreative) — local VITS, Japanese only
 * ========================================================================== */

const DAMARCREATIVE_DEFAULT_MODEL = 'ameth.pth';
const DAMARCREATIVE_DEFAULT_CONFIG = 'configs/config-single-speaker.json';
const PYTHON_CANDIDATES = ['py', 'python3', 'python'];

async function pickPython(noticeFn: NoticeFn): Promise<string | null> {
  // which コマンドが無い環境（Windows）を考慮し、spawn 失敗で次候補をためす
  for (const cmd of PYTHON_CANDIDATES) {
    try {
      const child = spawn(cmd, ['--version'], { windowsHide: true });
      const ok = await new Promise<boolean>((resolve) => {
        let resolved = false;
        child.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
        child.on('close', (code) => { if (!resolved) { resolved = true; resolve(code === 0); } });
        setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, 2000);
      });
      if (ok) return cmd;
    } catch {
      // continue
    }
  }
  return null;
}

function detectLang(text: string): 'ja' | 'zh' | 'en' {
  // ひらがな・カタカナ → ja
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3040 && cp <= 0x30ff) return 'ja';
  }
  // CJK 漢字が多くラテン文字より多ければ zh 寄りだが、damarcreative は日本語専用なので 'zh' として拒否
  return 'en';
}

export async function damarcreativeSpeak(text: string, settings: TtsSettings, noticeFn: NoticeFn): Promise<boolean> {
  // 言語判定（日本語以外は即座に拒否）
  const lang = detectLang(text);
  if (lang !== 'ja') {
    noticeFn('⚠️ anime-tts (Damarcreative) は日本語のみ対応です');
    return false;
  }

  const dir = (settings.animeTtsDir ?? '').trim();
  if (!dir) {
    noticeFn('⚠️ anime-tts ディレクトリ未設定。設定 → テキスト読み上げ で animeTtsDir を指定してください');
    return false;
  }
  if (!fs.existsSync(dir)) {
    noticeFn(`⚠️ anime-tts ディレクトリが存在しません: ${dir}`);
    return false;
  }
  // 上流 clone の指標: models.py と configs ディレクトリ
  if (!fs.existsSync(path.join(dir, 'models.py')) || !fs.existsSync(path.join(dir, 'configs'))) {
    noticeFn('⚠️ 指定ディレクトリは anime-tts のクローンではないようです（models.py / configs/ が見つかりません）');
    return false;
  }
  const modelPath = path.join(dir, 'model', DAMARCREATIVE_DEFAULT_MODEL);
  if (!fs.existsSync(modelPath)) {
    noticeFn(`⚠️ モデルが見つかりません: ${modelPath}。anime-tts ディレクトリで python download-model.py を実行してください`);
    return false;
  }

  const py = await pickPython(noticeFn);
  if (!py) {
    noticeFn('⚠️ Python が見つかりません。py / python3 / python のいずれかを PATH に追加してください');
    return false;
  }

  // アダプタと出力 wav を tmp に展開
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-anime-tts-'));
  const adapterPath = path.join(tmpRoot, 'anime_tts_adapter.py');
  const outPath = path.join(tmpRoot, 'out.wav');
  try {
    fs.writeFileSync(adapterPath, ANIME_TTS_ADAPTER_PY, 'utf8');
  } catch (e) {
    noticeFn(`⚠️ アダプタ書き出し失敗: ${(e as Error).message}`);
    return false;
  }

  const args = [adapterPath, '--dir', dir, '--model', DAMARCREATIVE_DEFAULT_MODEL, '--config', DAMARCREATIVE_DEFAULT_CONFIG, '--out', outPath];
  console.log('[claudian-bridge TTS] anime-tts spawning:', { py, args, textLen: text.length, textPreview: text.slice(0, 40) });

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(py, args, { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ anime-tts 起動失敗: ${(e as Error).message}`);
      return resolve(false);
    }
    let err = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      console.error('[claudian-bridge TTS] anime-tts spawn error event:', e.message);
      if (settled) return;
      settled = true;
      noticeFn(`⚠️ anime-tts 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      console.log('[claudian-bridge TTS] anime-tts child close:', { code, stderr: err.slice(0, 300) });
      if (settled) return;
      settled = true;
      if (code !== 0) {
        noticeFn(`⚠️ anime-tts 失敗 (exit ${code}): ${err.slice(0, 200)}`);
        resolve(false);
        return;
      }
      // exit 0 でも wav が無い場合
      if (!fs.existsSync(outPath)) {
        noticeFn('⚠️ anime-tts 音声生成に失敗しました（wav 未生成）');
        resolve(false);
        return;
      }
      // wav 再生（Electron renderer の Audio 経由）
      try {
        const audio = new Audio();
        audio.src = URL.createObjectURL(new Blob([fs.readFileSync(outPath)], { type: 'audio/wav' }));
        audio.onended = () => { try { URL.revokeObjectURL(audio.src); } catch { /* ignore */ } resolve(true); };
        audio.onerror = () => { try { URL.revokeObjectURL(audio.src); } catch { /* ignore */ } noticeFn('⚠️ anime-tts wav 再生エラー'); resolve(false); };
        audio.play().catch((e) => {
          try { URL.revokeObjectURL(audio.src); } catch { /* ignore */ }
          noticeFn(`⚠️ anime-tts 再生失敗: ${(e as Error).message}`);
          resolve(false);
        });
        // 再生成功判定は audio.onended に委ねるため、ここでは wav 削除せず onended/onerror で行う
        // ただし resolve 後（同期フォールバック）には確実に削除するため setTimeout も仕込む
        const cleanup = (): void => {
          try { fs.unlinkSync(outPath); } catch { /* ignore */ }
          try { fs.unlinkSync(adapterPath); } catch { /* ignore */ }
          try { fs.rmdirSync(tmpRoot); } catch { /* ignore */ }
        };
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
      } catch (e) {
        noticeFn(`⚠️ anime-tts 再生準備失敗: ${(e as Error).message}`);
        resolve(false);
      }
    });
    try {
      child.stdin?.write(text);
      child.stdin?.end();
    } catch (e) {
      noticeFn(`⚠️ anime-tts stdin 書き込み失敗: ${(e as Error).message}`);
      if (!settled) { settled = true; resolve(false); }
    }
  });
}

/* ============================================================================
 * Dispatcher
 * ========================================================================== */

export async function addTextToTTS(_app: App | null, text: string, settings: TtsSettings): Promise<boolean> {
  const noticeFn = (m: string): void => { new Notice(m); };
  // v0.7.0: damarcreative は日本語ローカル VITS、edge は claude-tts スクリプト経由、webspeech はブラウザ API
  if (settings.engine === 'damarcreative') {
    return damarcreativeSpeak(text, settings, noticeFn);
  }
  if (settings.engine === 'edge') {
    return claudettsHttpSpeak(text, settings, noticeFn);
  }
  return webSpeechSpeak(text, settings, noticeFn);
}