#!/usr/bin/env node
/**
 * Create a GitHub Release with ALL runtime assets the plugin needs.
 *
 * Why this exists (v0.57.0):
 *   `plugin/main.js` alone is not enough. The plugin's self-update installs every
 *   release asset flat into `<pluginDir>/<asset.name>` (see update-checker.ts —
 *   assets are NOT filtered by name). So any file the runtime reads from
 *   `<pluginDir>` must be a release asset, otherwise fresh installs / updates
 *   silently lose it.
 *
 *   Concretely: `py/edge_tts` is NOT shipped in releases, so an install that never
 *   ran `npm run deploy` has no bundled edge_tts. Since Microsoft requires
 *   Sec-MS-GEC v2, the pip-installed edge_tts (still v1 even on PyPI 7.3.1) gets
 *   403. `edge_tts_gec_v2.py` is the flat helper that patches it at runtime, so it
 *   MUST be a release asset.
 *
 * Usage:
 *   node scripts/release.mjs              # dry-run: prints the gh command
 *   node scripts/release.mjs --apply      # actually creates the release
 *   node scripts/release.mjs --apply --title "..." --notes-file path
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();

/**
 * Files that must be published. Names are kept flat because
 * self-update writes them as `<pluginDir>/<name>`.
 */
const ASSETS = [
  ["Plugin/main.js", "main.js"],
  ["Plugin/manifest.json", "manifest.json"],
  ["Plugin/styles.css", "styles.css"],
  ["Plugin/edge_tts_gec_v2.py", "edge_tts_gec_v2.py"],
];

function readVersion() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "src", "manifest.json"), "utf-8"));
  return manifest.version;
}

function main() {
  const apply = process.argv.includes("--apply");
  const version = readVersion();
  const tag = `v${version}`;

  console.log(`=== release: ${tag} ===`);

  // 1. アセットの実在確認（欠落していれば中止）
  const missing = [];
  for (const [src] of ASSETS) {
    const p = join(ROOT, src);
    const ok = existsSync(p);
    console.log(`  ${ok ? "✅" : "❌"} ${src}`);
    if (!ok) missing.push(src);
  }
  if (missing.length > 0) {
    console.error(`\n❌ アセットが欠落しています: ${missing.join(", ")}`);
    console.error("   npm run build を実行してから再試行してください。");
    process.exit(1);
  }

  // 2. 作業ツリーが clean か（build 成果物と manifest の不整合を防ぐ）
  let dirty = "";
  try {
    dirty = execFileSync("git", ["status", "--porcelain", "Plugin/"], { cwd: ROOT, encoding: "utf-8" });
  } catch {
    /* git 未導入でも続行 */
  }
  if (dirty.trim()) {
    console.warn(`\n⚠️ Plugin/ に未コミットの変更があります:\n${dirty.trim()}`);
    console.warn("   Release は commit 済みの内容を公開するのが原則です。");
  }

  // 3. タグの重複確認
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { cwd: ROOT, stdio: "ignore" });
    console.error(`\n❌ タグ ${tag} は既に存在します。`);
    process.exit(1);
  } catch {
    /* タグ未作成 = OK */
  }

  // 4. コマンド組み立て
  const assetArgs = ASSETS.map(([src]) => src);
  const notesFile = (() => {
    const i = process.argv.indexOf("--notes-file");
    return i !== -1 ? process.argv[i + 1] : null;
  })();
  const title = (() => {
    const i = process.argv.indexOf("--title");
    return i !== -1 ? process.argv[i + 1] : `ClaudianBridge ${tag}`;
  })();

  const steps = [
    ["git", ["tag", tag]],
    ["git", ["push", "origin", tag]],
    [
      "gh",
      [
        "release", "create", tag,
        ...assetArgs,
        "--title", title,
        ...(notesFile ? ["--notes-file", notesFile] : ["--generate-notes"]),
      ],
    ],
  ];

  if (!apply) {
    console.log("\n=== DRY-RUN: 以下を実行します ===");
    for (const [cmd, args] of steps) {
      console.log(`  ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    }
    console.log("\n  （実行するには --apply を付けてください）");
    return;
  }

  for (const [cmd, args] of steps) {
    console.log(`\n$ ${cmd} ${args.join(" ")}`);
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  }
  console.log(`\n✅ Released ${tag}`);
}

main();
