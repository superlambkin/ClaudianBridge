import * as nodeFs from 'fs';
import * as nodePath from 'path';

export type MirrorState =
  | 'linked'
  | 'vault_exists'
  | 'created'
  | 'removed'
  | 'inactive'
  | 'error';

export interface OutputsMirrorDeps {
  vaultBasePath: string;
  getDocumentsPath: () => string;
  fs: {
    existsSync: (p: string) => boolean;
    mkdirSync: (p: string, opts: { recursive: true }) => void;
    symlinkSync: (target: string, path: string, type: string) => void;
    lstatSync: (p: string) => { isSymbolicLink(): boolean };
    rmdirSync: (p: string) => void;
    rmSync: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;
    readlinkSync?: (p: string) => string;
  };
  notice: (msg: string) => void;
  openPath: (p: string) => Promise<string>;
}

const DEFAULT_EXTERNAL_DIR = 'ObsidainOutputs';

function defaultOpenPath(p: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  return electron.shell.openPath(p) as Promise<string>;
}

export class OutputsMirrorManager {
  private readonly deps: OutputsMirrorDeps;

  constructor(deps?: Partial<OutputsMirrorDeps>) {
    this.deps = {
      vaultBasePath: deps?.vaultBasePath ?? '',
      getDocumentsPath:
        deps?.getDocumentsPath ?? (() => nodePath.join(require('os').homedir(), 'Documents')),
      fs: deps?.fs ?? (nodeFs as unknown as OutputsMirrorDeps['fs']),
      notice: deps?.notice ?? ((m: string) => { console.log(m); }),
      openPath: deps?.openPath ?? defaultOpenPath,
    };
  }

  private get vaultOutputsPath(): string {
    return nodePath.join(this.deps.vaultBasePath, 'Outputs');
  }

  private resolveExternalPath(externalPath?: string): string {
    if (externalPath && externalPath.trim() !== '') return externalPath;
    return nodePath.join(this.deps.getDocumentsPath(), DEFAULT_EXTERNAL_DIR);
  }

  private isJunction(p: string): boolean {
    try {
      return this.deps.fs.lstatSync(p).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /** v0.41.0: Vault/Outputs が実フォルダ（ジャンクションでない）として存在するか */
  vaultOutputsIsRealFolder(): boolean {
    try {
      if (!this.deps.fs.existsSync(this.vaultOutputsPath)) return false;
      return !this.isJunction(this.vaultOutputsPath);
    } catch {
      return false;
    }
  }

  status(): { linked: boolean; target?: string } {
    if (process.platform !== 'win32') return { linked: false };
    const p = this.vaultOutputsPath;
    if (!this.isJunction(p)) return { linked: false };
    let target: string | undefined;
    try {
      target = this.deps.fs.readlinkSync?.(p);
    } catch {
      target = undefined;
    }
    return { linked: true, target };
  }

  apply(enabled: boolean, externalPath?: string): MirrorState {
    if (process.platform !== 'win32') return 'inactive';
    try {
      const linkPath = this.vaultOutputsPath;
      if (!enabled) {
        if (!this.deps.fs.existsSync(linkPath)) return 'inactive';
        if (this.isJunction(linkPath)) {
          this.deps.fs.rmdirSync(linkPath);
          return 'removed';
        }
        return 'vault_exists';
      }
      // enabled
      if (this.deps.fs.existsSync(linkPath)) {
        if (this.isJunction(linkPath)) return 'linked';
        this.deps.notice('既存の Outputs フォルダを優先します（リンク作成をスキップ）');
        return 'vault_exists';
      }
      const target = this.resolveExternalPath(externalPath);
      if (!this.deps.fs.existsSync(target)) {
        this.deps.fs.mkdirSync(target, { recursive: true });
      }
      this.deps.fs.symlinkSync(target, linkPath, 'junction');
      this.deps.notice(`Outputs フォルダへのリンクを作成しました: ${target}`);
      return 'created';
    } catch (e) {
      this.deps.notice(`Outputs ミラー設定でエラーが発生しました: ${String(e)}`);
      return 'error';
    }
  }

  async openExternal(externalPath?: string): Promise<void> {
    try {
      const target = this.resolveExternalPath(externalPath);
      if (!this.deps.fs.existsSync(target)) {
        this.deps.fs.mkdirSync(target, { recursive: true });
      }
      const err = await this.deps.openPath(target);
      if (err) this.deps.notice(`フォルダを開けませんでした: ${err}`);
    } catch (e) {
      this.deps.notice(`フォルダを開く際にエラーが発生しました: ${String(e)}`);
    }
  }
}
