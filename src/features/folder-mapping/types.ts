// F-049: フォルダマッピング機能 型定義
// 任意フォルダを Vault/{vaultSubpath}/{linkName} に Windows ジャンクションでリンクする機能の型定義。

export interface FolderMapping {
  id: string;
  linkName: string;
  /** Vault 内マッピング先（Vault 相対パス・例: "10_Input"）。
   *  旧レコードは normalize で '10_Input' が注入される */
  vaultSubpath: string;
  externalPath: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
export type FolderMappingState =
  | 'linked' | 'created' | 'removed' | 'inactive'
  | 'vault_exists' | 'external_missing' | 'circular'
  | 'forbidden_path' | 'error';
export interface FolderMappingFs {
  existsSync: (p: string) => boolean;
  mkdirSync: (p: string, opts: { recursive: true }) => void;
  symlinkSync: (target: string, path: string, type: string) => void;
  lstatSync: (p: string) => { isSymbolicLink(): boolean };
  rmdirSync: (p: string) => void;
  rmSync: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;
  realpathSync?: (p: string) => string;
  statSync?: (p: string) => { isDirectory(): boolean };
}
export interface FolderMappingDeps {
  vaultBasePath: string;
  fs: FolderMappingFs;
  notice: (msg: string) => void;
  openPath: (p: string) => Promise<string>;
  generateId?: () => string;
  now?: () => number;
}
export interface ApplyAllResult {
  applied: Array<{ id: string; state: FolderMappingState }>;
  totalCreated: number;
  totalRemoved: number;
  totalErrors: number;
}
export interface MappingStatus {
  linked: boolean;
  target?: string;
  state: FolderMappingState;
}