#!/usr/bin/env node
/**
 * Deploy Claudian Bridge build artifacts + Python helper scripts to the Obsidian vault.
 * Thin wrapper around the shared deploy tool in D:\AI-Agent\_devtools.
 *
 * The Python helpers (_chroma_inspect.py / _run_markitdown.py / split_*.py) live in
 * the repo's python/ directory and are copied flat into the deployed plugin folder,
 * because at runtime the plugin resolves them from <pluginDir>.
 */
import { spawnSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveVaultPath } from "../../_devtools/obsidian-deploy.mjs";

const shared = fileURLToPath(new URL("../../_devtools/obsidian-deploy.mjs", import.meta.url));
const result = spawnSync(
  process.execPath,
  [shared, "ClaudianBridge", "--markers", "Claudian Bridge,ClaudianBridge"],
  { stdio: "inherit" }
);

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

process.exit(result.status === 0 && pyOk ? 0 : 1);
