import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  resolveFolder, sanitizeTitle, buildFilename, buildFrontmatter, composeBody, saveMarkdown,
} from '../../../src/features/memory/save';

describe('save helpers', () => {
  it('resolveFolder: 相対は vaultRoot に結合し / に正規化', () => {
    expect(resolveFolder('C:/vault', 'Memory/')).toBe('C:/vault/Memory');
  });
  it('resolveFolder: 絶対パスはそのまま', () => {
    expect(resolveFolder('C:/vault', 'D:/mem')).toBe('D:/mem');
  });
  it('resolveFolder: ドライブルート C:/ は末尾スラッシュを維持する（drive-relative に劣化しない）', () => {
    expect(resolveFolder('C:/vault', 'C:/')).toBe('C:/');
  });
  it('resolveFolder: ルート / はそのまま', () => {
    expect(resolveFolder('C:/vault', '/')).toBe('/');
  });
  it('sanitizeTitle: 不正文字を _ に置換し 60 字に切る', () => {
    expect(sanitizeTitle('a/b:c*')).toBe('a_b_c_');
    expect(sanitizeTitle('あ'.repeat(100)).length).toBe(60);
  });
  it('buildFilename: YYYY-MM-DD-HHMM_タイトル.md', () => {
    const d = new Date(2026, 7, 16, 10, 30);
    expect(buildFilename(d, '進捗まとめ')).toBe('2026-08-16-1030_進捗まとめ.md');
  });
  it('buildFilename: タイトル無しは claudian-chat', () => {
    const d = new Date(2026, 7, 16, 10, 30);
    expect(buildFilename(d, '')).toBe('2026-08-16-1030_claudian-chat.md');
  });
  it('buildFrontmatter: scope=block で正しく組立', () => {
    const fm = buildFrontmatter('タイトル', 'block', '2026-08-16 10:30');
    expect(fm).toContain('title: タイトル');
    expect(fm).toContain('scope: block');
    expect(fm).toContain('created: 2026-08-16 10:30');
    expect(fm).toContain('type: claudian-chat');
  });
  it('composeBody: pair は ## 質問 / ## 回答', () => {
    const body = composeBody('pair', [
      { role: 'user', md: 'Q' },
      { role: 'assistant', md: 'A' },
    ]);
    expect(body).toBe('## 質問\n\nQ\n\n## 回答\n\nA');
  });
  it('composeBody: conversation は ### 見出しで区切り、block は md のみ', () => {
    const conv = composeBody('conversation', [{ role: 'user', md: 'Q' }, { role: 'assistant', md: 'A' }]);
    expect(conv).toContain('### 👤 ユーザー');
    expect(conv).toContain('### 🤖 Claude');
    expect(composeBody('block', [{ role: 'assistant', md: 'A' }])).toBe('A');
  });
});

describe('saveMarkdown', () => {
  let mkdirSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let accessSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as never);
    writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);
    // 既定では対象ファイルは存在しない前提（ENOENT → false）
    accessSpy = vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('相対フォルダに frontmatter 付きで書き込む', async () => {
    const app = { vault: { adapter: { getBasePath: () => 'C:/vault' } } } as never;
    const r = await saveMarkdown(app, 'Memory/', 'pair', 'タイトル', '本文');
    expect(r.ok).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const [file, content] = writeSpy.mock.calls[0] as unknown as [string, string];
    expect(file.replace(/\\/g, '/')).toContain('C:/vault/Memory/');
    expect(content).toContain('---');
    expect(content).toContain('本文');
  });

  it('書き込み失敗時は ok=false で返す', async () => {
    writeSpy.mockRejectedValueOnce(new Error('disk full'));
    const app = { vault: { adapter: { getBasePath: () => 'C:/vault' } } } as never;
    const r = await saveMarkdown(app, 'Memory/', 'block', 't', 'b');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('disk full');
  });

  it('同一分・同一タイトルで保存すると連番 (-1) を付与して同名衝突を回避する', async () => {
    const app = { vault: { adapter: { getBasePath: () => 'C:/vault' } } } as never;
    // 1 回目：ベース名は空き
    await saveMarkdown(app, 'Memory/', 'pair', 'タイトル', '本文1');
    // 2 回目：ベース名が既存 → -1 が空き
    accessSpy.mockReset();
    accessSpy.mockResolvedValueOnce(undefined as never);  // base 存在
    accessSpy.mockRejectedValueOnce(new Error('ENOENT')); // -1 は空き
    await saveMarkdown(app, 'Memory/', 'pair', 'タイトル', '本文2');

    expect(writeSpy).toHaveBeenCalledTimes(2);
    const [file1] = writeSpy.mock.calls[0] as unknown as [string];
    const [file2] = writeSpy.mock.calls[1] as unknown as [string];
    expect(file1.replace(/\\/g, '/')).not.toMatch(/-1\.md$/);
    expect(file2.replace(/\\/g, '/')).toMatch(/-1\.md$/);
  });
});
