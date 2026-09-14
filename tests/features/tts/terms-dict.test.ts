// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { loadTermsDict } from '../../../src/features/tts/terms-dict';

describe('loadTermsDict (v0.36.0)', () => {
  it('空パスなら空 Map', async () => {
    const map = await loadTermsDict({} as never, '');
    expect(map.size).toBe(0);
  });

  it('ファイル不在なら空 Map（throw しない）', async () => {
    const app = { vault: { getAbstractFileByPath: () => null } } as never;
    const map = await loadTermsDict(app, '00_Vault管理/Tech_用語対照表.md');
    expect(map.size).toBe(0);
  });

  it('テーブルと箇条書き（→）から Map を作成', async () => {
    const md = [
      '## 用語',
      '',
      '| 用語 | やさしい表現 |',
      '| --- | --- |',
      '| API | アプリと会話する仕組み |',
      '| DB | データの保管庫 |',
      '',
      '- CLI → コマンド入力',
      '- GUI → 画面操作',
    ].join('\n');
    const file = { path: 'Tech_用語対照表.md' };
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p.endsWith('Tech_用語対照表.md') ? file : null),
        cachedRead: vi.fn().mockResolvedValue(md),
      },
    } as never;
    const map = await loadTermsDict(app, 'Tech_用語対照表.md');
    expect(map.get('API')).toBe('アプリと会話する仕組み');
    expect(map.get('DB')).toBe('データの保管庫');
    expect(map.get('CLI')).toBe('コマンド入力');
    expect(map.get('GUI')).toBe('画面操作');
  });

  it('ヘッダ行・空語釈を無視し、複合語 bullet を正しく取る', async () => {
    const md = [
      '## 用語',
      '',
      '| 用語 | やさしい表現 |',
      '| --- | --- |',
      '| API | アプリと会話する仕組み |',
      '| DB |  |',
      '',
      '- API キー → 秘密の文字列',
      '- GUI →',
    ].join('\n');
    const file = { path: 'Tech_用語対照表.md' };
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p.endsWith('Tech_用語対照表.md') ? file : null),
        cachedRead: vi.fn().mockResolvedValue(md),
      },
    } as never;
    const map = await loadTermsDict(app, 'Tech_用語対照表.md');
    // ヘッダ行「用語」は入らない・空語釈 DB は入らない
    expect(map.has('用語')).toBe(false);
    expect(map.has('DB')).toBe(false);
    // 複合語 bullet は語全体で入る・空 gloss は無視
    expect(map.get('API キー')).toBe('秘密の文字列');
    expect(map.has('GUI')).toBe(false);
  });
});
