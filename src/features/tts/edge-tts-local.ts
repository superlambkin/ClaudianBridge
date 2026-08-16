import * as os from 'os';
import * as path from 'path';
import { spawn, execFileSync } from 'child_process';
import type { TtsSettings } from './core';
import { pickWebSpeechLang } from './lang';
import { playObjectUrl } from './plachta-tts';
import { registerPlayback } from './playback-registry';

/**
 * v0.20.0: ローカル EdgeTTS エンジン。
 * プラグイン内（または設定指定）の edge_tts Python モジュールを直接実行し、
 * ClaudeTTS スキル / Pip に依存しない自己完結動作を実現する。
 * 方式 A: Python アダプタを TS 定数として埋め込み、実行時に os.tmpdir() へ書き出して spawn。
 */

/** 短縮名 → Microsoft フル音声名 */
const EDGE_VOICE_FULL: Record<string, string> = {
  xiaoxiao: 'zh-CN-XiaoxiaoNeural', yunxi: 'zh-CN-YunxiNeural', yunyang: 'zh-CN-YunyangNeural',
  yunjian: 'zh-CN-YunjianNeural', xiaoyi: 'zh-CN-XiaoyiNeural', yunxia: 'zh-CN-YunxiaNeural',
  nanami: 'ja-JP-NanamiNeural', keita: 'ja-JP-KeitaNeural',
  aria: 'en-US-AriaNeural', guy: 'en-US-GuyNeural', jenny: 'en-US-JennyNeural',
};

/** 言語別の既定フル音声名 */
const LANG_DEFAULT_VOICE: Record<'zh' | 'ja' | 'en', string> = {
  zh: 'zh-CN-XiaoxiaoNeural',
  ja: 'ja-JP-NanamiNeural',
  en: 'en-US-AriaNeural',
};

/** プラグインDIR（main.ts の onload で initEdgeTtsLocal により設定） */
let edgeTtsPluginDir = '';
let adapterWritten = false;
let adapterPath = '';

export function initEdgeTtsLocal(pluginDir: string): void {
  edgeTtsPluginDir = pluginDir;
}

/** テスト用: モジュール状態を初期化 */
export function resetEdgeTtsLocalState(): void {
  edgeTtsPluginDir = '';
  adapterWritten = false;
  adapterPath = '';
}

/** edge_tts モジュールのパス解決: 設定値 → プラグイン内 edge_tts → ''（site-packages） */
export function resolveEdgeTtsModulePath(configured: string): string {
  const c = configured.trim();
  if (c !== '') return c;
  if (edgeTtsPluginDir !== '') return path.join(edgeTtsPluginDir, 'edge_tts');
  return '';
}

/** 設定値（短縮名またはフル名）をフル音声名に解決する。未知値はそのまま */
export function resolveEdgeVoiceFull(configured: string, lang: 'zh' | 'ja' | 'en'): string {
  if (configured) return EDGE_VOICE_FULL[configured] ?? configured;
  return LANG_DEFAULT_VOICE[lang];
}

/** 埋め込み Python アダプタ（stdin のテキストを edge_tts で合成し audio/mpeg を stdout へ） */
const EDGE_TTS_ADAPTER_PY = `#!/usr/bin/env python3
"""Claudian Bridge \u30ed\u30fc\u30ab\u30eb EdgeTTS \u30a2\u30c0\u30d7\u30bf\uff081\u30ea\u30af\u30a8\u30b9\u30c8=1\u30d7\u30ed\u30bb\u30b9\uff09"""
import argparse
import asyncio
import sys
from pathlib import Path

for _stream in (sys.stdin, sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

def _add_edge_tts_path(path: str):
    """edge_tts \u3092 import \u53ef\u80fd\u306b\u3059\u308b\u3002\u6307\u5b9a\u30d1\u30b9\u304c:
    - edge_tts \u30d1\u30c3\u30b1\u30fc\u30b8\u81ea\u4f53\u306e\u30c7\u30a3\u30ec\u30af\u30c8\u30ea\u2192 \u305d\u306e\u89aa\u3092 sys.path \u306b\u8ffd\u52a0
    - \u89aa\u30c7\u30a3\u30ec\u30af\u30c8\u30ea\uff08edge_tts/ \u3092\u542b\u3080\uff09\u2192 \u305d\u306e\u307e\u307e sys.path \u306b\u8ffd\u52a0
    """
    if not path:
        return
    p = Path(path)
    if (p / "edge_tts" / "__init__.py").exists():
        sys.path.insert(0, str(p))
    elif p.name == "edge_tts" and (p / "__init__.py").exists():
        sys.path.insert(0, str(p.parent))
    else:
        sys.path.insert(0, str(p))

async def _synthesize(text: str, voice: str):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--edge-tts-path", default="")
    args = ap.parse_args()
    _add_edge_tts_path(args.edge_tts_path)
    text = sys.stdin.read()
    try:
        audio = asyncio.run(_synthesize(text, args.voice))
    except Exception as e:
        print(f"[edge-tts-local] error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    sys.stdout.buffer.write(audio)
    sys.stdout.buffer.flush()

if __name__ == "__main__":
    main()
`;

/** アダプタを os.tmpdir() へ書き出す（初回のみ。以後は既存を再利用） */
function ensureAdapter(): string {
  if (adapterWritten) return adapterPath;
  const fs = require('fs') as typeof import('fs');
  adapterPath = path.join(os.tmpdir(), 'claudian_bridge_edge_tts.py');
  fs.writeFileSync(adapterPath, EDGE_TTS_ADAPTER_PY, 'utf-8');
  adapterWritten = true;
  return adapterPath;
}

/** 指定パスに edge_tts パッケージが存在するか（edge_tts 直下 or 親ディレクトリの両対応） */
function pathExistsEdgeTts(dir: string): boolean {
  try {
    const fs = require('fs') as typeof import('fs');
    return fs.existsSync(path.join(dir, '__init__.py'))
        || fs.existsSync(path.join(dir, 'edge_tts', '__init__.py'));
  } catch {
    return false;
  }
}

/** ローカル EdgeTTS で 1 チャンクを合成・再生する */
export function localEdgeTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const lang = pickWebSpeechLang(text);
    const voice = resolveEdgeVoiceFull(settings.voices.edge[lang], lang);
    const configured = (settings.edgeTtsModulePath ?? '').trim();
    const modulePath = resolveEdgeTtsModulePath(configured);

    // 設定パスが明示されているのに edge_tts が無い場合は事前に案内
    if (configured !== '' && !pathExistsEdgeTts(modulePath)) {
      noticeFn(`⚠️ 指定パスに edge_tts モジュールがありません: ${configured}`);
      resolve(false);
      return;
    }

    let scriptPath: string;
    try {
      scriptPath = ensureAdapter();
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 失敗: アダプタ展開エラー ${(e as Error).message}`);
      resolve(false);
      return;
    }

    let child: ReturnType<typeof spawn>;
    try {
      const args = [scriptPath, '--voice', voice];
      if (modulePath !== '') args.push('--edge-tts-path', modulePath);
      child = spawn('python', args, { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }

    const chunks: Buffer[] = [];
    let err = '';
    let settled = false;
    const unregister = registerPlayback({
      engine: 'edge-local',
      stop: () => {
        if (child.pid && process.platform === 'win32') {
          try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 既に終了済み */ }
        }
        try { child.kill(); } catch { /* ignore */ }
      },
    });

    child.stdout?.on('data', (d: Buffer) => chunks.push(d));
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      unregister();
      noticeFn(`⚠️ ローカル EdgeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', async (code) => {
      if (settled) return;
      settled = true;
      unregister();
      if (code !== 0) {
        noticeFn(`⚠️ ローカル EdgeTTS 失敗 (exit ${code}): ${err.trim().slice(0, 200)}`);
        resolve(false);
        return;
      }
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) {
        noticeFn('⚠️ ローカル EdgeTTS 失敗: 音声データが空です');
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
      resolve(await playObjectUrl(url, noticeFn, 'edge-local'));
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}
