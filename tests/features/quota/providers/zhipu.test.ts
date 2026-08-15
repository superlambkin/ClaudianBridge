// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/features/quota/python', () => ({
  runPython: vi.fn(),
  parseJsonOutput: (stdout: string) => {
    try {
      return { ok: true as const, data: JSON.parse(stdout) as unknown };
    } catch {
      return { ok: false as const, error: 'JSON parse error', data: null };
    }
  },
}));

import { createZhipuProvider } from '../../../../src/features/quota/providers/zhipu';
import { runPython } from '../../../../src/features/quota/python';

const runPythonMock = vi.mocked(runPython);

function makeProvider() {
  return createZhipuProvider({
    getKey: () => 'sk-zhipu',
    getPythonPath: () => 'py',
    getVaultRoot: () => 'C:\\vault',
    getWindow: () => '5h',
  });
}

describe('createZhipuProvider', () => {
  beforeEach(() => {
    runPythonMock.mockReset();
  });

  it('キー未設定 → isConfigured=false', () => {
    const p = createZhipuProvider({
      getKey: () => undefined,
      getPythonPath: () => 'py',
      getVaultRoot: () => '',
      getWindow: () => '5h',
    });
    expect(p.isConfigured()).toBe(false);
  });

  it('成功 → 5h 使用率 % を返す', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 45, nextResetTime: '2099-01-01T00:00:00Z', unit: 3, remaining: 2000 }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('45%');
    expect(q.pct).toBe(45);
    expect(q.detail).toBe('5h');
    expect(q.remaining).toBe('2,000');
    expect(q.resetAt).toBe('2099-01-01T00:00:00Z');
  });

  it('成功（unit=6 週間）→ detail=week', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 45, nextResetTime: 1787194106998, unit: 6 }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('45%');
    expect(q.detail).toBe('week');
  });

  it('expired（401/403）→ status expired', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'expired' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('expired');
  });

  it('error → status error + error メッセージ', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'code 500' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
    expect(q.error).toBe('code 500');
  });

  it('Python 不在（exitCode 127）→ error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 127, stdout: '', stderr: 'python not found' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });

  it('stdout が不正 JSON → error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 0, stdout: 'not json', stderr: '' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });

  it('API キーを args ではなく env で渡す', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 10 }),
      stderr: '',
    });
    await makeProvider().fetch();
    const opts = runPythonMock.mock.calls[0][0];
    expect(opts.env.ZHIPU_API_KEY).toBe('sk-zhipu');
    expect(opts.args).not.toContain('sk-zhipu');
  });

  it('window=week で env.ZHIPU_WINDOW=week が渡される', async () => {
    const p = createZhipuProvider({
      getKey: () => 'sk-zhipu',
      getPythonPath: () => 'py',
      getVaultRoot: () => 'C:\\vault',
      getWindow: () => 'week',
    });
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 45, unit: 6 }),
      stderr: '',
    });
    await p.fetch();
    const opts = runPythonMock.mock.calls[0][0];
    expect(opts.env.ZHIPU_WINDOW).toBe('week');
  });

  it('ok=true で pct 欠落/null → status success, value --, pct null', async () => {
    for (const payload of [{ ok: true }, { ok: true, pct: null }]) {
      runPythonMock.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify(payload),
        stderr: '',
      });
      const q = await makeProvider().fetch();
      expect(q.status).toBe('success');
      expect(q.value).toBe('--');
      expect(q.pct).toBeNull();
    }
  });
});
