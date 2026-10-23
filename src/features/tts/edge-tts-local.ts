import * as os from 'os';
import * as path from 'path';
import { spawn, execFileSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { TtsSettings } from './core';
import { pickLang } from './lang';
import type { TtsLang } from './lang';
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

/** edge_tts モジュールのパス解決: 設定値 → プラグイン内 py/edge_tts/src → ''（site-packages） */
export function resolveEdgeTtsModulePath(configured: string): string {
  const c = configured.trim();
  if (c !== '') return c;
  if (edgeTtsPluginDir !== '') return path.join(edgeTtsPluginDir, 'py', 'edge_tts', 'src');
  return '';
}

/** 設定値（短縮名またはフル名）をフル音声名に解決する。未知値はそのまま */
export function resolveEdgeVoiceFull(configured: string, lang: 'zh' | 'ja' | 'en'): string {
  if (configured) return EDGE_VOICE_FULL[configured] ?? configured;
  return LANG_DEFAULT_VOICE[lang];
}

/** v0.27.0: クロスプラットフォーム Python コマンド解決 */
export function resolvePythonCmd(): 'python' | 'python3' {
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

/** v0.27.0: クロスプラットフォーム・プロセスツリー停止 */
export function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* 既に終了済み */
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    return;
  }
  // POSIX: SIGTERM → 500ms 待機 → SIGKILL
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }, 500);
}

/** 埋め込み Python アダプタ（stdin のテキストを edge_tts で合成し audio/mpeg を stdout へ） */
const EDGE_TTS_ADAPTER_PY = `#!/usr/bin/env python3
# claudian-bridge-adapter: v0.57.0
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

def _apply_gec_v2(plugin_dir: str):
    """Sec-MS-GEC v1 の edge_tts を v2 へ差し替える（プラグイン同梱 helper を使う）。

    Microsoft は 2026-10 時点で Sec-MS-GEC-Version を 1- から 2- へ変更した。
    v1 のままだと接続は 403 Forbidden で拒否される。
    """
    if not plugin_dir:
        return
    try:
        if str(Path(plugin_dir)) not in sys.path:
            sys.path.insert(0, str(Path(plugin_dir)))
        import edge_tts_gec_v2
        result = edge_tts_gec_v2.patch_edge_tts()
        if result == "v2":
            print("[edge-tts-local] Sec-MS-GEC v2 patched", file=sys.stderr, flush=True)
    except ImportError:
        pass
    except Exception as e:
        print(f"[edge-tts-local] GEC v2 patch skipped: {e}", file=sys.stderr, flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--edge-tts-path", default="")
    ap.add_argument("--plugin-dir", default="")
    args = ap.parse_args()
    _add_edge_tts_path(args.edge_tts_path)
    _apply_gec_v2(args.plugin_dir)
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

/**
 * v0.57.2: アダプタを plugin 専用の一時ディレクトリへ書き出す。
 *
 * 以前は共有 tmp 直下の固定パス（claudian_bridge_edge_tts.py）に置き、
 * 「目印文字列を含むか」だけで再利用していた。POSIX の /tmp は全ユーザーが
 * 書き込めるため、他ユーザーが同名ファイルを先に置くと任意コードが実行され、
 * さらにスクリプトのディレクトリが sys.path[0] になることで struct.py 等の
 * 標準モジュールを差し替えられる余地があった。
 *
 * - 専用ディレクトリ（0700）に置く
 * - 再利用は「内容が完全一致」の場合のみ（部分一致は受け入れない）
 * - ファイルは 0600 で作る
 */
const ADAPTER_DIR_NAME = 'claudian-bridge-tts';

function ensureAdapter(): string {
  const fs = require('fs') as typeof import('fs');
  if (adapterWritten && adapterPath !== '') {
    // 長時間セッション中に %TEMP% が掃除されても復旧できるよう実在を確認する
    try {
      if (fs.existsSync(adapterPath)) return adapterPath;
    } catch {
      /* 再生成へ */
    }
    adapterWritten = false;
  }
  const dir = path.join(os.tmpdir(), ADAPTER_DIR_NAME);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    /* 既存なら無視 */
  }
  adapterPath = path.join(dir, 'claudian_bridge_edge_tts.py');
  let current = '';
  try {
    current = fs.readFileSync(adapterPath, 'utf-8') as string;
  } catch {
    current = '';
  }
  if (current !== EDGE_TTS_ADAPTER_PY) {
    fs.writeFileSync(adapterPath, EDGE_TTS_ADAPTER_PY, { encoding: 'utf-8', mode: 0o600 });
  }
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

/**
 * v0.57.0: プラグインフォルダに Sec-MS-GEC v2 补丁 helper が同梱されているか。
 * 同梱されていれば、古い edge_tts（v1）を Python 側で自動パッチできる。
 */
export function hasGecV2Helper(pluginDir: string): boolean {
  if (!pluginDir) return false;
  try {
    const fs = require('fs') as typeof import('fs');
    return fs.existsSync(path.join(pluginDir, 'edge_tts_gec_v2.py'));
  } catch {
    return false;
  }
}

/**
 * v0.57.0: 選択された edge_tts の Sec-MS-GEC 世代を判定する。
 *
 * Microsoft は 2026-10 時点で WSS ハンドシェイクの `Sec-MS-GEC-Version` を
 * `1-<chromium>` から `2-<chromium>` へ変更した。v1 のままでは
 * 「403 Invalid response status」で必ず拒否される。
 *
 * - 'v2'      … `2-` 仕様の edge_tts（利用可能）
 * - 'v1'      … `1-` 仕様の edge_tts（403 になる）
 * - 'unknown' … constants.py が見つからない等（判定を諦めて続行する）
 */
export function detectEdgeTtsGecVersion(dir: string): 'v1' | 'v2' | 'unknown' {
  if (!dir) return 'unknown';
  try {
    const fs = require('fs') as typeof import('fs');
    // src-layout（<dir>/edge_tts/constants.py）と package 直下（<dir>/constants.py）の両対応
    const candidates = [
      path.join(dir, 'edge_tts', 'constants.py'),
      path.join(dir, 'constants.py'),
    ];
    for (const p of candidates) {
      let content: string;
      try {
        content = fs.readFileSync(p, 'utf-8') as string;
      } catch {
        continue;
      }
      const m = /SEC_MS_GEC_VERSION\s*=\s*f?"([12])-/.exec(content);
      if (m) return m[1] === '2' ? 'v2' : 'v1';
      // 定数の書き方が異なる場合は v2 実装の有無で判定する
      return /generate_sec_ms_gec_v2/.test(content) ? 'v2' : 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** ローカル EdgeTTS で 1 チャンクを合成・再生する */
export function localEdgeTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void,
  lang?: TtsLang,
): Promise<boolean> {
  return new Promise((resolve) => {
    // v0.27.0: 言語モードを pickLang に渡す
    // v0.27.1: lang 明示時はそれを優先（チャンク分割時に全文判定結果を統一適用）
    const resolvedLang = lang ?? pickLang(text, settings.addToTtsLanguageMode ?? 'auto');
    const voice = resolveEdgeVoiceFull(settings.voices.edge[resolvedLang], resolvedLang);
    const configured = (settings.edgeTtsModulePath ?? '').trim();
    let modulePath = resolveEdgeTtsModulePath(configured);

    // v0.57.2: 同梱 py/edge_tts が無い場合は site-packages へフォールバックする。
    // Release 配布物は py/ を同梱しないため、同梱前提のままだと pip に edge_tts が
    // 入っている環境（＝配布版をそのまま使う大半のケース）で必ず失敗していた。
    // helper があれば v1 の pip 版でも実行時パッチできるので、そこへ委ねる。
    if (configured === '' && modulePath !== '' && !pathExistsEdgeTts(modulePath)
        && hasGecV2Helper(edgeTtsPluginDir)) {
      modulePath = '';
    }

    // 解決後の edge_tts が実在しない場合は spawn せずに事前案内する。
    // プラグインフォルダのコピー移動で同梱 py/edge_tts が欠落した場合、
    // 存在確認を怠ると Python が ModuleNotFoundError で exit 1 になるだけだった。
    if (modulePath !== '' && !pathExistsEdgeTts(modulePath)) {
      noticeFn(configured !== ''
        ? `⚠️ 指定パスに edge_tts モジュールがありません: ${configured}`
        : `⚠️ プラグインに同梱の edge_tts が見つかりません: ${modulePath}\n` +
          `py/edge_tts が同梱されていない可能性があります。プラグインフォルダを丸ごとコピー・移動した場合に発生します。`);
      resolve(false);
      return;
    }

    // v0.57.0: 古い edge_tts（Sec-MS-GEC v1）は Microsoft に 403 で拒否される。
    // 同梱 helper（edge_tts_gec_v2.py）があれば Python 側で自動パッチできるため続行する。
    // helper も無い場合は、原因が不明な 403 になる前に世代を検査して対処を明示する。
    if (modulePath !== '' && detectEdgeTtsGecVersion(modulePath) === 'v1'
        && !hasGecV2Helper(edgeTtsPluginDir)) {
      noticeFn(`⚠️ 検出された edge_tts は Sec-MS-GEC v1（旧仕様）です。\n` +
        `Microsoft は現在 Sec-MS-GEC v2 を要求しており、v1 のままだと 403 Forbidden で拒否されます。\n` +
        `edge_tts を v2 対応版に更新してください。` +
        `（プラグイン v0.57.0 以降の同梱版は v2 対応済みです。py/edge_tts を plugins フォルダへ再配置するか、プラグインを再インストールしてください）`);
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
      // v0.57.0: プラグインフォルダを渡す（Python 側で Sec-MS-GEC v2 パッチを適用する）
      if (edgeTtsPluginDir !== '') args.push('--plugin-dir', edgeTtsPluginDir);
      // v0.27.0: resolvePythonCmd() でクロスプラットフォーム対応
      child = spawn(resolvePythonCmd(), args, { windowsHide: true });
    } catch (e) {
      noticeFn(`⚠️ ローカル EdgeTTS 起動失敗: ${(e as Error).message}`);
      resolve(false);
      return;
    }

    const chunks: Buffer[] = [];
    let err = '';
    let settled = false;
    let intentionalStop = false;
    let timeout: ReturnType<typeof setTimeout>;
    const killChild = (): void => killProcessTree(child);  // v0.27.0: 関数参照に置換
    const unregister = registerPlayback({
      engine: 'edge-local',
      stop: () => {
        intentionalStop = true;
        clearTimeout(timeout);
        killChild();
      },
    });

    // v0.20.1: 合成タイムアウト（30 秒）— edge_tts はネットワーク呼び出しのため、ハング時に救済する。
    // 発火時は settled 済みでなければ kill して失敗扱い（意図的停止時は timeout は解除済み）。
    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unregister();
      killChild();
      if (!intentionalStop) {
        noticeFn('⚠️ ローカル EdgeTTS 失敗: タイムアウト');
      }
      resolve(false);
    }, 30_000);

    child.stdout?.on('data', (d: Buffer) => chunks.push(d));
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unregister();
      if (intentionalStop) {
        // v0.20.1: 意図的停止中のエラーはユーザー操作由来 → エラー扱いしない
        resolve(false);
        return;
      }
      noticeFn(`⚠️ ローカル EdgeTTS 失敗: ${e.message}`);
      resolve(false);
    });
    child.on('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unregister();
      if (intentionalStop) {
        // v0.20.1: 意図的停止中の close（kill による exit null/非0）はエラー扱いしない
        resolve(false);
        return;
      }
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
      try {
        const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
        resolve(await playObjectUrl(url, noticeFn, 'edge-local'));
      } catch (e) {
        // v0.20.1: Blob/URL 生成が throw してもハングさせず失敗扱いにする
        noticeFn(`⚠️ ローカル EdgeTTS 失敗: ${(e as Error).message}`);
        resolve(false);
      }
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}
