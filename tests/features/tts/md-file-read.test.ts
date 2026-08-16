// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractMdText } from '../../../src/features/tts/md-file-read';
import { DEFAULT_SPEECH_FILTER_OPTIONS } from '../../../src/core/settings';
import type { SpeechFilterOptions } from '../../../src/core/settings';

const T: SpeechFilterOptions = { ...DEFAULT_SPEECH_FILTER_OPTIONS }; // table=true 他 false

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

  it('コールアウトを除去する（callout=false）', () => {
    const md = '本文\n> [!note] 注意\n> 中身\n末尾';
    expect(extractMdText(md, { ...T, callout: false })).not.toContain('注意');
  });
});
