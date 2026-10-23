/**
 * シークレット検査（pre-commit / 手動監査）
 *
 * 目的: API キー・トークン・秘密鍵の誤コミットを機械的に防ぐ。
 * 背景: 2026-08-17 に rag/config.yaml の実キーが公開リポジトリへ push された（F-060 後の監査で発覚）。
 *
 * 使い方:
 *   node scripts/check-secrets.mjs --staged   # ステージ済み差分のみ（pre-commit）
 *   node scripts/check-secrets.mjs --all      # 追跡ファイル全体（手動監査）
 *
 * 検出値はマスクして表示する（値をログに残さない）。
 * 行単位の許可は行末に `secret-scan:allow` を書く。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOW_MARKER = 'secret-scan:allow';
const PLACEHOLDER_HINTS = ['example', 'dummy', 'placeholder', 'xxxxxxxx', '***REMOVED***', '...', '${'];

export const RULES = [
  { name: 'OpenAI/Anthropic 形式キー', re: /\bsk-[A-Za-z0-9_-]{32,}\b/g },
  { name: 'GitHub トークン', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { name: 'GitHub fine-grained トークン', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: 'AWS アクセスキー', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API キー', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Slack トークン', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: '秘密鍵ブロック', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Bearer トークン', re: /\bBearer\s+[A-Za-z0-9._-]{30,}\b/g },
  {
    name: '資格情報の代入',
    re: /(?:api[_-]?key|secret|password|passwd|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{20,}["']/gi,
  },
];

/** 検出値をマスクする（先頭 4 文字 + 長さのみ） */
export function mask(value) {
  if (value.length <= 6) return '***';
  return `${value.slice(0, 4)}…(${value.length} 文字)`;
}

function isAllowed(line, matched) {
  if (line.includes(ALLOW_MARKER)) return true;
  const lower = matched.toLowerCase();
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
}

/**
 * テキストを検査する。
 * @returns {{line:number, rule:string, masked:string}[]}
 */
export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        if (isAllowed(line, m[0])) continue;
        findings.push({ line: idx + 1, rule: rule.name, masked: mask(m[0]) });
      }
    }
  });
  return findings;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

function listStagedFiles() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function listTrackedFiles() {
  return git(['ls-files']).split('\n').map((s) => s.trim()).filter(Boolean);
}

/** ステージ済み内容（作業ツリーではなく index の内容）を読む */
function readStaged(file) {
  try {
    return git(['show', `:${file}`]);
  } catch {
    return '';
  }
}

function main() {
  const mode = process.argv.includes('--all') ? 'all' : 'staged';
  const files = mode === 'all' ? listTrackedFiles() : listStagedFiles();
  let total = 0;

  for (const file of files) {
    let content;
    try {
      content = mode === 'all' ? readFileSync(file, 'utf-8') : readStaged(file);
    } catch {
      continue; // バイナリ・削除済みなど
    }
    if (content.includes('\u0000')) continue; // バイナリは対象外
    const findings = scanText(content);
    if (findings.length === 0) continue;
    total += findings.length;
    for (const f of findings) {
      console.error(`  🔴 ${file}:${f.line}  [${f.rule}]  ${f.masked}`);
    }
  }

  if (total > 0) {
    console.error('');
    console.error(`❌ シークレットの疑いが ${total} 件あります。コミットを中止しました。`);
    console.error('   - 値を削除し、環境変数（${VAR}）や data.json（gitignore 済）へ移してください。');
    console.error(`   - 誤検知の場合は該当行末に "${ALLOW_MARKER}" を付けてください。`);
    process.exit(1);
  }
  console.log(`✅ シークレット検査 OK（${mode === 'all' ? '追跡ファイル全体' : 'ステージ済み'} / ${files.length} ファイル）`);
}

// 直接実行された場合のみ main を走らせる（テストから import されたときは実行しない）
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/check-secrets.mjs')) {
  main();
}
