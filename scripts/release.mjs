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
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

// v0.57.3: cwd 依存を無くす。scripts/ の位置からリポジトリルートを導出する
// （`npm run release` は cwd がリポジトリルートだが、`node scripts/release.mjs` を
// 別ディレクトリから実行した場合に誤ったパスを参照していた）。
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** ファイルの sha256（hex） */
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** ディレクトリ配下で最も新しい mtime（ms）。比較用 */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
}

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

  // 2. 公開物が「タグ付けする commit」と一致しているかを検証する（fail-closed）。
  //    ここを警告で済ませると、古い main.js / 版ずれ manifest を配布してしまう。
  const problems = [];

  // 2-1. src/manifest.json と Plugin/manifest.json の版が一致すること
  const srcManifest = JSON.parse(readFileSync(join(ROOT, "src", "manifest.json"), "utf-8"));
  let pluginManifest = null;
  try {
    pluginManifest = JSON.parse(readFileSync(join(ROOT, "Plugin", "manifest.json"), "utf-8"));
  } catch {
    pluginManifest = null;
  }
  if (!pluginManifest) {
    problems.push("Plugin/manifest.json を読めません（npm run build を実行してください）");
  } else if (pluginManifest.version !== srcManifest.version) {
    problems.push(
      `版が不一致: src=${srcManifest.version} / Plugin=${pluginManifest.version}` +
        "（npm run build で同期されます）",
    );
  } else {
    console.log(`  ✅ version 一致: ${srcManifest.version}`);
  }

  // 2-2. helper の 2 コピーが同一であること
  try {
    const srcHash = sha256(join(ROOT, "py", "edge_tts_gec_v2.py"));
    const pluginHash = sha256(join(ROOT, "Plugin", "edge_tts_gec_v2.py"));
    if (srcHash !== pluginHash) {
      problems.push("Plugin/edge_tts_gec_v2.py が py/edge_tts_gec_v2.py と一致しません（npm run build で同期されます）");
    } else {
      console.log(`  ✅ helper 一致: ${srcHash.slice(0, 12)}…`);
    }
  } catch (e) {
    problems.push(`helper のハッシュを計算できません: ${e.message}`);
  }

  // 2-3. 追跡ファイルに未コミット変更が無いこと（タグとソースの一致を保証）
  let dirty = "";
  try {
    dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: ROOT, encoding: "utf-8",
    });
  } catch {
    /* git 未導入でも続行 */
  }
  if (dirty.trim()) {
    problems.push(`追跡ファイルに未コミットの変更があります:\n${dirty.trim()}`);
  }

  // 2-4. リリースは main から行う
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    /* ignore */
  }
  if (branch && branch !== "main") {
    problems.push(`現在のブランチが main ではありません: ${branch}`);
  }

  // 2-5. Plugin/main.js は git 未追跡なので、src/ より古くないかを確認する
  try {
    const mainJs = join(ROOT, "Plugin", "main.js");
    const newestSrc = newestMtime(join(ROOT, "src"));
    if (statSync(mainJs).mtimeMs < newestSrc) {
      problems.push("Plugin/main.js が src/ より古い可能性があります（npm run build を実行してください）");
    }
  } catch {
    /* 比較できなければスキップ */
  }

  if (problems.length > 0) {
    console.error("\n❌ リリース前提を満たしていません:");
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }

  // 3. タグの重複確認（--apply のときだけ中止。dry-run は予行のため通す）
  let tagExists = false;
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { cwd: ROOT, stdio: "ignore" });
    tagExists = true;
  } catch {
    /* タグ未作成 = OK */
  }
  if (tagExists) {
    if (apply) {
      console.error(`\n❌ タグ ${tag} は既に存在します。`);
      process.exit(1);
    }
    console.warn(`\n⚠️ タグ ${tag} は既に存在します（dry-run のため続行）`);
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

  // タグ作成を gh に任せる（--target main）。先に local tag + push すると
  // gh 失敗時に「タグだけ存在して Release が無い」状態になり再実行できなくなる。
  // Release 作成が成功した時点でタグもリモートに作られる。
  const steps = [
    [
      "gh",
      [
        "release", "create", tag,
        ...assetArgs,
        "--target", "main",
        "--title", title,
        ...(notesFile ? ["--notes-file", notesFile] : ["--generate-notes"]),
      ],
    ],
    ["git", ["fetch", "--tags", "origin"]],
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
