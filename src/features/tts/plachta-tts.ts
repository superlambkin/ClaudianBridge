import type { TtsSettings } from './core';
import type { PlachtaSettings, PlachtaLanguage, TtsEngine } from '../../core/settings';
import { registerPlayback } from './playback-registry';

// Re-export PlachtaSettings / PlachtaLanguage from canonical location (settings.ts).
// これにより既存テスト (`tests/features/tts/plachta-tts.test.ts`) の `import type { PlachtaSettings } from 'plachta-tts'` を壊さない。
export type { PlachtaSettings, PlachtaLanguage } from '../../core/settings';

export const PLACHTA_SPACE_URL = 'https://plachta-vits-umamusume-voice-synthesizer.hf.space';
export const PLACHTA_DEFAULT_SPEAKER = '特别周 Special Week (Umamusume Pretty Derby)';
export const PLACHTA_DEFAULT_LANGUAGE: PlachtaLanguage = '日本語';
export const PLACHTA_DEFAULT_SPEED = 1.0;
export const PLACHTA_TIMEOUT_MS = 60_000;
// 実測 (2026-08-14 UAT): HF Space の実際の上限は 150 字。151 字以上は "Error: Text is too long" を返す。
export const PLACHTA_TEXT_MAX_LENGTH = 150;
export const PLACHTA_SPEED_MIN = 0.5;
export const PLACHTA_SPEED_MAX = 2.0;

// Gradio 5.x queue API: tts_fn は dependencies[2]、trigger は button id 24
export const PLACHTA_FN_INDEX = 2;
export const PLACHTA_TRIGGER_ID = 24;

export interface PlachtaPreset {
  label: string;
  speaker: string;
  language: PlachtaLanguage;
}

export const PLACHTA_PRESETS: PlachtaPreset[] = [
  { label: 'ウマ娘・日本語', speaker: '特别周 Special Week (Umamusume Pretty Derby)', language: '日本語' },
  { label: 'ウマ娘・中文',   speaker: '特别周 Special Week (Umamusume Pretty Derby)', language: '简体中文' },
  { label: 'ウマ娘・English', speaker: '特别周 Special Week (Umamusume Pretty Derby)', language: 'English' },
  { label: '原神・日本語',   speaker: '芭芭拉 Barbara (Genshin Impact)', language: '日本語' },
  { label: '原神・中文',     speaker: '芭芭拉 Barbara (Genshin Impact)', language: '简体中文' },
  { label: '原神・English', speaker: '芭芭拉 Barbara (Genshin Impact)', language: 'English' },
  { label: 'サノバウィッチ・日本語', speaker: '綾地 寧々 Ayachi Nene (Sanoba Witch)', language: '日本語' },
  { label: 'サノバウィッチ・中文',   speaker: '綾地 寧々 Ayachi Nene (Sanoba Witch)', language: '简体中文' },
  { label: 'サノバウィッチ・English', speaker: '綾地 寧々 Ayachi Nene (Sanoba Witch)', language: 'English' },
];

interface PlachtaEffectiveSettings {
  speaker: string;
  language: PlachtaLanguage;
  speed: number;
}

function resolveSettings(settings: TtsSettings): PlachtaEffectiveSettings {
  const p = settings.plachta;
  const speaker = (p?.speaker?.trim() || '') || PLACHTA_DEFAULT_SPEAKER;
  const language: PlachtaLanguage =
    p?.language && (['日本語', '简体中文', 'English', 'Mix'] as string[]).includes(p.language)
      ? p.language
      : PLACHTA_DEFAULT_LANGUAGE;
  let speed = p?.speed ?? PLACHTA_DEFAULT_SPEED;
  if (speed < PLACHTA_SPEED_MIN || speed > PLACHTA_SPEED_MAX || !Number.isFinite(speed)) {
    speed = PLACHTA_DEFAULT_SPEED;
  }
  return { speaker, language, speed };
}

/**
 * テキストを音声合成して blob object URL を返す（再生はしない）。
 * 失敗時は null を返す。v0.10.0 UAT: パイプライン再生（先行合成）用に合成と再生を分離。
 */
export async function plachtaSynthesize(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void
): Promise<string | null> {
  // Validate text
  if (!text || text.trim() === '') {
    noticeFn('⚠️ テキストが空です');
    return null;
  }
  if (text.length > PLACHTA_TEXT_MAX_LENGTH) {
    noticeFn(`⚠️ テキストが長いです（${PLACHTA_TEXT_MAX_LENGTH} 文字以下推奨）`);
    return null;
  }

  const { speaker, language, speed } = resolveSettings(settings);

  // Gradio 5.x の queue API では session_hash と request_id が必要（ランダム生成）
  const sessionHash = generateHash();
  const requestId = generateHash();

  // Step 1: POST /gradio_api/queue/join → event_id
  let eventId: string;
  try {
    const postRes = await fetch(`${PLACHTA_SPACE_URL}/gradio_api/queue/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [text, speaker, language, speed, false],
        fn_index: PLACHTA_FN_INDEX,
        trigger_id: PLACHTA_TRIGGER_ID,
        session_hash: sessionHash,
        request_id: requestId,
      }),
    });
    if (!postRes.ok) {
      noticeFn(`⚠️ Plachta API 失敗 (HTTP ${postRes.status})`);
      return null;
    }
    const postJson = (await postRes.json()) as { event_id?: string };
    if (!postJson.event_id) {
      noticeFn('⚠️ Plachta API: event_id を取得できませんでした');
      return null;
    }
    eventId = postJson.event_id;
  } catch (e) {
    if (e instanceof TypeError) {
      noticeFn('⚠️ ネット接続を確認してください');
    } else {
      noticeFn(`⚠️ Plachta API エラー: ${(e as Error).message}`);
    }
    return null;
  }

  // Step 2: SSE /gradio_api/queue/data で process_completed を待つ
  const wavUrl = await waitForSseResult(eventId, sessionHash, noticeFn);
  if (!wavUrl) {
    return null;
  }

  // Step 3: Fetch wav → blob → object URL
  try {
    const wavRes = await fetch(wavUrl);
    if (!wavRes.ok) {
      noticeFn(`⚠️ 音声ファイル取得失敗 (HTTP ${wavRes.status})`);
      return null;
    }
    const wavBytes = await wavRes.arrayBuffer();
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    noticeFn(`⚠️ 音声取得エラー: ${(e as Error).message}`);
    return null;
  }
}

/**
 * 合成済み blob object URL を再生する。終了時に URL を revoke する。
 * v0.12.0: 再生レジストリへ登録し、stop() で audio.pause + resolve(false) できるようにする。
 */
export async function playObjectUrl(
  url: string,
  noticeFn: (m: string) => void,
  engine: TtsEngine = 'plachta',
): Promise<boolean> {
  try {
    const audio = new Audio();
    audio.src = url;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let unregister: () => void = () => {};
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        unregister();
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        resolve(ok);
      };
      // v0.12.0: 再生レジストリへ登録（ミュートボタンの停止ハンドル）
      unregister = registerPlayback({
        engine,
        stop: () => {
          try { audio.pause(); } catch { /* ignore */ }
          finish(false);
        },
      });
      audio.onended = () => finish(true);
      audio.onerror = () => { noticeFn('⚠️ 再生失敗'); finish(false); };
      audio.play().catch((e) => {
        noticeFn(`⚠️ 再生失敗: ${e.message}`);
        finish(false);
      });
    });
  } catch (e) {
    noticeFn(`⚠️ 再生準備失敗: ${(e as Error).message}`);
    return false;
  }
}

/** 単一チャンク読み上げ（既存互換のための薄いラッパー） */
export async function plachtaTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void
): Promise<boolean> {
  const url = await plachtaSynthesize(text, settings, noticeFn);
  if (url === null) return false;
  return playObjectUrl(url, noticeFn);
}

/**
 * チャンク配列をパイプライン再生する。
 * チャンク N の再生中にチャンク N+1 の合成を先行開始し、チャンク間ギャップを最小化する。
 * v0.10.0 UAT 追加: Plachta の合成遅延（~4-5s）による無音ギャップ解消。
 *
 * @param onProgress 進行状況コールバック。null で非表示（完了/失敗時）、文字列で表示更新。
 */
export async function plachtaSpeakChunksPipelined(
  chunks: string[],
  settings: TtsSettings,
  noticeFn: (m: string) => void,
  onProgress?: (msg: string | null) => void,
  onChunkStart?: (idx: number) => void,
): Promise<boolean> {
  if (chunks.length === 0) return true;
  onProgress?.('⏳ 音声生成中…');
  let pending = plachtaSynthesize(chunks[0], settings, noticeFn);
  for (let i = 0; i < chunks.length; i++) {
    const url = await pending;
    if (url === null) {
      onProgress?.(null);
      return false;
    }
    if (i + 1 < chunks.length) {
      // 現在のチャンクを再生している間に次のチャンクを合成開始
      pending = plachtaSynthesize(chunks[i + 1], settings, noticeFn);
    }
    if (i === 0) onProgress?.('▶ 読み上げ中…');
    // v0.34.0: チャンク再生開始を通知（MD 読み上げハイライト用・下線原因⑥）
    onChunkStart?.(i);
    const ok = await playObjectUrl(url, noticeFn);
    if (!ok) {
      onProgress?.(null);
      return false;
    }
  }
  onProgress?.(null);
  return true;
}

/**
 * SSE ストリームを読み、event_id に一致する process_completed イベントから
 * wav URL を抽出して返す。60 秒タイムアウト。
 */
async function waitForSseResult(
  eventId: string,
  sessionHash: string,
  noticeFn: (m: string) => void
): Promise<string | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const sseRes = await fetch(
      `${PLACHTA_SPACE_URL}/gradio_api/queue/data?session_hash=${encodeURIComponent(sessionHash)}`
    );
    if (!sseRes.ok || !sseRes.body) {
      noticeFn(`⚠️ Plachta SSE 接続失敗 (HTTP ${sseRes.status})`);
      return null;
    }

    reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const startTime = Date.now();

    while (Date.now() - startTime < PLACHTA_TIMEOUT_MS) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE メッセージは行区切り `data: ...\n\n` で届く
      const messages = buffer.split('\n\n');
      buffer = messages.pop() ?? '';

      for (const msg of messages) {
        const dataLine = msg
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!dataLine) continue;
        try {
          const evt = JSON.parse(dataLine) as {
            msg?: string;
            event_id?: string;
            output?: { data?: Array<string | { path?: string; url?: string } | null> };
          };

          // 該当 event_id が完了したら URL 抽出
          if (evt.msg === 'process_completed' && evt.event_id === eventId) {
            const audio = evt.output?.data?.[1];
            if (audio && typeof audio === 'object') {
              if (audio.url) return audio.url;
              if (audio.path) return `${PLACHTA_SPACE_URL}/gradio_api/file=${audio.path}`;
            }
            noticeFn('⚠️ Plachta API: 音声 URL を取得できませんでした');
            return null;
          }
          // 該当 event_id がエラー終了した場合
          if (evt.msg === 'process_completed' && evt.event_id === eventId) {
            // 上記で処理済み（fall-through 防止）
          }
          if (typeof evt.msg === 'string' && evt.msg.startsWith('error') && evt.event_id === eventId) {
            noticeFn(`⚠️ Plachta API エラー: ${evt.msg}`);
            return null;
          }
        } catch {
          /* JSON parse 失敗は無視して次の行へ */
        }
      }
    }

    noticeFn('⚠️ タイムアウト（60秒）。HuggingFace Space がスリープ中の可能性があります');
    return null;
  } catch (e) {
    if (e instanceof TypeError) {
      noticeFn('⚠️ ネット接続を確認してください');
    } else {
      noticeFn(`⚠️ SSE エラー: ${(e as Error).message}`);
    }
    return null;
  } finally {
    if (reader) {
      try { await reader.cancel(); } catch { /* ignore */ }
    }
  }
}

/**
 * ランダムな英数字ハッシュを生成（session_hash / request_id 用）。
 * crypto.randomUUID を使い、文字列化して返却。
 */
function generateHash(): string {
  // crypto は Electron/renderer 環境で利用可能
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  } catch {
    /* fall through */
  }
  // フォールバック: Math.random ベース（テスト用）
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
