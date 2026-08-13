import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PlachtaSettings, TtsEngine } from '../../core/settings';
import { ANIME_TTS_ADAPTER_PY } from './anime-tts-adapter';

type NoticeFn = (m: string) => void;

/**
 * anime-tts UAT 診断ログ（一時的・RC7 調査用）。
 * 各ステップをファイルへ追記し、Obsidian 外から実機の進捗を観測できるようにする。
 */
const TTS_DEBUG_LOG = path.join(os.tmpdir(), 'cb-anime-tts-uat.log');
function ttsDebug(stage: string, extra: Record<string, unknown> = {}): void {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${stage} ${JSON.stringify(extra)}\n`;
    fs.appendFileSync(TTS_DEBUG_LOG, line, 'utf8');
    console.log('[claudian-bridge TTS UAT]', stage, extra);
  } catch { /* ignore */ }
}

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
  engine: TtsEngine;
  /** IETF/voice-name map per engine per language (populated from data.json). */
  voices: {
    edge:      { zh: string; ja: string; en: string };
    webspeech: { zh: string; ja: string; en: string };
  };
  /** anime-tts (Damarcreative) のローカル配置ディレクトリ。空文字 = 未セットアップ。Task 4 で削除予定。 */
  animeTtsDir?: string;
  /** v0.8.0: Plachta Cloud TTS の設定。engine === 'plachta' のとき使用。 */
  plachta?: PlachtaSettings;
}

/** 選択中エンジンに対応する言語別 voices を取得 */
export function voicesFor(settings: TtsSettings, lang: 'zh' | 'ja' | 'en'): string {
  // damarcreative / plachta は voices マップを持たない（音声モデルはディレクトリ / クラウド側で決まる）。
  // Task 4 で dispatcher 全体を整理する。
  if (settings.engine === 'damarcreative') return '';
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

/**
 * anime-tts 用 Python を解決する。
 * 優先順位:
 *   1. <animeTtsDir>/.venv の Python（セットアップ BAT が作成した仮想環境）
 *      - Windows: .venv/Scripts/python.exe
 *      - macOS/Linux: .venv/bin/python
 *   2. システムの py / python3 / python（フォールバック）
 *
 * RC1 修正: 従来はシステム Python を起動していたため、.venv にだけインストール
 * された torch / librosa / pyopenjtalk が見つからず ImportError で失敗していた。
 * .venv の Python を直接起動することで依存解決を保証する。
 */
async function pickPython(animeTtsDir: string, _noticeFn: NoticeFn): Promise<string | null> {
  // 優先候補 1: animeTtsDir 配下の .venv
  const isWin = process.platform === 'win32';
  const venvPython = path.join(animeTtsDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  if (fs.existsSync(venvPython)) {
    const ok = await probePython(venvPython);
    if (ok) return venvPython;
  }
  // 優先候補 2: システム Python（従来挙動のフォールバック）
  for (const cmd of PYTHON_CANDIDATES) {
    const ok = await probePython(cmd);
    if (ok) return cmd;
  }
  return null;
}

/** spawn で Python が応答するか（--version exit 0）を確認。タイムアウト付き。 */
function probePython(cmd: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, ['--version'], { windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    let resolved = false;
    child.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
    child.on('close', (code) => { if (!resolved) { resolved = true; resolve(code === 0); } });
    setTimeout(() => { if (!resolved) { resolved = true; child.kill(); resolve(false); } }, 2000);
  });
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
  ttsDebug('ENTER damarcreativeSpeak', { textLen: text.length, textPreview: text.slice(0, 40), engine: settings.engine, animeTtsDir: settings.animeTtsDir });
  // 言語判定（日本語以外は即座に拒否）
  const lang = detectLang(text);
  if (lang !== 'ja') {
    ttsDebug('REJECT lang', { lang });
    noticeFn('⚠️ anime-tts (Damarcreative) は日本語のみ対応です');
    return false;
  }

  const dir = (settings.animeTtsDir ?? '').trim();
  if (!dir) {
    ttsDebug('REJECT empty dir');
    noticeFn('⚠️ anime-tts ディレクトリ未設定。設定 → テキスト読み上げ で animeTtsDir を指定してください');
    return false;
  }
  if (!fs.existsSync(dir)) {
    ttsDebug('REJECT dir not found', { dir });
    noticeFn(`⚠️ anime-tts ディレクトリが存在しません: ${dir}`);
    return false;
  }
  // 上流 clone の指標: models.py と configs ディレクトリ
  if (!fs.existsSync(path.join(dir, 'models.py')) || !fs.existsSync(path.join(dir, 'configs'))) {
    ttsDebug('REJECT not a clone', { dir });
    noticeFn('⚠️ 指定ディレクトリは anime-tts のクローンではないようです（models.py / configs/ が見つかりません）');
    return false;
  }
  const modelPath = path.join(dir, 'model', DAMARCREATIVE_DEFAULT_MODEL);
  if (!fs.existsSync(modelPath)) {
    ttsDebug('REJECT model missing', { modelPath });
    noticeFn(`⚠️ モデルが見つかりません: ${modelPath}。anime-tts ディレクトリで python download-model.py を実行してください`);
    return false;
  }

  const py = await pickPython(dir, noticeFn);
  ttsDebug('pickPython resolved', { py });
  if (!py) {
    noticeFn('⚠️ Python が見つかりません。anime-tts ディレクトリで setup-anime-tts.bat を実行して .venv を作成するか、py / python3 / python を PATH に追加してください');
    return false;
  }

  // アダプタと出力 wav を tmp に展開
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-anime-tts-'));
  const adapterPath = path.join(tmpRoot, 'anime_tts_adapter.py');
  const outPath = path.join(tmpRoot, 'out.wav');
  const textPath = path.join(tmpRoot, 'input.txt');
  try {
    fs.writeFileSync(adapterPath, ANIME_TTS_ADAPTER_PY, 'utf8');
    // RC7 修正: stdin パイプは Electron renderer でデッドロックするため、
    // テキストは UTF-8 ファイル経由で渡す（--text-file）。
    fs.writeFileSync(textPath, text, 'utf8');
  } catch (e) {
    ttsDebug('REJECT adapter write fail', { err: (e as Error).message });
    noticeFn(`⚠️ アダプタ書き出し失敗: ${(e as Error).message}`);
    return false;
  }

  const args = [adapterPath, '--dir', dir, '--model', DAMARCREATIVE_DEFAULT_MODEL, '--config', DAMARCREATIVE_DEFAULT_CONFIG, '--out', outPath, '--text-file', textPath];
  ttsDebug('spawning', { py, textLen: text.length });

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(py, args, {
        windowsHide: true,
        env: {
          ...process.env,
          // RC8 修正: numba の DEBUG ログ（初回 JIT 時に数百KBの stderr）が
          // パイプバッファ（64KB）を詰まらせてデッドロックするのを防止。
          NUMBA_LOG_LEVEL: 'WARNING',
          NUMBA_DEBUG: '0',
          PYTHONIOENCODING: 'utf-8',
        },
      });
      ttsDebug('spawn called', { pid: child.pid });
    } catch (e) {
      ttsDebug('spawn threw', { err: (e as Error).message });
      noticeFn(`⚠️ anime-tts 起動失敗: ${(e as Error).message}`);
      return resolve(false);
    }
    let err = '';
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      ttsDebug('child ERROR event', { err: e.message });
      if (settled) return;
      settled = true;
      noticeFn(`⚠️ anime-tts 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      ttsDebug('child CLOSE', { code, wavExists: fs.existsSync(outPath), stderrTail: err.slice(-200) });
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
        const wavBytes = fs.readFileSync(outPath);
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.src = url;
        ttsDebug('audio prepared', { wavSize: wavBytes.length, url });
        audio.onended = () => { ttsDebug('audio ENDED'); try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(true); };
        audio.onerror = (ev) => { ttsDebug('audio ONERROR', { ev: String(ev) }); try { URL.revokeObjectURL(url); } catch { /* ignore */ } noticeFn('⚠️ anime-tts wav 再生エラー'); resolve(false); };
        audio.play().then(() => {
          ttsDebug('audio.play() RESOLVED');
        }).catch((e) => {
          ttsDebug('audio.play() REJECTED', { err: (e as Error).message, name: (e as Error).name });
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
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
        ttsDebug('audio setup threw', { err: (e as Error).message });
        noticeFn(`⚠️ anime-tts 再生準備失敗: ${(e as Error).message}`);
        resolve(false);
      }
    });
    try {
      // RC7 修正: stdin は使わない（テキストは --text-file 経由）。
      // ただし stdin を開いたまま放置すると Python 側が read() でブロックする
      // 可能性があるため、即座に EOF で閉じる。
      child.stdin?.end();
      ttsDebug('stdin closed (text via file)');
    } catch (e) {
      ttsDebug('stdin close failed', { err: (e as Error).message });
      // stdin クローズ失敗は致命的ではない（テキストはファイルにある）
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