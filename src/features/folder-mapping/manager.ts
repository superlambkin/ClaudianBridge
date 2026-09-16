import * as nodePath from 'path';
import type {
  FolderMapping,
  FolderMappingDeps,
  FolderMappingState,
  ApplyAllResult,
  MappingStatus,
} from './types';

/** F-050: v0.50.x までの固定サブパス（起動時の自動貼り直し対象） */
export const LEGACY_SUBPATH = '@10_Input';

export class FolderMappingManager {
  private readonly deps: Required<Omit<FolderMappingDeps, 'generateId' | 'now'>> &
    Pick<FolderMappingDeps, 'generateId' | 'now'>;

  constructor(deps?: Partial<FolderMappingDeps>) {
    this.deps = {
      vaultBasePath: deps?.vaultBasePath ?? '',
      fs: deps?.fs ?? (require('fs') as FolderMappingDeps['fs']),
      notice: deps?.notice ?? ((m: string) => { console.log(m); }),
      openPath: deps?.openPath ?? (async () => ''),
      generateId: deps?.generateId,
      now: deps?.now,
    };
  }

  resolveLinkPath(mapping: FolderMapping): string {
    return nodePath.join(this.deps.vaultBasePath, mapping.vaultSubpath, mapping.linkName);
  }

  apply(mapping: FolderMapping): FolderMappingState {
    const linkPath = this.resolveLinkPath(mapping);
    const exists = this.deps.fs.existsSync(linkPath);
    const isLink = exists && this.deps.fs.lstatSync(linkPath).isSymbolicLink();

    if (!mapping.enabled) {
      if (isLink) {
        this.deps.fs.rmdirSync(linkPath);
        this.deps.notice(`${mapping.vaultSubpath}/${mapping.linkName} のリンクを削除しました`);
        return 'removed';
      }
      return 'inactive';
    }

    // enabled — 先に validation
    if (!mapping.externalPath || mapping.externalPath.trim() === '') {
      this.deps.notice(`外部パス ${mapping.externalPath} が存在しません。設定を確認してください（リンクは作成していません）。`);
      return 'external_missing';
    }
    // circular 検出（Vault 自身・祖先）
    const rel = nodePath.relative(this.deps.vaultBasePath, mapping.externalPath);
    if (rel === '' || (!rel.startsWith('..') && !nodePath.isAbsolute(rel))) {
      this.deps.notice(`外部パスが Vault 自身を指しているため拒否しました: ${mapping.externalPath}`);
      return 'circular';
    }
    // ancestor 検出（Vault が externalPath の子孫）
    const sep = process.platform === 'win32' ? '\\' : '/';
    const normalize = (s: string) =>
      process.platform === 'win32' ? s.toLowerCase() : s;
    const normalizedVault = normalize(this.deps.vaultBasePath);
    const normalizedP = normalize(mapping.externalPath);
    if (
      normalizedVault === normalizedP ||
      normalizedVault.startsWith(normalizedP + sep)
    ) {
      this.deps.notice(`外部パスが Vault 自身を指しているため拒否しました: ${mapping.externalPath}`);
      return 'circular';
    }
    // forbidden path 検出（Windows のみ厳格・POSIX は validation.ts 任せ）
    if (process.platform === 'win32') {
      const lower = mapping.externalPath.toLowerCase();
      if (
        lower === 'c:\\windows' ||
        lower.startsWith('c:\\windows\\') ||
        lower === 'c:\\program files' ||
        lower.startsWith('c:\\program files\\') ||
        lower === 'c:\\program files (x86)' ||
        lower.startsWith('c:\\program files (x86)\\')
      ) {
        this.deps.notice(`禁止パス（Vault 祖先 / システムフォルダ等）: ${mapping.externalPath}`);
        return 'forbidden_path';
      }
    }

    if (isLink) return 'linked';
    if (exists) {
      this.deps.notice(`${mapping.vaultSubpath}/${mapping.linkName} に実フォルダが存在します。リンク作成をスキップしました。手動で確認してください。`);
      return 'vault_exists';
    }
    if (!this.deps.fs.existsSync(mapping.externalPath)) {
      this.deps.notice(`外部パス ${mapping.externalPath} が存在しません。設定を確認してください（リンクは作成していません）。`);
      return 'external_missing';
    }
    this.deps.fs.mkdirSync(nodePath.dirname(linkPath), { recursive: true });
    this.deps.fs.symlinkSync(mapping.externalPath, linkPath, 'junction');
    this.deps.notice(`${mapping.vaultSubpath}/${mapping.linkName} → ${mapping.externalPath} のリンクを作成しました`);
    return 'created';
  }

  applyAll(mappings: FolderMapping[]): ApplyAllResult {
    const applied: ApplyAllResult['applied'] = [];
    let totalCreated = 0;
    let totalRemoved = 0;
    let totalErrors = 0;
    for (const m of mappings) {
      // F-050: 旧 @10_Input/{linkName} junction を新サブパスへ移行
      if (m.vaultSubpath !== LEGACY_SUBPATH) {
        const legacyPath = nodePath.join(this.deps.vaultBasePath, LEGACY_SUBPATH, m.linkName);
        try {
          if (
            this.deps.fs.existsSync(legacyPath) &&
            this.deps.fs.lstatSync(legacyPath).isSymbolicLink()
          ) {
            this.deps.fs.rmdirSync(legacyPath);
            this.deps.notice(`旧リンクを ${m.vaultSubpath}/${m.linkName} へ移行しました`);
          }
        } catch {
          // 旧 junction の削除に失敗しても続行（新パスの apply は独立）
        }
      }
      const state = this.apply(m);
      applied.push({ id: m.id, state });
      if (state === 'created') totalCreated++;
      else if (state === 'removed') totalRemoved++;
      else if (state === 'error') totalErrors++;
    }
    return { applied, totalCreated, totalRemoved, totalErrors };
  }

  status(mapping: FolderMapping): MappingStatus {
    const linkPath = this.resolveLinkPath(mapping);
    if (!this.deps.fs.existsSync(linkPath)) {
      return { linked: false, state: 'inactive' };
    }
    if (!this.deps.fs.lstatSync(linkPath).isSymbolicLink()) {
      return { linked: false, state: 'vault_exists' };
    }
    return { linked: true, state: 'linked' };
  }

  async openExternal(mapping: FolderMapping): Promise<void> {
    await this.deps.openPath(mapping.externalPath);
  }
}