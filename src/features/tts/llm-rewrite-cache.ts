/**
 * v0.37.0 (F-033): LLM 原稿書き換え結果のディスクキャッシュ。
 * `{filePath}|{contentLength}|{profile}` をキーに、プラグインデータディレクトリ下の
 * `llm-rewrite-cache.json` へ保存（上限 MAX_CACHE_ENTRIES・LRU 追い出し）。
 */
import * as fs from 'fs';
import * as path from 'path';

export const MAX_CACHE_ENTRIES = 100;

/** v0.37.1 (M3): 安定した簡易ハッシュ（FNV-1a）— 同長編集でも異なるキーになる */
function contentHash(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function rewriteCacheKey(filePath: string, content: string, profile: string): string {
  return `${filePath}|${content.length}|${contentHash(content)}|${profile}`;
}

export class RewriteCache {
  private file: string;
  private order: string[] = [];
  private data = new Map<string, string>();

  constructor(private dataDir: string) {
    this.file = path.join(dataDir, 'llm-rewrite-cache.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      const parsed = JSON.parse(raw) as { k: string; v: string }[];
      if (Array.isArray(parsed)) {
        this.order = [];
        this.data = new Map();
        for (const e of parsed.slice(-MAX_CACHE_ENTRIES)) {
          if (!this.data.has(e.k)) { this.order.push(e.k); this.data.set(e.k, e.v); }
        }
      }
    } catch { /* 初回・破損時は空 */ }
  }

  private persist(): void {
    try {
      const arr = this.order.map((k) => ({ k, v: this.data.get(k)! }));
      fs.writeFileSync(this.file, JSON.stringify(arr), 'utf-8');
    } catch { /* 書けない環境は黙容 */ }
  }

  async get(key: string): Promise<string | null> {
    if (!this.data.has(key)) return null;
    // LRU: アクセスしたキーを末尾へ
    const i = this.order.indexOf(key);
    if (i >= 0) { this.order.splice(i, 1); this.order.push(key); }
    return this.data.get(key)!;
  }

  async put(key: string, value: string): Promise<void> {
    if (this.data.has(key)) {
      const i = this.order.indexOf(key);
      if (i >= 0) this.order.splice(i, 1);
    }
    this.data.set(key, value);
    this.order.push(key);
    while (this.order.length > MAX_CACHE_ENTRIES) {
      const oldest = this.order.shift()!;
      this.data.delete(oldest);
    }
    this.persist();
  }
}
