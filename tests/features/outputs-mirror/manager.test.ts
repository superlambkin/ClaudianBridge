import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { OutputsMirrorManager, type OutputsMirrorDeps } from '../../../src/features/outputs-mirror/manager';

function makeDeps(overrides: Partial<OutputsMirrorDeps> = {}): OutputsMirrorDeps & {
  fs: ReturnType<typeof makeFsMocks>;
  notices: string[];
} {
  const fs = makeFsMocks();
  const notices: string[] = [];
  const deps = {
    vaultBasePath: 'C:/Fake/Vault',
    getDocumentsPath: vi.fn(() => 'C:/Fake/Documents'),
    fs,
    notice: vi.fn((m: string) => { notices.push(m); }),
    openPath: vi.fn(async () => ''),
    ...overrides,
  } as OutputsMirrorDeps & { fs: typeof fs; notices: string[] };
  (deps as { notices: string[] }).notices = notices;
  return deps;
}

function makeFsMocks() {
  return {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    symlinkSync: vi.fn(),
    lstatSync: vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
    rmdirSync: vi.fn(),
    rmSync: vi.fn(),
    readlinkSync: vi.fn(() => 'C:/Fake/Documents/ObsidainOutputs'),
  };
}

describe('OutputsMirrorManager', () => {
  let mgr: OutputsMirrorManager;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    mgr = new OutputsMirrorManager(deps);
  });

  it('1. 有効+Vault/Outputs 不在+外部あり → junction symlink 作成', () => {
    deps.fs.existsSync.mockImplementation((p: string) => p === 'C:/Fake/ExternalOutputs');
    const state = mgr.apply(true, 'C:/Fake/ExternalOutputs');
    expect(state).toBe('created');
    expect(deps.fs.symlinkSync).toHaveBeenCalledWith(
      'C:/Fake/ExternalOutputs',
      nodePath.join('C:/Fake/Vault', 'Outputs'),
      'junction',
    );
  });

  it('2. 有効+実フォルダ存在 → fs 操作なし・vault_exists', () => {
    deps.fs.existsSync.mockReturnValue(true);
    deps.fs.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    const state = mgr.apply(true, 'C:/Fake/ExternalOutputs');
    expect(state).toBe('vault_exists');
    expect(deps.fs.symlinkSync).not.toHaveBeenCalled();
    expect(deps.fs.rmdirSync).not.toHaveBeenCalled();
    expect(deps.fs.rmSync).not.toHaveBeenCalled();
    expect(deps.notice).toHaveBeenCalledTimes(1);
  });

  it('3. 有効+外部不在 → mkdirSync を先に呼ぶ', () => {
    // existsSync: link 不在 / target 不在
    const state = mgr.apply(true, 'C:/Fake/NewExternal');
    expect(state).toBe('created');
    expect(deps.fs.mkdirSync.mock.calls[0][0]).toBe('C:/Fake/NewExternal');
    expect(deps.fs.mkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
    expect(deps.fs.symlinkSync).toHaveBeenCalled();
    // mkdir は symlink より先
    const mkOrder = deps.fs.mkdirSync.mock.invocationCallOrder[0];
    const slOrder = deps.fs.symlinkSync.mock.invocationCallOrder[0];
    expect(mkOrder).toBeLessThan(slOrder);
  });

  it('4. 無効+ジャンクション存在 → 削除される・removed', () => {
    deps.fs.existsSync.mockReturnValue(true);
    deps.fs.lstatSync.mockReturnValue({ isSymbolicLink: () => true });
    const state = mgr.apply(false);
    expect(state).toBe('removed');
    expect(deps.fs.rmdirSync).toHaveBeenCalledWith(nodePath.join('C:/Fake/Vault', 'Outputs'));
  });

  it('5. 無効+実フォルダ → 削除しない（vault_exists）', () => {
    deps.fs.existsSync.mockReturnValue(true);
    deps.fs.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    const state = mgr.apply(false);
    expect(state).toBe('vault_exists');
    expect(deps.fs.rmdirSync).not.toHaveBeenCalled();
    expect(deps.fs.rmSync).not.toHaveBeenCalled();
  });

  it('6. deps 未指定時、node:fs 実物デフォルトで動く（tmp ディレクトリ）', () => {
    const tmp = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'outputs-mirror-'));
    try {
      const vault = nodePath.join(tmp, 'vault');
      nodeFs.mkdirSync(vault);
      const external = nodePath.join(tmp, 'external');
      const realMgr = new OutputsMirrorManager({ vaultBasePath: vault });
      // 作成
      expect(realMgr.apply(true, external)).toBe('created');
      const linkPath = nodePath.join(vault, 'Outputs');
      expect(nodeFs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(realMgr.status().linked).toBe(true);
      expect(realMgr.status().target).toBe(external);
      // 既リンク
      expect(realMgr.apply(true, external)).toBe('linked');
      // 削除
      expect(realMgr.apply(false)).toBe('removed');
      expect(nodeFs.existsSync(linkPath)).toBe(false);
    } finally {
      nodeFs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('7. symlinkSync 例外 → error + notice 呼び出し', () => {
    deps.fs.symlinkSync.mockImplementation(() => { throw new Error('boom'); });
    const state = mgr.apply(true, 'C:/Fake/ExternalOutputs');
    expect(state).toBe('error');
    expect(deps.notice).toHaveBeenCalled();
  });

  it('10a-1. openExternal: openPath が正パスで呼ばれる', async () => {
    deps.fs.existsSync.mockReturnValue(true);
    await mgr.openExternal('C:/Fake/ExternalOutputs');
    expect(deps.openPath).toHaveBeenCalledWith('C:/Fake/ExternalOutputs');
    expect(deps.notice).not.toHaveBeenCalled();
  });

  it('10a-2. openExternal: パス不在時は mkdir 後に openPath', async () => {
    await mgr.openExternal('C:/Fake/NotYet');
    const mkOrder = deps.fs.mkdirSync.mock.invocationCallOrder[0];
    const opOrder = deps.openPath.mock.invocationCallOrder[0];
    expect(mkOrder).toBeLessThan(opOrder);
    expect(deps.openPath).toHaveBeenCalledWith('C:/Fake/NotYet');
  });

  it('10a-3. openExternal: openPath がエラー文字列を返したら notice', async () => {
    deps.fs.existsSync.mockReturnValue(true);
    (deps.openPath as ReturnType<typeof vi.fn>).mockResolvedValue('some failure');
    await mgr.openExternal('C:/Fake/ExternalOutputs');
    expect(deps.notice).toHaveBeenCalledTimes(1);
    expect(deps.notice.mock.calls[0][0]).toContain('some failure');
  });
});
