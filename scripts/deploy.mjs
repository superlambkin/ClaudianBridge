#!/usr/bin/env node
/**
 * Deploy Claudian Bridge build artifacts to the Obsidian vault.
 * Thin wrapper around the shared deploy tool in D:\AI-Agent\_devtools.
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const shared = fileURLToPath(new URL("../../_devtools/obsidian-deploy.mjs", import.meta.url));
const result = spawnSync(
  process.execPath,
  [shared, "claudian-bridge", "--markers", "Claudian Bridge,claudian-bridge"],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
