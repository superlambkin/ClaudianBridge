/**
 * v0.16.0: Claude Code CLI（claude -p）実行モジュール。
 * AI読み上げボタンの「入力文 → 指令文整形」に使用。UI 非依存。
 *
 * プロンプトはコマンドライン引数ではなく stdin へ渡す
 * （CJK を含む引数の shell クォート問題・コマンドライン長制限を回避）。
 * Windows では spawn が .cmd を PATH 解決しないため `where` で解決する
 * （shell:true + args 配列は DEP0190 ため使用しない）。
 */
import { spawn, execFileSync } from 'child_process';

export interface ClaudeCliOptions {
  /** タイムアウト（ms）。既定 30000。超過で kill して null を返す */
  timeoutMs?: number;
  /** v0.37.1: 中断シグナル。abort 時に子プロセスを kill し null を返す */
  signal?: AbortSignal;
  /** v0.37.1: Think モードを無効化（拡張思考なしで応答＝高速・低コスト） */
  disableThinking?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30000;

/** Windows で claude コマンドのフルパスを解決（失敗時は 'claude' のまま shell フォールバック相当） */
function resolveClaudeCommand(): string {
  if (process.platform !== 'win32') return 'claude';
  try {
    const out = execFileSync('where', ['claude'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }) as string;
    const first = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '');
    return first ?? 'claude';
  } catch {
    return 'claude';
  }
}

/** claude -p を実行し stdout を返す。失敗・タイムアウト・空応答は null */
export async function runClaudePrompt(prompt: string, opts?: ClaudeCliOptions): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let out = '';
    let child: ReturnType<typeof spawn>;
    const settle = (v: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };

    let timer: ReturnType<typeof setTimeout>;
    try {
      child = spawn(resolveClaudeCommand(), ['-p'], {
        windowsHide: true,
        // v0.37.1: Think モード無効化（MAX_THINKING_TOKENS=0 で拡張思考を切る）
        env: { ...process.env, ...(opts?.disableThinking ? { MAX_THINKING_TOKENS: '0' } : {}) },
      });
    } catch (e) {
      console.warn('[cb-claude-cli] spawn threw:', e);
      resolve(null);
      return;
    }

    timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      // kill により close が発火するのを待つ（settled ガードで二重解決なし）
    }, timeoutMs);

    // v0.37.1: 外部 abort で子プロセスを kill（close → settle(null)）
    const onAbort = (): void => {
      try { child.kill(); } catch { /* ignore */ }
      try { clearTimeout(timer); } catch { /* ignore */ }
      settle(null);
    };
    if (opts?.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => console.warn('[cb-claude-cli] stderr:', d.toString().slice(0, 200)));
    child.on('error', (e) => {
      console.warn('[cb-claude-cli] error:', e.message);
      settle(null);
    });
    child.on('close', (code) => {
      if (code === 0) {
        const trimmed = out.trim();
        settle(trimmed === '' ? null : trimmed);
      } else {
        console.warn('[cb-claude-cli] exit code:', code);
        settle(null);
      }
    });

    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

/** 整形用プロンプトを構築（設計書 3.2 節の固定テンプレート） */
export function buildPolishPrompt(text: string): string {
  return [
    'あなたは文章整形アシスタントです。以下のユーザー入力文の意図を解釈し、明確で分かりやすい指示文に整形してください。',
    '・入力文と同じ言語で出力すること',
    '・応答は整形した指示文のみ。説明・前置き・引用符・箇条書き記号を含めない',
    '',
    '--- 入力文 ---',
    text,
  ].join('\n');
}

/** 入力文を指令文に整形する。失敗時 null */
export async function polishInstruction(text: string, opts?: ClaudeCliOptions): Promise<string | null> {
  const r = await runClaudePrompt(buildPolishPrompt(text), opts);
  if (r === null) return null;
  // 応答がマークダウンコードフェンスで囲まれることがあるため剥がす
  const unfenced = r.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/, '$1').trim();
  return unfenced === '' ? null : unfenced;
}
