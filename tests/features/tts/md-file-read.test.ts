// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractMdText } from '../../../src/features/tts/md-file-read';
import { DEFAULT_SPEECH_FILTER_OPTIONS } from '../../../src/core/settings';
import type { SpeechFilterOptions } from '../../../src/core/settings';

const T: SpeechFilterOptions = { ...DEFAULT_SPEECH_FILTER_OPTIONS }; // table=true 他 false

describe('extractMdText: 記号正規化（v0.32.1 ハッシュタグ等を読まない）', () => {
  it('見出しの # は保持する（章境界判定用・除去は chunkTextNatural 側）', () => {
    const out = extractMdText('# 大見出し\n本文', T);
    expect(out).toContain('大見出し');
    expect(out).toContain('#');
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

  it('ハイフン・ダッシュ（- ‐ – — ―）を読まない（空白に置換）', () => {
    const out = extractMdText('東京‐大阪間の e-mail とサブ—タイトル、A–B、C―D、スター‐', T);
    expect(out).not.toMatch(/[-‐‒–—―]/);
    expect(out).toContain('東京 大阪間');
    expect(out).toContain('e mail');
  });

  it('インラインコードのバッククォート ` を読まない', () => {
    const out = extractMdText('変数は `config` です', T);
    expect(out).toContain('config');
    expect(out).not.toContain('`');
  });

  it('引用の行頭 > を読まない', () => {
    const out = extractMdText('> 引用文です\n本文', T);
    expect(out).toContain('引用文です');
    expect(out).not.toMatch(/>/);
  });

  it('パイプ | を読まない（空白に置換）', () => {
    const out = extractMdText('A | B の表', T);
    expect(out).toContain('A B の表');
    expect(out).not.toContain('|');
  });

  it('残存記号（* _ ~）を読まない', () => {
    const out = extractMdText('snake_case と star* と wave~ です', T);
    expect(out).toContain('snake case');
    expect(out).toContain('star');
    expect(out).toContain('wave');
    expect(out).not.toMatch(/[*_~]/);
  });
});

describe('extractMdText', () => {
  it('frontmatter を除去する', () => {
    const md = '---\ntitle: テスト\n---\n本文です';
    expect(extractMdText(md, T)).toBe('本文です');
  });

  it('v0.38.0: <style>...</style> ブロックを除去する', () => {
    const md = '前置き\n<style>.foo { color: red; }</style>\n後置き';
    const out = extractMdText(md, T);
    expect(out).toContain('前置き');
    expect(out).toContain('後置き');
    expect(out).not.toContain('color: red');
    expect(out).not.toContain('<style');
  });

  it('v0.38.0: <script>...</script> ブロックを除去する', () => {
    const md = '前置き\n<script>console.log("x")</script>\n後置き';
    const out = extractMdText(md, T);
    expect(out).toContain('前置き');
    expect(out).toContain('後置き');
    expect(out).not.toContain('console');
    expect(out).not.toContain('<script');
  });

  it('v0.38.0: 複数行 <style> と属性付き <style> も除去', () => {
    const md = 'A\n<style type="text/css">\n.x { font: bold; }\n.y { color: blue; }\n</style>\nB';
    const out = extractMdText(md, T);
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).not.toContain('font: bold');
    expect(out).not.toContain('color: blue');
  });

  it('v0.38.0: <style> が複数あっても全部除去', () => {
    const md = '前\n<style>.a{}</style>中\n<style>.b{}</style>後';
    const out = extractMdText(md, T);
    expect(out).toContain('前');
    expect(out).toContain('中');
    expect(out).toContain('後');
    expect(out).not.toMatch(/<style/);
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
