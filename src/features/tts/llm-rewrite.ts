/**
 * v0.37.0 (F-033): 聴き手プロファイル向け LLM 原稿書き換え。
 * MD を見出しセクションに分割し、各セクションを Claude CLI（claude -p）で
 * 「聞き手向け口頭原稿」に書き換えてから読み上げに渡す。
 */
import type { ProfileId } from './profile';
import { runClaudePrompt } from '../llm/claude-cli';

export interface MdSection {
  index: number;
  heading: string;
  bodyText: string;
}

const FRONTMATTER_RE = /^---[\s\S]*?---\r?\n?/;
const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const HEADING_LINE_RE = /^(#{1,6})\s+([^\n]+)/gm;

/** 本文が長い場合の上限。超えた Section は段落分割して複数回 LLM 呼び出しする */
export const SECTION_MAX_CHARS = 4000;

export function splitLongBody(bodyText: string, max = SECTION_MAX_CHARS): string[] {
  if (bodyText.length <= max) return [bodyText];
  const lines = bodyText.split(/\n+/).filter((l) => l !== '');
  const out: string[] = [];
  let cur = '';
  for (const ln of lines) {
    if (cur && (cur + '\n' + ln).length > max) { out.push(cur); cur = ln; }
    else cur = cur ? cur + '\n' + ln : ln;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseSections(rawContent: string): MdSection[] {
  const text = rawContent.replace(FRONTMATTER_RE, '').replace(CODE_FENCE_RE, ' ');
  const lines = text.split('\n');
  const rawSections: Array<{ heading: string; bodyText: string }> = [];
  let cur: { heading: string; bodyText: string } | null = null;
  const prelude: string[] = [];
  for (const line of lines) {
    HEADING_LINE_RE.lastIndex = 0;
    const m = HEADING_LINE_RE.exec(line);
    if (m) {
      if (cur) rawSections.push(cur);
      cur = { heading: m[2].trim(), bodyText: '' };
      continue;
    }
    if (cur) cur.bodyText += (cur.bodyText ? '\n' : '') + line;
    else if (line.trim() !== '') prelude.push(line);
  }
  if (cur) rawSections.push(cur);

  const sections: MdSection[] = [];
  const push = (heading: string, bodyText: string): void => {
    if (!bodyText.trim()) return; // v0.37.1 (H2): 空/見出しのみセクションはスキップ
    sections.push({ index: sections.length, heading, bodyText });
  };
  // v0.37.1 (LOW-3): 先頭見出しより前の序文を保持（heading='' の Section）
  const preludeText = prelude.join('\n').trim();
  if (preludeText) push('', preludeText);
  for (const s of rawSections) push(s.heading, s.bodyText);
  // 見出しが無く prelude も無い場合は全文 1 Section
  if (sections.length === 0 && text.trim()) push('', text.trim());
  return sections;
}

export function buildRewritePrompt(section: MdSection, profile: ProfileId): string {
  const lines = [
    `あなたは技術文書を「${profile}」向けの読み上げ原稿に書き換えるアシスタントです。`,
    '- 口頭で自然に読める形にする（記号・コード・絵文字は省略）',
    // v0.37.2 (追加要件): 表は見出し行を含め、読み上げない（口頭では分かりにくい）
    '- 表は**読み上げない**（Markdown 表のヘッダー行・データ行ともに省略する。表の中身は本文で言及しないこと）',
    profileInstruction(profile),
    '- 出力は元の言語で。見出し・装飾・前置きは不要。',
    // v0.37.1 (新要件): 全 profile でです・ます調に統一
    '- 文末は必ず「です・ます調」に統一する。',
  ];
  // v0.37.1 (LOW): 見出し文脈を付与（空セクションの捏造防止にも寄与）
  if (section.heading) lines.push(`[このセクションの見出し] ${section.heading}`);
  lines.push('--- 本文 ---', section.bodyText);
  return lines.join('\n');
}

function profileInstruction(profile: ProfileId): string {
  switch (profile) {
    case 'workplace': return '- 専門用語・略語はそのまま残し簡潔に';
    case 'customer': return '- 技術詳細は一般語で説明し、実装詳細は省く';
    case 'family': return '- やさしく短い文で、専門用語は言い換える';
    case 'classroom': return '- 専門用語の直後に一言解説を足す';
    case 'boss': return '- 結論 → 理由の順で簡潔に';
    case 'dr': return '- 文書内容をそのまま正確に読み上げる（書き換えは最小）';
    default: return '';
  }
}

export type RewriteRunFn = (prompt: string) => Promise<string | null>;

/** ストリーム生成結果（index は元セクション順）。ok=false はそのセクションが LLM 失敗（原文保持） */
export interface LlmStreamItem { index: number; ok: boolean; body: string }

/**
 * v0.37.1: セクションを最大 concurrency 並列で生成し、**できた順ではなく元順序で**逐次 yield する。
 * 読上げ側はこれを for-await で消費しながら、後続セクションの生成を並行継続できる。
 */
export async function* rewriteSectionsStream(
  sections: MdSection[],
  profile: ProfileId,
  runFn: RewriteRunFn = runClaudePrompt,
  onProgress?: (done: number, total: number) => void,
  concurrency = 2,
  signal?: AbortSignal,
): AsyncGenerator<LlmStreamItem> {
  if (sections.length === 0) return;

  // タスク = 「セクション × パート」。元順序（セクション→パート）で逐次 yield する。
  interface Task { order: number; sectionIdx: number; partText: string }
  const tasks: Task[] = [];
  sections.forEach((s, si) => {
    for (const part of splitLongBody(s.bodyText)) tasks.push({ order: tasks.length, sectionIdx: si, partText: part });
  });
  const total = tasks.length;
  const out = new Array<LlmStreamItem | undefined>(total);
  let started = 0;
  let active = 0;
  const waiters: Array<() => void> = [];
  const wake = (): void => { const ws = waiters.splice(0); ws.forEach((f) => f()); };
  const tick = (): Promise<void> => new Promise<void>((r) => waiters.push(r));

  const genOne = async (t: Task): Promise<void> => {
    let ok = true;
    let body = '';
    if (!signal?.aborted) {
      const res = await runFn(buildRewritePrompt({ index: t.sectionIdx, heading: sections[t.sectionIdx].heading, bodyText: t.partText }, profile));
      if (res !== null) body = res.trim();
      else ok = false;
    } else {
      ok = false;
    }
    out[t.order] = { index: t.sectionIdx, ok, body: body || t.partText };
    active -= 1;
    onProgress?.(t.order + 1, total);
    wake();
  };

  const launch = (): void => {
    while (active < concurrency && started < total) {
      const t = tasks[started]; started += 1; active += 1;
      void genOne(t);
    }
  };

  launch();
  for (let o = 0; o < total; o++) {
    while (!out[o]) {
      if (active === 0 && started === total) break;
      await tick();
    }
    const item = out[o];
    out[o] = undefined;
    launch();
    if (item) yield item;
  }
}

export async function rewriteSections(
  sections: MdSection[],
  profile: ProfileId,
  runFn: RewriteRunFn = runClaudePrompt,
  onProgress?: (done: number, total: number) => void,
  concurrency = 2,
): Promise<{ ok: boolean; rewritten: MdSection[]; failed: boolean }> {
  const n = sections.length;
  if (n === 0) return { ok: true, rewritten: [], failed: false };
  const rewritten: MdSection[] = new Array(n);
  let failed = false;
  let next = 0;
  let done = 0;
  let settled = false;
  const c = Math.max(1, Math.min(concurrency, n));

  const rewriteOne = async (i: number): Promise<void> => {
    const sec = sections[i];
    const parts = splitLongBody(sec.bodyText);
    let out = '';
    let secFailed = false;
    for (const part of parts) {
      const res = await runFn(buildRewritePrompt({ ...sec, bodyText: part }, profile));
      if (res === null) { secFailed = true; out = sec.bodyText; break; }
      out += (out ? '\n' : '') + res.trim();
    }
    rewritten[i] = { ...sec, bodyText: out || sec.bodyText };
    if (secFailed) failed = true;
    done += 1;
    onProgress?.(done, n);
  };

  // v0.37.1: 並列ワーカー（concurrency 個）で生成。結果は元の順序で格納される
  const worker = async (): Promise<void> => {
    while (next < n) {
      const i = next; next += 1;
      await rewriteOne(i);
    }
    if (done === n && !settled) {
      settled = true;
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < c; w++) workers.push(worker());
  await Promise.all(workers);
  return { ok: !failed, rewritten, failed };
}
