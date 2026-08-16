// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { serializeElementToMarkdown } from '../../../src/features/memory/serialize';

function md(html: string, exclude?: string[]): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return serializeElementToMarkdown(el, exclude);
}

describe('serializeElementToMarkdown', () => {
  it('見出し h1-h6 を # に変換する', () => {
    expect(md('<h1>見出し1</h1><h2>見出し2</h2>')).toBe('# 見出し1\n\n## 見出し2');
  });

  it('テーブルを MD テーブルに変換する', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    expect(md(html)).toBe('| A | B |\n| ------ | ------ |\n| 1 | 2 |');
  });

  it('コードブロック（.claudian-code-wrapper）をフェンスに変換する', () => {
    const html = '<div class="claudian-code-wrapper"><pre><code class="language-ts">const x = 1;\nconsole.log(x);</code></pre></div>';
    expect(md(html)).toBe('```ts\nconst x = 1;\nconsole.log(x);\n```');
  });

  it('callout を > [!type] に変換する', () => {
    const html = '<div class="callout" data-callout="note"><div class="callout-title">メモ</div><div class="callout-content"><p>内容</p></div></div>';
    expect(md(html)).toContain('> [!note] メモ');
    expect(md(html)).toContain('> 内容');
  });

  it('リスト（入れ子）を変換する', () => {
    const html = '<ul><li>項目1<ul><li>子項目</li></ul></li><li>項目2</li></ul>';
    expect(md(html)).toContain('- 項目1');
    expect(md(html)).toContain('  - 子項目');
  });

  it('インライン装飾（strong/em/code/a）を変換する', () => {
    expect(md('<p><strong>太字</strong>と<em>斜体</em>と<code>code</code>と<a href="https://x">リンク</a></p>'))
      .toBe('**太字**と*斜体*と`code`と[リンク](https://x)');
  });

  it('除外セレクタで UI ボタンを除く', () => {
    const html = '<p>本文</p><span class="claudian-text-copy-btn">copy</span>';
    expect(md(html, ['.claudian-text-copy-btn'])).toBe('本文');
  });
});
