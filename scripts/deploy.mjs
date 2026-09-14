#!/usr/bin/env node
/**
 * Deploy Claudian Bridge build artifacts + Python helper scripts to the Obsidian vault.
 * Self-contained: no shared _devtools dependency.
 *
 * The Python helpers (_chroma_inspect.py / _run_markitdown.py / split_*.py) live in
 * the repo's python/ directory and are copied flat into the deployed plugin folder,
 * because at runtime the plugin resolves them from <pluginDir>.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// v0.37.2: 自立化。優先順位: 1) 環境変数 CLAUDIAN_VAULT_PATH, 2) 環境変数 OBSIDIAN_VAULT_PATH,
// 3) ハードコード既定（このリポジトリ専用）
function resolveVaultPath() {
  const env = process.env.CLAUDIAN_VAULT_PATH || process.env.OBSIDIAN_VAULT_PATH;
  if (env && existsSync(env)) return env;
  const FALLBACK = "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault";
  if (existsSync(FALLBACK)) return FALLBACK;
  throw new Error(
    `❌ Vault path を解決できません。CLAUDIAN_VAULT_PATH 環境変数を設定してください（未設定・パス不一致）`
  );
}

// Deploy the Python helper scripts so the plugin folder is self-contained.
const PY_FILES = [
  "_chroma_inspect.py",
  "_run_markitdown.py",
  "split_csv.py",
  "split_docx.py",
  "split_html.py",
  "split_pdf.py",
  "split_pptx.py",
  "split_xlsx.py",
];
// RAG runtime (word-pdf-rag): query.py + config.yaml + src/ package.
const RAG_FILES = [
  "rag/query.py",
  "rag/config.yaml",
  "rag/VERSION",
  "rag/src/__init__.py",
  "rag/src/chunker.py",
  "rag/src/embedder.py",
  "rag/src/parser.py",
  "rag/src/rag_query.py",
  "rag/src/vector_store.py",
  "rag/src/web_search.py",
];
const dest = join(resolveVaultPath(), ".obsidian", "plugins", "ClaudianBridge");
mkdirSync(dest, { recursive: true });

// --- Plugin 3 ファイル: Plugin/ (SSOT) から Vault へコピー ---
const pluginDir = join(process.cwd(), "Plugin");
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
let pluginOk = true;
for (const f of PLUGIN_FILES) {
  const src = join(pluginDir, f);
  if (!existsSync(src)) {
    console.error(`❌ Plugin file missing: ${src} (run: npm run build)`);
    pluginOk = false;
    continue;
  }
  const target = join(dest, f);
  copyFileSync(src, target);
  console.log(`✅ Plugin/${f} -> ${target}`);
}
// マーカー検証
const deployedMain = join(dest, "main.js");
if (pluginOk && existsSync(deployedMain)) {
  const content = readFileSync(deployedMain, "utf-8");
  const missing = ["Claudian Bridge", "ClaudianBridge"].filter((m) => !content.includes(m));
  if (missing.length > 0) {
    console.error(`❌ Deploy FAILED: markers not found in deployed main.js: ${missing.join(", ")}`);
    pluginOk = false;
  } else {
    console.log("🔍 Markers verified: Claudian Bridge, ClaudianBridge");
  }
}

/** Recursively copy a directory. Returns false if source does not exist. */
function copyDirSync(src, dest) {
  if (!existsSync(src)) return false;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) copyDirSync(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
  return true;
}

/** Copy one repo-relative file into the plugin folder (creating parent dirs). */
function copyOne(srcRel, dstRel) {
  const src = join(process.cwd(), srcRel);
  if (!existsSync(src)) {
    console.error(`❌ Python/RAG file missing: ${src}`);
    return false;
  }
  const target = join(dest, dstRel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(src, target);
  console.log(`✅ ${srcRel} -> ${target}`);
  return true;
}

let pyOk = true;
for (const f of PY_FILES) pyOk = copyOne(`python/${f}`, f) && pyOk;
for (const f of RAG_FILES) pyOk = copyOne(f, f.replace(/^rag\//, "")) && pyOk;

// VERSION ファイルを src/manifest.json の version と完全同期（バージョン二重管理解消）
try {
  const manifestPath = "src/manifest.json";
  const manifestContent = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent);
  const versionFile = join(dest, "VERSION");
  writeFileSync(versionFile, manifest.version);
  console.log(`✅ VERSION 同期: ${manifest.version} -> ${versionFile}`);
} catch (e) {
  console.error(`❌ VERSION 同期失敗: ${e.message}`);
  pyOk = false;
}

// v0.27.0: 同梱 edge_tts（pip 依存ゼロ）。src-layout のため py/edge_tts/src/edge_tts/ が実体
const edgeTtsSrc = join(process.cwd(), "py", "edge_tts");
const edgeTtsDest = join(dest, "py", "edge_tts");
if (!copyDirSync(edgeTtsSrc, edgeTtsDest)) {
  console.error(`❌ edge_tts bundled dir missing: ${edgeTtsSrc}`);
  pyOk = false;
} else {
  console.log(`✅ py/edge_tts -> ${edgeTtsDest}`);
}

process.exit(pluginOk && pyOk ? 0 : 1);
