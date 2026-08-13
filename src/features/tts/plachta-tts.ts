import type { TtsSettings } from './core';
import type { PlachtaSettings, PlachtaLanguage } from '../../core/settings';

// Re-export PlachtaSettings / PlachtaLanguage from canonical location (settings.ts).
// これにより既存テスト (`tests/features/tts/plachta-tts.test.ts`) の `import type { PlachtaSettings } from 'plachta-tts'` を壊さない。
export type { PlachtaSettings, PlachtaLanguage } from '../../core/settings';

export const PLACHTA_SPACE_URL = 'https://plachta-vits-umamusume-voice-synthesizer.hf.space';
export const PLACHTA_DEFAULT_SPEAKER = '特别周 Special Week (Umamusume Pretty Derby)';
export const PLACHTA_DEFAULT_LANGUAGE: PlachtaLanguage = '日本語';
export const PLACHTA_DEFAULT_SPEED = 1.0;
export const PLACHTA_POLL_INTERVAL_MS = 1000;
export const PLACHTA_POLL_MAX_TIMES = 60;
export const PLACHTA_TEXT_MAX_LENGTH = 1000;
export const PLACHTA_SPEED_MIN = 0.5;
export const PLACHTA_SPEED_MAX = 2.0;

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

export async function plachtaTtsSpeak(
  text: string,
  settings: TtsSettings,
  noticeFn: (m: string) => void
): Promise<boolean> {
  // Validate text
  if (!text || text.trim() === '') {
    noticeFn('⚠️ テキストが空です');
    return false;
  }
  if (text.length > PLACHTA_TEXT_MAX_LENGTH) {
    noticeFn(`⚠️ テキストが長いです（${PLACHTA_TEXT_MAX_LENGTH} 文字以下推奨）`);
    return false;
  }

  const { speaker, language, speed } = resolveSettings(settings);

  // Step 1: POST /call/tts_fn
  let eventId: string;
  try {
    const postRes = await fetch(`${PLACHTA_SPACE_URL}/call/tts_fn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [text, speaker, language, speed, false] }),
    });
    if (!postRes.ok) {
      noticeFn(`⚠️ Plachta API 失敗 (HTTP ${postRes.status})`);
      return false;
    }
    const postJson = await postRes.json() as { event_id: string };
    eventId = postJson.event_id;
  } catch (e) {
    if (e instanceof TypeError) {
      noticeFn('⚠️ ネット接続を確認してください');
    } else {
      noticeFn(`⚠️ Plachta API エラー: ${(e as Error).message}`);
    }
    return false;
  }

  // Step 2: Poll /results
  let wavUrl: string | null = null;
  for (let i = 0; i < PLACHTA_POLL_MAX_TIMES; i++) {
    await new Promise((r) => setTimeout(r, PLACHTA_POLL_INTERVAL_MS));
    try {
      const pollRes = await fetch(`${PLACHTA_SPACE_URL}/call/tts_fn/${eventId}/results`);
      if (!pollRes.ok) {
        noticeFn(`⚠️ Plachta API poll 失敗 (HTTP ${pollRes.status})`);
        return false;
      }
      const pollJson = await pollRes.json() as { data: [string | null, string | null] };
      const [status, url] = pollJson.data;
      if (status === 'ok' && url) {
        wavUrl = url;
        break;
      }
      if (typeof status === 'string' && status.startsWith('error')) {
        noticeFn(`⚠️ Plachta API エラー: ${status}`);
        return false;
      }
    } catch (e) {
      noticeFn(`⚠️ Poll 中ネットエラー: ${(e as Error).message}`);
      return false;
    }
  }

  if (!wavUrl) {
    noticeFn('⚠️ タイムアウト（60秒）。HuggingFace Space がスリープ中の可能性があります');
    return false;
  }

  // Step 3: Fetch wav
  let wavBytes: ArrayBuffer;
  try {
    const wavRes = await fetch(wavUrl);
    if (!wavRes.ok) {
      noticeFn(`⚠️ 音声ファイル取得失敗 (HTTP ${wavRes.status})`);
      return false;
    }
    wavBytes = await wavRes.arrayBuffer();
  } catch (e) {
    noticeFn(`⚠️ 音声取得エラー: ${(e as Error).message}`);
    return false;
  }

  // Step 4: Play via Audio
  try {
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = url;
    return await new Promise<boolean>((resolve) => {
      audio.onended = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(true); };
      audio.onerror = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } noticeFn('⚠️ 再生失敗'); resolve(false); };
      audio.play().catch((e) => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        noticeFn(`⚠️ 再生失敗: ${e.message}`);
        resolve(false);
      });
    });
  } catch (e) {
    noticeFn(`⚠️ 再生準備失敗: ${(e as Error).message}`);
    return false;
  }
}
