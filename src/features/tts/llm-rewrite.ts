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
  const sections: MdSection[] = [];
  let cur: MdSection | null = null;
  for (const line of lines) {
    HEADING_LINE_RE.lastIndex = 0;
    const m = HEADING_LINE_RE.exec(line);
    if (m) {
      if (cur) sections.push(cur);
      cur = { index: sections.length, heading: m[2].trim(), bodyText: '' };
      continue;
    }
    if (cur) cur.bodyText += (cur.bodyText ? '\n' : '') + line;
  }
  if (cur) sections.push(cur);
  // 見出しが 1 つも無い場合：全文を 1 Section にする
  if (sections.length === 0) {
    const trimmed = text.trim();
    if (trimmed) sections.push({ index: 0, heading: '', bodyText: trimmed });
  }
  return sections;
}

export function buildRewritePrompt(section: MdSection, profile: ProfileId): string {
  return [
    `あなたは技術文書を「${profile}」向けの読み上げ原稿に書き換えるアシスタントです。`,
    '- 口頭で自然に読める形にする（記号・コード・表は言葉で説明 or 省略）',
    profileInstruction(profile),
    '- 出力は元の言語で。見出し・装飾・前置きは不要。',
    '--- 本文 ---',
    section.bodyText,
  ].join('\n');
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

export async function rewriteSections(
  sections: MdSection[],
  profile: ProfileId,
  runFn: RewriteRunFn = runClaudePrompt,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; rewritten: MdSection[]; failed: boolean }> {
  let failed = false;
  const rewritten: MdSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    onProgress?.(i + 1, sections.length);
    const parts = splitLongBody(sec.bodyText);
    let out = '';
    for (const part of parts) {
      const res = await runFn(buildRewritePrompt({ ...sec, bodyText: part }, profile));
      if (res === null) { failed = true; out = sec.bodyText; break; }
      out += (out ? '\n' : '') + res.trim();
    }
    rewritten.push({ ...sec, bodyText: out || sec.bodyText });
  }
  return { ok: !failed, rewritten, failed };
}
