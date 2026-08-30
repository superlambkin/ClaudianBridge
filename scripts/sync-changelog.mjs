#!/usr/bin/env node
// scripts/sync-changelog.mjs
// ソース CHANGELOG.md → POC_017/CHANGELOG.md 半自動同期
//
// Usage:
//   node scripts/sync-changelog.mjs
//
// 動作:
//   1. SOURCE: D:/AI-Agent/ClaudianBridge/CHANGELOG.md を読み込む
//   2. TARGET: 80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md と diff
//   3. SOURCE にあって TARGET にない ## [X.Y.Z] エントリを検出
//   4. 追記案を提示（人手確認後に人手 commit）
//
// 注意: セキュリティ上の理由から、ファイル書き込みは人手確認後に別途実行

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = resolve(__dirname, '..', '..', '..');
const SOURCE_PATH = 'D:/AI-Agent/ClaudianBridge/CHANGELOG.md';
const TARGET_PATH = resolve(__dirname, '..', 'CHANGELOG.md');

function extractEntries(content) {
  const re = /^## \[(\d+\.\d+\.\d+)\][^\n]*\n([\s\S]*?)(?=^## \[\d+\.\d+\.\d+\]|\Z)/gm;
  const entries = new Map();
  let match;
  while ((match = re.exec(content)) !== null) {
    entries.set(match[1], match[0].trim());
  }
  return entries;
}

function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(`❌ SOURCE が見つかりません: ${SOURCE_PATH}`);
    process.exit(1);
  }
  if (!existsSync(TARGET_PATH)) {
    console.error(`❌ TARGET が見つかりません: ${TARGET_PATH}`);
    process.exit(1);
  }

  const source = readFileSync(SOURCE_PATH, 'utf-8');
  const target = readFileSync(TARGET_PATH, 'utf-8');

  const sourceEntries = extractEntries(source);
  const targetEntries = extractEntries(target);

  const missing = [];
  for (const [version, body] of sourceEntries) {
    if (!targetEntries.has(version)) {
      missing.push({ version, body });
    }
  }

  if (missing.length === 0) {
    console.log('✅ すべて同期済み（差分なし）');
    return;
  }

  console.log(`📋 追加候補: ${missing.length} 件\n`);
  for (const { version, body } of missing) {
    console.log(`--- ## [${version}] ---`);
    console.log(body);
    console.log('');
  }

  console.log('📝 手順:');
  console.log('  1. 上記エントリを TARGET (CHANGELOG.md) に手動で貼り付け');
  console.log('  2. フロントマター (modified) を更新');
  console.log('  3. git add && git commit で反映');
  console.log('');
  console.log('⚠️  セキュリティ上の理由から、このスクリプトは書き込みません');
  console.log('    （人手レビューを必ず挟む運用 = 半自動方針）');
}

main();
