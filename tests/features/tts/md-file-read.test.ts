// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractMdText } from '../../../src/features/tts/md-file-read';
import { DEFAULT_SPEECH_FILTER_OPTIONS } from '../../../src/core/settings';
import type { SpeechFilterOptions } from '../../../src/core/settings';

const T: SpeechFilterOptions = { ...DEFAULT_SPEECH_FILTER_OPTIONS }; // table=true 他 false

describe('extractMdText: 記号正規化（v0.33.9 ハッシュタグ等を読まない）', () => {
  it('見出しの # を除去する', () => {
    const out = extractMdText('# 大見出し\n本文', T);
    expect(out).toContain('大見出し');
    expect(out).not.toMatch(/#/);
  });

  it('ハッシュタグ（#タグ）を除去する', () => {
    const out = extractMdText('本文です #タグ名 #日本語タグ 続き', T);
    expect(out).toContain('本文です');
    expect(out).toContain('続き');
    expect(out).not.toContain('#タグ名');
    expect(out).not.toContain('#日本語タグ');
  });

  it('wikilink はエイリアス（またはファイル名）だけ読む', () => {
    expect(extractMdText('参考は [[ノート|エイリアス]] です', T)).toContain('エイリアス');
    expect(extractMdText('参考は [[ノート]] です', T)).toContain('ノート');
    expect(extractMdText('参考は [[ノート|エイリアス]] です', T)).not.toContain('[[');
  });

  it('markdown リンクはテキストだけ読む（URL を読まない）', () => {
    const out = extractMdText('詳細は [Google](https://example.com/a/b) 参照', T);
    expect(out).toContain('Google');
    expect(out).not.toContain('https://');
  });

  it('強調記号（** と ~~）を除去する', () => {
    const out = extractMdText('**重要**と~~取消~~です', T);
    expect(out).toContain('重要');
    expect(out).toContain('取消');
    expect(out).not.toMatch(/\*\*|~~/);
  });

  it('リストマーカー（- ）を除去する', () => {
    const out = extractMdText('- 項目1\n- 項目2', T);
    expect(out).toContain('項目1');
    expect(out).not.toMatch(/^-/m);
  });

  it('スラッシュ / を読まない（空白に置換）', () => {
    const out = extractMdText('パスは data/test/file です', T);
    expect(out).toContain('data test file');
    expect(out).not.toContain('/');
  });
});

describe('extractMdText', () => {
  it('frontmatter を除去する', () => {
    const md = '---\ntitle: テスト\n---\n本文です';
    expect(extractMdText(md, T)).toBe('本文です');
  });

  it('コードブロックを除去する（code=false）', () => {
    const md = '説明\n```ts\nconst x = 1;\n```\n後半';
    expect(extractMdText(md, { ...T, code: false })).toContain('説明');
    expect(extractMdText(md, { ...T, code: false })).toContain('後半');
    expect(extractMdText(md, { ...T, code: false })).not.toContain('const x');
  });

  it('テーブルを除去する（table=false）', () => {
    const md = '表です\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    expect(extractMdText(md, { ...T, table: false })).not.toContain('| A |');
    expect(extractMdText(md, { ...T, table: false })).not.toContain('| 1 |');
  });

  it('テーブルを読む（table=true・デフォルト）', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    expect(extractMdText(md, T)).toContain('A');
  });

  it('テーブルを除去する（table=false・末尾改行なしの最終行）', () => {
    const md = '前置き\n| A | B |\n|---|---|\n| 1 | 2 |';
    expect(extractMdText(md, { ...T, table: false })).not.toContain('| A |');
    expect(extractMdText(md, { ...T, table: false })).not.toContain('| 1 |');
    expect(extractMdText(md, { ...T, table: false })).toContain('前置き');
  });

  it('テーブルを除去する（table=false・1行のみ・末尾改行なし）', () => {
    expect(extractMdText('| 1 | 2 |', { ...T, table: false })).toBe('');
  });

  it('コールアウトを除去する（callout=false）', () => {
    const md = '本文\n> [!note] 注意\n> 中身\n末尾';
    expect(extractMdText(md, { ...T, callout: false })).not.toContain('注意');
  });
});
