// F-051: Folder Bridge 機能 型定義
// NAS 等の外部フォルダを Vault のシャドウディレクトリへ同期し、ジャンクションで
// Vault 内パスへ橋渡しする機能の型定義。

export interface FolderBridge {
  id: string;
  linkName: string;
  vaultSubpath: string;
  externalPath: string;            // \\NAS\share\OCR
  shadowPath: string;              // {Vault}/.obsidian/cache/folder-bridge/{id}/
  excludePatterns: string[];       // minimatch globs
  syncDirection: 'nas_to_shadow';  // Phase 1 only
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FolderBridgeState =
  | 'disabled' | 'syncing' | 'linked' | 'out_of_sync'
  | 'vault_conflict' | 'external_missing' | 'paused' | 'error';

export interface FolderBridgeWatchHandle {
  close(): void;
}

export interface FolderBridgeFs {
  existsSync(p: string): boolean;
  statSync(p: string): { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean; mtimeMs: number; size: number };
  readdirSync(p: string): string[];
  mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  copyFileSync(src: string, dst: string): void;
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
  symlinkSync(target: string, path: string, type: 'junction' | 'dir' | 'file'): void;
  // chokidar compat wrapper — DI-default in watcher.ts
  watch(p: string, opts: { persistent: boolean; ignoreInitial: boolean }): {
    on(event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', cb: (path: string) => void): void;
    close(): void;
  };
}

export interface FolderBridgeDeps {
  fs: FolderBridgeFs;
  notice: (msg: string) => void;
  vaultBasePath: string;
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;
}

export interface ApplyAllResult {
  totalLinked: number;
  totalErrors: number;
  notices: string[];
}
