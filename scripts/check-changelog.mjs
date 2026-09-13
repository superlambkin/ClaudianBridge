#!/usr/bin/env node
/**
 * package.json の version が CHANGELOG.md に `## [<version>]` として存在するか検証する。
 *
 * 使い方:
 *   node scripts/check-changelog.mjs [repoRoot]
 *   （repoRoot 省略時はこのスクリプトの親ディレクトリ＝リポジトリルート）
 *
 * 不在時は console.error + exit 1。
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = process.argv[2] ?? dirname(dirname(fileURLToPath(import.meta.url)));

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
const version = pkg.version;

const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf-8');
const headingRe = new RegExp(`^##\\s*\\[${version.replace(/[.]/g, '\\.')}\\]`, 'm');

if (!headingRe.test(changelog)) {
  console.error(`❌ CHANGELOG.md に "## [${version}]" のエントリが存在しません（package.json version: ${version}）。`);
  console.error('   リリース前に CHANGELOG.md へエントリを追加してください。');
  process.exit(1);
}

console.log(`✅ CHANGELOG.md に "## [${version}]" が存在します。`);
