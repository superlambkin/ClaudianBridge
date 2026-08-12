import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disableLegacyPluginsOnce } from '../../src/legacy/disable-legacy';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cb-disable-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('disableLegacyPluginsOnce', () => {
  it('community-plugins.json から4プラグイン除外 (chroma-inspector 含む)', () => {
    mkdirSync(join(dir, '.obsidian', 'plugins', 'claudian-selection-bridge'), { recursive: true });
    mkdirSync(join(dir, '.obsidian', 'plugins', 'vault-office-bridge'), { recursive: true });
    mkdirSync(join(dir, '.obsidian', 'plugins', '_disabled__extension-whitelist'), { recursive: true });
    mkdirSync(join(dir, '.obsidian', 'plugins', 'chroma-inspector'), { recursive: true });
    writeFileSync(
      join(dir, '.obsidian', 'community-plugins.json'),
      JSON.stringify({ plugins: ['claudian-selection-bridge', 'vault-office-bridge', 'extension-whitelist', 'chroma-inspector', 'other-plugin'] })
    );
    const result = disableLegacyPluginsOnce(dir);
    expect(result.disabled).toEqual(expect.arrayContaining(['claudian-selection-bridge', 'vault-office-bridge', 'extension-whitelist', 'chroma-inspector']));
    const cp = JSON.parse(readFileSync(join(dir, '.obsidian', 'community-plugins.json'), 'utf-8'));
    expect(cp.plugins).toEqual(['other-plugin']);
  });

  it('フォルダを _disabled__ 接頭辞でリネーム (chroma-inspector 含む)', () => {
    mkdirSync(join(dir, '.obsidian', 'plugins', 'claudian-selection-bridge'), { recursive: true });
    mkdirSync(join(dir, '.obsidian', 'plugins', 'vault-office-bridge'), { recursive: true });
    mkdirSync(join(dir, '.obsidian', 'plugins', 'chroma-inspector'), { recursive: true });
    writeFileSync(
      join(dir, '.obsidian', 'community-plugins.json'),
      JSON.stringify({ plugins: ['claudian-selection-bridge', 'vault-office-bridge', 'chroma-inspector'] })
    );
    disableLegacyPluginsOnce(dir);
    expect(existsSync(join(dir, '.obsidian', 'plugins', '_disabled__claudian-selection-bridge'))).toBe(true);
    expect(existsSync(join(dir, '.obsidian', 'plugins', '_disabled__vault-office-bridge'))).toBe(true);
    expect(existsSync(join(dir, '.obsidian', 'plugins', '_disabled__chroma-inspector'))).toBe(true);
    expect(existsSync(join(dir, '.obsidian', 'plugins', 'claudian-selection-bridge'))).toBe(false);
    expect(existsSync(join(dir, '.obsidian', 'plugins', 'chroma-inspector'))).toBe(false);
  });

  it('フラグが存在すれば2度目は何もしない', () => {
    mkdirSync(join(dir, '.obsidian'), { recursive: true });
    writeFileSync(join(dir, '.obsidian', '.claudian-bridge.legacy-disabled'), '2026-08-10');
    const result = disableLegacyPluginsOnce(dir);
    expect(result.disabled).toEqual([]);
    expect(result.renamed).toEqual([]);
  });

  it('フラグファイルを作成する', () => {
    mkdirSync(join(dir, '.obsidian', 'plugins', 'claudian-selection-bridge'), { recursive: true });
    writeFileSync(
      join(dir, '.obsidian', 'community-plugins.json'),
      JSON.stringify({ plugins: ['claudian-selection-bridge'] })
    );
    disableLegacyPluginsOnce(dir);
    expect(existsSync(join(dir, '.obsidian', '.claudian-bridge.legacy-disabled'))).toBe(true);
  });

  it('claudian-bridge 自身は community-plugins.json から除外しない（v0.2.0 regression 防止）', () => {
    mkdirSync(join(dir, '.obsidian', 'plugins', 'claudian-selection-bridge'), { recursive: true });
    writeFileSync(
      join(dir, '.obsidian', 'community-plugins.json'),
      JSON.stringify({ plugins: ['claudian-selection-bridge', 'claudian-bridge', 'realclaudian'] })
    );
    disableLegacyPluginsOnce(dir);
    const cp = JSON.parse(readFileSync(join(dir, '.obsidian', 'community-plugins.json'), 'utf-8'));
    // claudian-bridge と realclaudian は除外されない
    expect(cp.plugins).toContain('claudian-bridge');
    expect(cp.plugins).toContain('realclaudian');
    expect(cp.plugins).not.toContain('claudian-selection-bridge');
  });
});
